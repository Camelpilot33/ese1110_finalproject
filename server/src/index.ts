// Room times are local to campus, whatever zone the host runs in.
process.env.TZ ??= 'America/New_York';

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createApp, defaultOptions } from './app.ts';
import { openDb } from './db.ts';
import type { Config } from './types.ts';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const config: Config = JSON.parse(
  readFileSync(env.CONFIG_PATH ?? new URL('../config/rooms.json', import.meta.url), 'utf8'),
);
const db = openDb(env.DB_PATH ?? 'data/obsv.db');

if (!env.DEVICE_TOKEN) console.warn('[obsv] DEVICE_TOKEN not set: anyone can post sensor events');
if (!env.ADMIN_TOKEN) console.warn('[obsv] ADMIN_TOKEN not set: booking edits are disabled');

const handle = createApp(db, config, {
  ...defaultOptions,
  deviceToken: env.DEVICE_TOKEN,
  adminToken: env.ADMIN_TOKEN,
});

const server = createServer(handle);
server.listen(port, () => {
  console.log(`[obsv] listening on :${port}  rooms=${config.rooms.length} devices=${config.devices.length} tz=${env.TZ}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
