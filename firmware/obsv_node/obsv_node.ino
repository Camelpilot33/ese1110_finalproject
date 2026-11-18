// Obsv sensor node: ESP32-C6-DevKitC-1 + HC-SR501 PIR motion sensor.
//
//   - Connects to Wi-Fi (reconnects on its own).
//   - Watches the PIR on PIR_PIN and shows it on the onboard RGB LED
//     (red = motion, dim green = idle, blue = Wi-Fi connecting).
//   - Reports to the Obsv server over HTTPS or HTTP, following the
//     scheme in SERVER_URL (when it is set):
//       POST {SERVER_URL}/api/events  {deviceId, type, rssi, firmware}
//     "heartbeat" every HEARTBEAT_MS, "motion" when the PIR goes high and
//     every MOTION_REPEAT_MS while it stays high. The server timestamps
//     events, so the board needs no clock.
//
// Wiring (HC-SR501, jumper on H, time knob fully counter-clockwise):
//   PIR VCC -> 5V, PIR OUT -> GPIO 2, PIR GND -> GND

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include "secrets.h"  // WIFI_SSID, WIFI_PASSWORD, SERVER_URL, DEVICE_TOKEN

#define FIRMWARE_VERSION "0.2.0"

constexpr uint8_t PIR_PIN = 2;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t HEARTBEAT_MS = 60000;
constexpr uint32_t MOTION_REPEAT_MS = 30000;
constexpr uint32_t RETRY_MS = 5000;
// A motion report not delivered within this long is dropped: the server
// stamps events on arrival, so a late one would land at the wrong time.
constexpr uint32_t MOTION_STALE_MS = 60000;
constexpr uint32_t STATUS_EVERY_MS = 30000;

volatile bool pirChanged = false;
bool motion = false;
uint32_t motionStartedAt = 0;
uint32_t lastWifiAttempt = 0;
uint32_t lastStatus = 0;

bool reporting = false;
bool useTls = false;
String deviceId;
uint32_t lastHeartbeat = 0;
uint32_t lastMotionSent = 0;
bool motionPending = false;
uint32_t motionPendingSince = 0;
uint32_t lastSendAttempt = 0;

void IRAM_ATTR onPirChange() { pirChanged = true; }

void setLed(uint8_t r, uint8_t g, uint8_t b) {
#ifdef RGB_BUILTIN
  rgbLedWrite(RGB_BUILTIN, r, g, b);
#endif
}

void showState() {
  if (motion) setLed(40, 0, 0);
  else if (WiFi.status() == WL_CONNECTED) setLed(0, 6, 0);
  else setLed(0, 0, 20);
}

bool wifiUp() { return WiFi.status() == WL_CONNECTED; }

void startWifi() {
  Serial.printf("[wifi] connecting to \"%s\"...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
}

void onWifiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.printf("[wifi] connected  ip=%s  rssi=%d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      lastHeartbeat = 0;  // announce ourselves right away
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println("[wifi] disconnected");
      break;
    default:
      break;
  }
  showState();
}

// "obsv-" + last three bytes of the base MAC, e.g. obsv-56c614.
String makeDeviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[16];
  snprintf(buf, sizeof buf, "obsv-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return String(buf);
}

bool sendEvent(const char* type) {
  if (!wifiUp()) return false;

  // https:// URLs go over TLS; http:// (e.g. a laptop on the same network
  // during testing) goes in the clear, token included.
  WiFiClientSecure tls;
  WiFiClient plain;
  // TODO: pin the host's root CA instead. Without it the link is encrypted
  // but the board does not check who it is talking to.
  tls.setInsecure();
  WiFiClient& client = useTls ? static_cast<WiFiClient&>(tls) : plain;

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  if (!http.begin(client, String(SERVER_URL) + "/api/events")) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);

  char body[160];
  snprintf(body, sizeof body,
           "{\"deviceId\":\"%s\",\"type\":\"%s\",\"rssi\":%d,\"firmware\":\"%s\"}",
           deviceId.c_str(), type, WiFi.RSSI(), FIRMWARE_VERSION);

  uint32_t t = millis();
  int code = http.POST(body);
  http.end();
  Serial.printf("[send] %-9s -> %d %s (%lu ms)\n", type, code,
                code > 0 ? "" : HTTPClient::errorToString(code).c_str(), millis() - t);
  return code >= 200 && code < 300;
}

void queueMotion(uint32_t now) {
  if (!motionPending) motionPendingSince = now;
  motionPending = true;
  lastSendAttempt = 0;  // try immediately
}

void serviceReporting(uint32_t now) {
  if (!reporting || !wifiUp()) return;

  if (motionPending && now - motionPendingSince > MOTION_STALE_MS) {
    Serial.println("[send] motion report too old, dropped");
    motionPending = false;
  }
  if (motionPending && (lastSendAttempt == 0 || now - lastSendAttempt > RETRY_MS)) {
    lastSendAttempt = now;
    if (sendEvent("motion")) {
      motionPending = false;
      lastMotionSent = now;
      lastHeartbeat = now;  // a motion report also counts as a heartbeat
    }
    return;
  }

  if (motion && !motionPending && now - lastMotionSent > MOTION_REPEAT_MS) {
    queueMotion(now);
    return;
  }

  if (lastHeartbeat == 0 || now - lastHeartbeat > HEARTBEAT_MS) {
    // On failure, try again in RETRY_MS rather than waiting a full minute.
    if (sendEvent("heartbeat")) lastHeartbeat = now;
    else lastHeartbeat = now - HEARTBEAT_MS + RETRY_MS;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.printf("\n=== Obsv node %s ===\n", FIRMWARE_VERSION);

  pinMode(PIR_PIN, INPUT_PULLDOWN);  // pulldown keeps it LOW if the PIR is unplugged
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), onPirChange, CHANGE);
  motion = digitalRead(PIR_PIN);

  WiFi.mode(WIFI_STA);
  deviceId = makeDeviceId();
  reporting = strlen(SERVER_URL) > 0;
  useTls = strncmp(SERVER_URL, "https://", 8) == 0;
  Serial.printf("[node] id=%s mac=%s\n", deviceId.c_str(), WiFi.macAddress().c_str());
  Serial.printf("[node] server=%s%s\n", reporting ? SERVER_URL : "(none: serial only)",
                reporting && !useTls ? "  (plain HTTP: not encrypted)" : "");
  WiFi.onEvent(onWifiEvent);
  startWifi();

  Serial.println("[pir] note: PIRs need ~30-60 s to settle after power-up");
  showState();
}

void loop() {
  uint32_t now = millis();

  if (pirChanged) {
    pirChanged = false;
    bool level = digitalRead(PIR_PIN);
    if (level != motion) {
      motion = level;
      if (motion) {
        motionStartedAt = now;
        Serial.printf("[pir] MOTION  t=%lus\n", now / 1000);
        if (reporting) queueMotion(now);
      } else {
        Serial.printf("[pir] idle    (high for %lu ms)\n", now - motionStartedAt);
      }
      showState();
    }
  }

  if (!wifiUp() && now - lastWifiAttempt > WIFI_RETRY_MS) {
    WiFi.disconnect();
    startWifi();
  }

  serviceReporting(now);

  if (now - lastStatus > STATUS_EVERY_MS) {
    lastStatus = now;
    Serial.printf("[status] up=%lus wifi=%s rssi=%d pir=%d\n", now / 1000,
                  wifiUp() ? "ok" : "down", wifiUp() ? WiFi.RSSI() : 0, motion);
  }

  delay(10);
}
