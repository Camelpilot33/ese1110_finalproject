#!/usr/bin/env bash
# Flashes the Obsv firmware onto the plugged-in ESP32, asks which room it is
# in, and registers it with the server (server/config/rooms.json, which a
# running server reloads by itself).
#
#   scripts/flash.sh                       interactive
#   scripts/flash.sh --room agh-204        no room question
#   scripts/flash.sh --port /dev/ttyACM1   pick the serial port
#   scripts/flash.sh --no-flash            only assign the room
#   OBSV_SERVER_URL=https://obsv.example.org scripts/flash.sh
#                                          report somewhere other than this computer
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PORT_ARG='' ROOM_ARG='' DO_FLASH=1
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT_ARG="${2:?}"; shift 2 ;;
    --room) ROOM_ARG="${2:?}"; shift 2 ;;
    --no-flash) DO_FLASH=0; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "unknown option $1 (try --help)" ;;
  esac
done

need_node
ensure_env

# ---------------------------------------------------------------- tools
step "Checking tools"
ESP_URL=https://espressif.github.io/arduino-esp32/package_esp32_index.json
if [ "$DO_FLASH" = 1 ]; then
  if ! command -v arduino-cli >/dev/null; then
    warn "arduino-cli is not installed"
    confirm "Download it from downloads.arduino.cc into ~/.local/bin?" || die "need arduino-cli to flash"
    mkdir -p "$HOME/.local/bin"
    curl -fsSL https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz | tar -xz -C "$HOME/.local/bin" arduino-cli
  fi
  ok "arduino-cli $(arduino-cli version | sed -n 's/.*Version: *\([^ ]*\).*/\1/p')"
  if ! arduino-cli core list 2>/dev/null | grep -q '^esp32:esp32'; then
    warn "the ESP32 board package is not installed (a few hundred MB)"
    confirm "Install it now from Espressif?" || die "need the esp32 core to flash"
    arduino-cli config init >/dev/null 2>&1 || true
    arduino-cli config add board_manager.additional_urls "$ESP_URL"
    arduino-cli core update-index
    arduino-cli core install esp32:esp32
  fi
  ok "esp32 core $(arduino-cli core list | awk '/^esp32:esp32/{print $2}')"
fi

ESPTOOL="$(command -v esptool || command -v esptool.py || ls -d "$HOME"/.arduino15/packages/esp32/tools/esptool_py/*/esptool 2>/dev/null | tail -1 || true)"
[ -n "$ESPTOOL" ] || die "esptool not found (it comes with the esp32 core: run without --no-flash once)"

# ---------------------------------------------------------------- board
step "Finding the board"
if [ -n "$PORT_ARG" ]; then
  PORT="$PORT_ARG"
else
  mapfile -t PORTS < <(ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null || true)
  [ "${#PORTS[@]}" -gt 0 ] || die "no board found. Plug it in with a data USB cable (not charge-only)."
  if [ "${#PORTS[@]}" -eq 1 ]; then
    PORT="${PORTS[0]}"
  else
    for i in "${!PORTS[@]}"; do say "  $((i + 1))) ${PORTS[$i]}"; done
    n="$(ask "Which port" 1)"
    PORT="${PORTS[$((n - 1))]:-}"; [ -n "$PORT" ] || die "no such port"
  fi
fi
[ -r "$PORT" ] && [ -w "$PORT" ] || die "no permission for $PORT. Run: sudo usermod -aG dialout \$USER, then log out and back in."

INFO="$("$ESPTOOL" --port "$PORT" read_mac 2>&1)" || { say "$INFO" >&2; die "could not talk to the board on $PORT (hold BOOT, tap RESET, release BOOT, and try again)"; }
CHIP="$(sed -n 's/^Chip is \(ESP32[-A-Z0-9]*\).*/\1/p' <<<"$INFO" | head -1)"
[ -n "$CHIP" ] || CHIP="$(sed -n 's/.*Detecting chip type\.\.\. *\(ESP32[-A-Z0-9]*\).*/\1/p' <<<"$INFO" | head -1)"
MAC="$(sed -n 's/^BASE MAC: *//p' <<<"$INFO" | head -1)"
[ -n "$MAC" ] || MAC="$(sed -n 's/^MAC: *//p' <<<"$INFO" | head -1)"
[ -n "$MAC" ] || { say "$INFO" >&2; die "could not read the MAC address"; }
# Same rule as the firmware: "obsv-" + last three bytes of the base MAC.
DEVICE_ID="obsv-$(tr -d ':' <<<"$MAC" | tail -c 7 | tr 'A-F' 'a-f')"
ok "$CHIP on $PORT"
ok "MAC $(tr 'a-f' 'A-F' <<<"$MAC")  ->  device id $B$DEVICE_ID$R"

