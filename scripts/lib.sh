# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are used by the scripts that source this
# Shared helpers for start.sh and flash.sh. Source it, don't run it.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT/server"
MOBILE_DIR="$ROOT/mobile"
FIRMWARE_DIR="$ROOT/firmware/obsv_node"
ROOMS_JSON="$SERVER_DIR/config/rooms.json"
ENV_FILE="$SERVER_DIR/.env"
SERVER_PORT="${PORT:-3000}"
APP_PORT="${APP_PORT:-8081}"
export PATH="$HOME/.local/bin:$PATH"

if [ -t 1 ]; then
  B=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'; R=$'\e[0m'
else
  B=; DIM=; RED=; GRN=; YEL=; CYN=; R=
fi

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$CYN" "$R" "$B" "$*" "$R"; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$R" "$*"; }
warn() { printf '  %s!%s %s\n' "$YEL" "$R" "$*"; }
die()  { printf '%serror:%s %s\n' "$RED" "$R" "$*" >&2; exit 1; }

ask() { # ask "Question" default -> echoes answer
  local q="$1" def="${2-}" a
  if [ -n "$def" ]; then read -r -p "  $q [$def]: " a </dev/tty || a=; else read -r -p "  $q: " a </dev/tty || a=; fi
  printf '%s' "${a:-$def}"
}

confirm() { # confirm "Question" -> 0 for yes (default yes)
  local a
  read -r -p "  $1 [Y/n]: " a </dev/tty || a=
  [[ -z "$a" || "$a" =~ ^[Yy] ]]
}

need_node() {
  command -v node >/dev/null || die "Node.js is not installed (need 22.6 or newer)."
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || die "Node $(node -v) is too old; the server needs 22.6 or newer."
}

# This machine's address on the local network (what phones and sensors connect to).
lan_ip() {
  local ip
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)"
  [ -n "$ip" ] || ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  printf '%s' "${ip:-127.0.0.1}"
}

# Creates server/.env with random tokens the first time.
ensure_env() {
  if [ ! -f "$ENV_FILE" ]; then
    (umask 077; printf 'DEVICE_TOKEN=%s\nADMIN_TOKEN=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" >"$ENV_FILE")
    ok "created server/.env with new device and admin tokens"
  fi
}

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | head -1; }

server_up() { curl -fsS -m 2 "http://127.0.0.1:$SERVER_PORT/api/health" >/dev/null 2>&1; }
