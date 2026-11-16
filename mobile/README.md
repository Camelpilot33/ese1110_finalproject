# Obsv mobile app

The iOS and Android app for Obsv (ESE 1110 Team 06). Obsv puts a PIR motion sensor
in each group study room in Amy Gutmann Hall and compares when rooms are **booked**
with when they are **actually used**.

Built with Expo (SDK 58), React Native and TypeScript. One codebase runs on iOS,
Android and the web.

## Run it

```bash
npm install
```

```bash
npx expo start
```

Then either scan the QR code with **Expo Go** on a phone (same Wi-Fi as this
computer), or press `w` to open it in a browser. No Mac is needed for
development; building the iOS app for the App Store is done in the cloud with
`npx eas-cli build`.

The app starts in **Demo** mode with simulated rooms, so every screen works
before any hardware exists.

## What is in the app

| Screen | For | Shows |
| --- | --- | --- |
| Rooms | Everyone | Live status of every room, grouped by floor. Filter to rooms that are empty right now, or to favorites. |
| Room | Everyone | Today's booked-vs-occupied timeline, each booking and how it turned out, the last 7 days, and the room's sensor. Step back day by day. |
| Insights | Admin | Booked vs. used hours, no-show rate, walk-in use, a per-day chart, which hours have the most empty bookings, and a per-room ranking. |
| Sensors | Admin | Health of each unit: online or offline, last heartbeat, last motion, Wi-Fi signal, firmware. |
| Settings | Everyone | Student or Admin view, Demo or Server data, refresh rate, and how long without motion counts as empty. |

A room is always in one of these states:

| State | Meaning |
| --- | --- |
| Free | Not booked, nobody there |
| In use | Somebody is there (booked or walk-in) |
| Booked | Booking started under 10 minutes ago and nobody has arrived yet |
| **Booked, empty** | Booked, past the grace period, and nobody is there |
| No data | The sensor is offline or not installed |

## Connecting real sensors

The app reads everything from one endpoint. In Settings, switch the data source
to **Server** and enter the server address.

```
GET {server}/api/snapshot?days=7
```

```jsonc
{
  "generatedAt": 1794857000000,
  "days": 7,
  "rooms":   [{ "id": "agh-204", "name": "AGH 204", "floor": 2, "capacity": 6 }],
  "devices": [{
    "id": "obsv-01", "roomId": "agh-204", "online": true,
    "lastSeenAt": 1794856995000,     // last heartbeat from the ESP32
    "lastMotionAt": 1794856990000,   // last time the PIR fired, or null
    "rssi": -55, "firmware": "0.3.1"
  }],
  // Reservations from the booking system, including the rest of today.
  "bookings":  [{ "id": "b1", "roomId": "agh-204", "start": 1794852000000, "end": 1794855600000 }],
  // Stretches the sensor saw the room occupied. Use "end": null for a visit still going on.
  "occupancy": [{ "roomId": "agh-204", "start": 1794852300000, "end": 1794855000000 }]
}
```

Timestamps may be epoch milliseconds, epoch seconds, or ISO 8601 strings.
Bookings carry no names: the app never shows who booked a room.

Two things to know when pointing a phone at your own server:

- The browser version needs the server to send CORS headers
  (`Access-Control-Allow-Origin`). The phone apps do not.
- Plain `http://` addresses work in Expo Go, but store builds of iOS and Android
  block them by default. Serve the API over `https://` before shipping.

## Project layout

```
src/
  app/                 Screens (Expo Router: every file is a route)
    (tabs)/            Rooms, Insights, Sensors, Settings
    room/[id].tsx      Room detail
  components/          UI kit and charts (plain Views, no chart library)
  constants/theme.ts   Colors for light and dark mode, spacing
  lib/
    types.ts           Data model shared by the demo and the server
    stats.ts           Room status and booked-vs-used math
    demo.ts            Simulated data for Demo mode
    api.ts             Server client and response parsing
  state/               Settings (saved on the device) and data loading
```

## Checks

```bash
npm run typecheck
```

```bash
npx eslint .
```

## Not done yet

- The app icon and splash image are still the Expo placeholders.
- There is no login: the Admin view is a switch in Settings, not a protected role.
- Room names in Demo mode are placeholders, not the real AGH room numbers.