case "$CHIP" in
  ESP32-C6) BOARD=esp32c6 ;;
  ESP32-C3) BOARD=esp32c3 ;;
  ESP32-S3) BOARD=esp32s3 ;;
  ESP32-S2) BOARD=esp32s2 ;;
  ESP32-H2) BOARD=esp32h2 ;;
  ESP32) BOARD=esp32 ;;
  *) die "unsupported chip \"$CHIP\"" ;;
esac
FQBN="esp32:esp32:$BOARD"
# Plugged into the chip's own USB port (Espressif USB id 303a): serial goes over USB CDC.
if [ "$BOARD" != esp32 ] && udevadm info -q property -n "$PORT" 2>/dev/null | grep -q '^ID_VENDOR_ID=303a'; then
  FQBN="$FQBN:CDCOnBoot=cdc"
fi
[ "$BOARD" = esp32c6 ] || warn "the firmware was written for the ESP32-C6 (PIR on GPIO 2); check that pin on this board"

# ---------------------------------------------------------------- room
step "Choosing the room"
ROOM_ID="$(ROOMS_JSON="$ROOMS_JSON" DEVICE_ID="$DEVICE_ID" ROOM_ARG="$ROOM_ARG" node -e '
  const fs = require("fs");
  const cfg = JSON.parse(fs.readFileSync(process.env.ROOMS_JSON, "utf8"));
  const cur = cfg.devices.find((d) => d.id === process.env.DEVICE_ID)?.roomId ?? "";
  let ttyFd;
  const tty = () => (ttyFd ??= fs.openSync("/dev/tty", "r+"));
  const out = (s) => fs.writeSync(tty(), s + "\n");
  const readLine = (q) => {
    fs.writeSync(tty(), "  " + q + " ");
    const buf = Buffer.alloc(1); let s = "";
    while (fs.readSync(tty(), buf, 0, 1) === 1 && buf[0] !== 10) s += String.fromCharCode(buf[0]);
    return s.trim();
  };
  let pick = process.env.ROOM_ARG;
  if (!pick) {
    out(cur ? `  ${process.env.DEVICE_ID} is currently in ${cur}.` : `  ${process.env.DEVICE_ID} is not assigned to a room yet.`);
    cfg.rooms.forEach((r, i) => {
      const others = cfg.devices.filter((d) => d.roomId === r.id && d.id !== process.env.DEVICE_ID).map((d) => d.id);
      out(`  ${String(i + 1).padStart(2)}) ${r.name.padEnd(10)} ${r.id.padEnd(10)} floor ${r.floor}, ${r.capacity} seats${others.length ? `  (sensor ${others.join(", ")})` : ""}`);
    });
    out("   n) new room");
    for (;;) {
      const a = readLine(`Which room is it in?${cur ? ` [Enter = keep ${cur}]` : ""}`);
      if (!a && cur) { pick = cur; break; }
      if (/^n(ew)?$/i.test(a)) { pick = ""; break; }
      const byNum = cfg.rooms[Number(a) - 1];
      const byId = cfg.rooms.find((r) => r.id === a || r.name.toLowerCase() === a.toLowerCase());
      if (byNum || byId) { pick = (byNum ?? byId).id; break; }
      out("  Type a number from the list, a room id, or n.");
    }
  }
  if (!pick || !cfg.rooms.some((r) => r.id === pick)) {
    if (pick) out(`  ${pick} is not in rooms.json yet; adding it.`);
    const name = readLine(`Room name (e.g. AGH 305)${pick ? ` [${pick.toUpperCase().replace("-", " ")}]` : ""}:`) || pick.toUpperCase().replace("-", " ");
    if (!name) { out("  A room needs a name."); process.exit(1); }
    const id = pick || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const floorGuess = (name.match(/\d/) ?? ["0"])[0];
    const floor = Number(readLine(`Floor [${floorGuess}]:`) || floorGuess);
    const capacity = Number(readLine("Seats [6]:") || 6);
    cfg.rooms.push({ id, name, floor: Number.isFinite(floor) ? floor : 0, capacity: Number.isFinite(capacity) ? capacity : 0 });
    pick = id;
  }
  cfg.devices = cfg.devices.filter((d) => d.id !== process.env.DEVICE_ID);
  cfg.devices.push({ id: process.env.DEVICE_ID, roomId: pick });
  const tmp = process.env.ROOMS_JSON + ".tmp";
  // One room / device per line, the same layout as the hand-written file.
  const block = (name, list) => `  "${name}": [\n${list.map((o) => "    " + JSON.stringify(o).replace(/":/g, "\": ").replace(/,"/g, ", \"").replace(/^\{/, "{ ").replace(/\}$/, " }")).join(",\n")}\n  ]`;
  fs.writeFileSync(tmp, `{\n${block("rooms", cfg.rooms)},\n${block("devices", cfg.devices)}\n}\n`);
  fs.renameSync(tmp, process.env.ROOMS_JSON);
  process.stdout.write(pick);
