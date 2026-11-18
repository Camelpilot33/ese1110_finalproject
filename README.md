# Obsv

ESE 1110 Team 06. A PIR motion sensor in each Amy Gutmann Hall group study
room reports to a small server, and the app compares when rooms are booked
with when they are actually used.

| Folder | What |
| --- | --- |
| `mobile/` | The app (Expo: iOS, Android, web) |
| `server/` | Backend: takes sensor reports, serves `/api/snapshot` to the app |
| `firmware/obsv_node/` | ESP32-C6 + PIR sensor firmware |
| `scripts/` | `start.sh` and `flash.sh` below |

Needs Node 22.6 or newer on Linux.

## Start everything

```bash
scripts/start.sh
```

Starts the server (port 3000) and the app (port 8081), lists the sensors and
prints the addresses: the web app, the QR code for Expo Go, and the server
address to paste into the app under Settings -> Data source: Server.
`scripts/start.sh --no-app` runs only the server. Ctrl+C stops both.

## Add or reflash a sensor

Plug the board in over USB, then:

```bash
scripts/flash.sh
```

It reads the board's MAC address (the device id is `obsv-` plus its last six
hex digits), asks which room it is in (or adds a new room), writes that to
`server/config/rooms.json`, points the firmware at this computer's current
address, compiles, flashes and waits until the server hears from it. The first
run offers to install `arduino-cli` and the ESP32 board package, and asks for
the Wi-Fi name and password (saved in the git-ignored
`firmware/obsv_node/secrets.h`).

Options: `--room agh-204` skips the question, `--no-flash` only changes the
room, `--port /dev/ttyACM1` picks the board, and
`OBSV_SERVER_URL=https://...` reports somewhere other than this computer.

Wiring (HC-SR501): VCC -> 5V, OUT -> GPIO 2, GND -> GND.
