#!/usr/bin/env bash
# Starts the Obsv server and the app (web + Expo Go), and prints every URL you need.
#
#   scripts/start.sh            server + app
#   scripts/start.sh --no-app   server only (follows its log)
#
# Ctrl+C stops everything this script started.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

WITH_APP=1
for a in "$@"; do
  case "$a" in
    --no-app) WITH_APP=0 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) die "unknown option $a (try --help)" ;;
  esac
done

step "Checking tools"
need_node
ok "node $(node -v)"
ensure_env
if [ "$WITH_APP" = 1 ] && [ ! -d "$MOBILE_DIR/node_modules" ]; then
  say "  installing app dependencies (first run only)..."
  (cd "$MOBILE_DIR" && npm ci --no-audit --no-fund >/dev/null)
  ok "app dependencies installed"
fi

SERVER_PID=
APP_PID=
cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    say ""; say "Stopped the server."
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

step "Starting the server"
LOG="$SERVER_DIR/data/server.log"
mkdir -p "$SERVER_DIR/data"
if server_up; then
  warn "a server is already answering on port $SERVER_PORT; using that one"
else
  if ss -ltn "sport = :$SERVER_PORT" 2>/dev/null | grep -q LISTEN; then
    die "port $SERVER_PORT is taken by something that is not the Obsv server. Free it or run with PORT=xxxx."
  fi
  (
    cd "$SERVER_DIR"
    set -a; . ./.env; set +a
    export PORT="$SERVER_PORT"
    exec node --experimental-strip-types --disable-warning=ExperimentalWarning src/index.ts
  ) >>"$LOG" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 50); do server_up && break; sleep 0.2; done
  server_up || { tail -20 "$LOG" >&2; die "server did not start (log above, full log in server/data/server.log)"; }
  ok "server running (pid $SERVER_PID, log: server/data/server.log)"
fi

IP="$(lan_ip)"
SERVER_URL="http://$IP:$SERVER_PORT"

step "Sensors"
curl -fsS -m 3 "http://127.0.0.1:$SERVER_PORT/api/snapshot?days=0" | node -e '
  let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
    const snap = JSON.parse(s), now = snap.generatedAt;
    const ago = (t) => !t ? "never" : t > now - 90e3 ? `${Math.round((now - t) / 1e3)} s ago` : t > now - 5400e3 ? `${Math.round((now - t) / 60e3)} min ago` : new Date(t).toLocaleString();
    if (!snap.devices.length) console.log("  no sensors assigned yet: run scripts/flash.sh with a board plugged in");
    for (const d of snap.devices) {
      const room = snap.rooms.find((r) => r.id === d.roomId)?.name ?? d.roomId;
      const c = (code, t) => (process.stdout.isTTY ? `\x1b[${code}m${t}\x1b[0m` : t);
      const state = d.online ? c(32, "online ") : c(31, "offline");
      console.log(`  ${state} ${d.id.padEnd(13)} ${room.padEnd(10)} heard ${ago(d.lastSeenAt)}, motion ${ago(d.lastMotionAt)}${d.online ? `, ${d.rssi} dBm, fw ${d.firmware}` : ""}`);
    }
  });'

APP_STATUS="not started (--no-app)"
if [ "$WITH_APP" = 1 ]; then
  if curl -fsS -m 2 -o /dev/null "http://127.0.0.1:$APP_PORT" 2>/dev/null; then
    APP_STATUS="already running"
    WITH_APP=0
  else
    APP_STATUS="starting below"
  fi
fi

cat <<EOF

${B}Obsv is up${R}
  ${B}App in a browser${R}       http://localhost:$APP_PORT   (other devices on this network: http://$IP:$APP_PORT)  ${DIM}$APP_STATUS${R}
  ${B}App on a phone${R}         install Expo Go, scan the QR code printed below
  ${B}Server address${R}         $SERVER_URL
                         ${DIM}in the app: Settings -> Data source: Server -> paste that address${R}
  ${B}Raw data${R}               $SERVER_URL/api/snapshot?days=7
  ${B}Add a booking${R}          curl -X POST $SERVER_URL/api/bookings \\
                           -H "Authorization: Bearer \$(sed -n 's/^ADMIN_TOKEN=//p' server/.env)" \\
                           -H 'Content-Type: application/json' \\
                           -d '{"roomId":"agh-204","start":"$(date +%F)T14:00","end":"$(date +%F)T15:00"}'
  ${B}Add a sensor${R}           plug it in and run scripts/flash.sh
  ${B}Server log${R}             tail -f server/data/server.log
EOF

if [ "$WITH_APP" = 1 ]; then
  step "Starting the app (Expo). Press w to open the web app, Ctrl+C to stop everything."
  cd "$MOBILE_DIR"
  # Foreground so Expo can draw its QR code and take key presses.
  BROWSER=none npx expo start --web --port "$APP_PORT"
else
  step "Following the server log. Ctrl+C to stop."
  tail -n 0 -f "$LOG"
fi