')"
ok "$DEVICE_ID -> $ROOM_ID (saved in server/config/rooms.json)"

# ---------------------------------------------------------------- flash
if [ "$DO_FLASH" = 1 ]; then
  step "Wi-Fi and server settings"
  SECRETS="$FIRMWARE_DIR/secrets.h"
  if [ ! -f "$SECRETS" ]; then
    cp "$FIRMWARE_DIR/secrets.example.h" "$SECRETS"; chmod 600 "$SECRETS"
    SSID="$(ask "Wi-Fi network" "AirPennNet-Device")"
    read -r -s -p "  Wi-Fi password: " WPASS </dev/tty; echo
    SET_WIFI=1
  else
    ok "using Wi-Fi settings in firmware/obsv_node/secrets.h ($(sed -n 's/^#define WIFI_SSID "\(.*\)"/\1/p' "$SECRETS"))"
    SET_WIFI=0; SSID=; WPASS=
  fi
  URL="${OBSV_SERVER_URL:-http://$(lan_ip):$SERVER_PORT}"
  ok "the board will report to $URL"
  SECRETS="$SECRETS" SET_WIFI="$SET_WIFI" SSID="$SSID" WPASS="$WPASS" URL="$URL" TOKEN="$(env_value DEVICE_TOKEN)" node -e '
    const fs = require("fs"); const e = process.env;
    let s = fs.readFileSync(e.SECRETS, "utf8");
    const set = (name, value) => {
      const line = `#define ${name} ${JSON.stringify(value)}`;
      const re = new RegExp(`^#define ${name} .*$`, "m");
      s = re.test(s) ? s.replace(re, () => line) : s + line + "\n";
    };
    if (e.SET_WIFI === "1") { set("WIFI_SSID", e.SSID); set("WIFI_PASSWORD", e.WPASS); }
    set("SERVER_URL", e.URL);
    set("DEVICE_TOKEN", e.TOKEN);
    fs.writeFileSync(e.SECRETS, s);
  '

  step "Compiling and flashing ($FQBN)"
  BUILD="$ROOT/firmware/build/$BOARD"
  if ! OUT="$(arduino-cli compile --fqbn "$FQBN" --build-path "$BUILD" "$FIRMWARE_DIR" 2>&1)"; then
    say "$OUT" >&2; die "compile failed"
  fi
  ok "$(grep -m1 'Sketch uses' <<<"$OUT" || echo compiled)"
  if ! OUT="$(arduino-cli upload --fqbn "$FQBN" -p "$PORT" --input-dir "$BUILD" "$FIRMWARE_DIR" 2>&1)"; then
    say "$OUT" >&2; die "upload failed (if it keeps failing: hold BOOT, tap RESET, release BOOT, retry)"
  fi
  ok "flashed and verified"
  FLASHED_AT="$(date +%s%3N)"
fi

# ---------------------------------------------------------------- check
step "Waiting for $DEVICE_ID to report"
SINCE="${FLASHED_AT:-0}"
if ! server_up; then
  warn "the server is not running on this computer. Start it with scripts/start.sh; the board will show up once it is."
  exit 0
fi
for i in $(seq 45); do
  STATE="$(curl -fsS -m 3 "http://127.0.0.1:$SERVER_PORT/api/snapshot?days=0" | DEVICE_ID="$DEVICE_ID" ROOM_ID="$ROOM_ID" SINCE="$SINCE" node -e '
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      const snap = JSON.parse(s); const d = snap.devices.find((x) => x.id === process.env.DEVICE_ID);
      // After a flash, only a heartbeat from the new firmware counts.
      // The server must also have picked up the new room from rooms.json.
      const fresh = d && d.online && d.roomId === process.env.ROOM_ID && d.lastSeenAt > Number(process.env.SINCE);
      process.stdout.write(!d ? "missing" : fresh ? `ok ${d.roomId} ${d.rssi} ${d.firmware}` : "waiting");
    });' || echo waiting)"
  case "$STATE" in
    ok\ *) read -r _ r rssi fw <<<"$STATE"; printf "\r\033[K"; ok "online in $r, signal $rssi dBm, firmware $fw"; say ""; say "${GRN}Done.${R} The app will show it within one refresh."; exit 0 ;;
  esac
  printf '\r  ...%2ds' $((i * 2)); sleep 2
done
echo
warn "no heartbeat after 90 s. Watch the board's output with:"
say "    arduino-cli monitor -p $PORT -c baudrate=115200"
exit 1
