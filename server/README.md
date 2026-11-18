# Obsv server

Collects heartbeats and motion reports from the ESP32 sensor nodes and serves
`GET /api/snapshot`, the one endpoint the mobile app reads (format in
`../mobile/README.md`).

Node 22.6+ only: TypeScript runs directly (`--experimental-strip-types`) and
storage is Node's built-in SQLite. No runtime dependencies.

## Run

The easy way, from the repo root: `scripts/start.sh` (creates `.env` with
tokens, starts this server and the app, prints the addresses). By hand:

```bash
npm install        # dev tools only (typescript, @types/node)
DEVICE_TOKEN=... ADMIN_TOKEN=... npm start
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DEVICE_TOKEN` | unset | Secret the sensors send as `Authorization: Bearer ...`. Unset = anyone can post events. |
| `ADMIN_TOKEN` | unset | Secret for editing bookings. Unset = booking edits disabled. |
| `DB_PATH` | `data/obsv.db` | SQLite file. Must be on persistent storage in production. |
| `CONFIG_PATH` | `config/rooms.json` | Rooms, and which device is in which room |
| `TZ` | `America/New_York` | Defines "today" for the snapshot window |

## API

| Method | Path | Auth | Body / query |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | |
| `GET` | `/api/snapshot?days=7` | none | |
| `POST` | `/api/events` | device | `{"deviceId":"obsv-56c614","type":"heartbeat"\|"motion","rssi":-60,"firmware":"0.2.0"}` |
| `POST` | `/api/bookings` | admin | one booking or a list: `{"id"?, "roomId", "start", "end"}` (ms, s or ISO) |
| `DELETE` | `/api/bookings/:id` | admin | |

The server timestamps events when they arrive. A device is online if it has
been heard from in the last 3 minutes. Motions less than 10 minutes apart are
merged into one occupied stretch; a stretch whose last motion was under
10 minutes ago is still open (`end: null`).

New sensor: plug it in and run `scripts/flash.sh` from the repo root. It
flashes the board, asks which room it is in and writes the assignment to
`config/rooms.json`. To do it by hand, add `{ "id": "obsv-xxxxxx", "roomId": "..." }`
there; the id is printed on the board's serial output at boot. A running
server reloads `rooms.json` when it changes (a file with errors is ignored
and logged).

## Checks

```bash
npm test
npm run typecheck
```
