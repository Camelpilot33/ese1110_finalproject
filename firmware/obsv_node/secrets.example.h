// Copy to secrets.h (gitignored) and fill in.
#pragma once
#define WIFI_SSID "AirPennNet-Device"
#define WIFI_PASSWORD "your-wifi-password"

// Obsv server, no trailing slash: https://... for a real deployment, or
// http://<laptop-ip>:3000 for testing on the same network (sent unencrypted).
// Leave empty ("") to run without reporting (serial output only).
#define SERVER_URL ""
// Must match the server's DEVICE_TOKEN environment variable.
#define DEVICE_TOKEN "change-me"
