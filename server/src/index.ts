// Room times are local to campus, whatever zone the host runs in.
process.env.TZ ??= 'America/New_York';

import { readFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, defaultOptions } from './app.ts';
import { openDb } from './db.ts';
import type { Config } from './types.ts';

const env = process.env;
const port = Number(env.PORT ?? 3000);
const configPath = env.CONFIG_PATH ?? fileURLToPath(new URL('../config/rooms.json', import.meta.url));

/** Reads rooms.json and checks that every device points at a known room. */
function loadConfig(): Config {
  const c = JSON.parse(readFileSync(configPath, 'utf8')) as Config;
  if (!Array.isArray(c.rooms) || !Array.isArray(c.devices)) throw new Error('needs "rooms" and "devices" lists');
  const rooms = new Set(c.rooms.map((r) => r.id));
  for (const d of c.devices) {
    if (!rooms.has(d.roomId)) throw new Error(`device ${d.id} is in unknown room "${d.roomId}"`);
  }
  return c;
}

const config = loadConfig();
const db = openDb(env.DB_PATH ?? 'data/obsv.db');

if (!env.DEVICE_TOKEN) console.warn('[obsv] DEVICE_TOKEN not set: anyone can post sensor events');
if (!env.ADMIN_TOKEN) console.warn('[obsv] ADMIN_TOKEN not set: booking edits are disabled');

const handle = createApp(db, config, {
  ...defaultOptions,
  deviceToken: env.DEVICE_TOKEN,
  adminToken: env.ADMIN_TOKEN,
});

// Pick up edits to rooms.json (e.g. from scripts/flash.sh) without a restart.
// Watch the folder, not the file: editors often replace the file on save.
let reloadTimer: NodeJS.Timeout | undefined;
watch(dirname(configPath), (_event, file) => {
  if (file !== basename(configPath)) return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try {
      const next = loadConfig();
      handle.setConfig(next);
      console.log(`[obsv] reloaded ${basename(configPath)}: rooms=${next.rooms.length} devices=${next.devices.length}`);
    } catch (e) {
      console.error(`[obsv] ignoring bad ${basename(configPath)}: ${(e as Error).message}`);
    }
  }, 200);
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
