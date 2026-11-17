import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Booking } from './types.ts';
import type { Motion } from './occupancy.ts';

export type DeviceState = {
  id: string;
  lastSeenAt: number;
  lastMotionAt: number | null;
  rssi: number;
  firmware: string;
};

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS device_state (
      id             TEXT PRIMARY KEY,
      last_seen_at   INTEGER NOT NULL,
      last_motion_at INTEGER,
      rssi           INTEGER NOT NULL DEFAULT 0,
      firmware       TEXT NOT NULL DEFAULT 'unknown'
    );
    CREATE TABLE IF NOT EXISTS motion (
      device_id TEXT NOT NULL,
      room_id   TEXT,
      at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS motion_at ON motion (at);
    CREATE TABLE IF NOT EXISTS booking (
      id      TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      start   INTEGER NOT NULL,
      end     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS booking_start ON booking (start);
  `);

  const upsertSeen = db.prepare(`
    INSERT INTO device_state (id, last_seen_at, rssi, firmware) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET last_seen_at = excluded.last_seen_at,
      rssi = excluded.rssi, firmware = excluded.firmware`);
  const setMotion = db.prepare(`UPDATE device_state SET last_motion_at = ? WHERE id = ?`);
  const insertMotion = db.prepare(`INSERT INTO motion (device_id, room_id, at) VALUES (?, ?, ?)`);
  const selectStates = db.prepare(`SELECT * FROM device_state`);
  const selectMotions = db.prepare(
    `SELECT room_id AS roomId, at FROM motion WHERE at >= ? AND room_id IS NOT NULL ORDER BY at`,
  );
  const selectBookings = db.prepare(
    `SELECT id, room_id AS roomId, start, end FROM booking WHERE end > ? AND start < ? ORDER BY start`,
  );
  const upsertBooking = db.prepare(`
    INSERT INTO booking (id, room_id, start, end) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET room_id = excluded.room_id, start = excluded.start, end = excluded.end`);
  const deleteBooking = db.prepare(`DELETE FROM booking WHERE id = ?`);

  return {
    recordEvent(e: { deviceId: string; roomId: string | null; type: 'heartbeat' | 'motion'; at: number; rssi: number; firmware: string }) {
      upsertSeen.run(e.deviceId, e.at, e.rssi, e.firmware);
      if (e.type === 'motion') {
        setMotion.run(e.at, e.deviceId);
        insertMotion.run(e.deviceId, e.roomId, e.at);
      }
    },

    deviceStates(): Map<string, DeviceState> {
      const out = new Map<string, DeviceState>();
      for (const r of selectStates.all() as Record<string, any>[]) {
        out.set(r.id, {
          id: r.id,
          lastSeenAt: r.last_seen_at,
          lastMotionAt: r.last_motion_at ?? null,
          rssi: r.rssi,
          firmware: r.firmware,
        });
      }
      return out;
    },

    motionsSince(t: number): Motion[] {
      return selectMotions.all(t) as Motion[];
    },

    bookingsBetween(from: number, to: number): Booking[] {
      return selectBookings.all(from, to) as Booking[];
    },

    saveBooking(b: Booking) {
      upsertBooking.run(b.id, b.roomId, b.start, b.end);
    },

    deleteBooking(id: string): boolean {
      return Number(deleteBooking.run(id).changes) > 0;
    },

    close() {
      db.close();
    },
  };
}

export type Db = ReturnType<typeof openDb>;
