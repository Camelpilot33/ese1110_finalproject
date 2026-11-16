/**
 * Client for the Obsv server. The whole app runs off one endpoint:
 *
 *   GET {baseUrl}/api/snapshot?days=14  ->  Snapshot (see types.ts)
 *
 * The parser is forgiving about timestamps (epoch ms, epoch seconds or ISO
 * strings) so the backend can use whatever is convenient.
 */
import type { Booking, Device, Interval, Room, Snapshot } from './types';

const TIMEOUT_MS = 8000;

export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(what: string): never {
  throw new Error(`Unexpected server response: ${what}`);
}

function toTime(v: unknown, what: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Anything this small can only be seconds, not milliseconds.
    return v < 1e11 ? v * 1000 : v;
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return fail(`${what} is not a timestamp`);
}

function toString(v: unknown, what: string): string {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return fail(`${what} is missing`);
}

function toNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function list(v: unknown, what: string): Json[] {
  if (!Array.isArray(v)) return fail(`"${what}" is not a list`);
  return v.map((item, i) => (isObject(item) ? item : fail(`${what}[${i}] is not an object`)));
}

function parseInterval(o: Json, what: string): Interval {
  return {
    roomId: toString(o.roomId, `${what}.roomId`),
    start: toTime(o.start, `${what}.start`),
    end: toTime(o.end, `${what}.end`),
  };
}

export function parseSnapshot(data: unknown, now: number): Snapshot {
  if (!isObject(data)) return fail('not a JSON object');

  const generatedAt = data.generatedAt === undefined ? now : toTime(data.generatedAt, 'generatedAt');

  const rooms: Room[] = list(data.rooms, 'rooms').map((o, i) => {
    const id = toString(o.id, `rooms[${i}].id`);
    return {
      id,
      name: typeof o.name === 'string' && o.name ? o.name : id,
      floor: toNumber(o.floor, 0),
      capacity: toNumber(o.capacity, 0),
    };
  });

  const devices: Device[] = list(data.devices ?? [], 'devices').map((o, i) => {
    const what = `devices[${i}]`;
    return {
      id: toString(o.id, `${what}.id`),
      roomId: toString(o.roomId, `${what}.roomId`),
      online: o.online === true,
      lastSeenAt: toTime(o.lastSeenAt, `${what}.lastSeenAt`),
      lastMotionAt: o.lastMotionAt == null ? null : toTime(o.lastMotionAt, `${what}.lastMotionAt`),
      rssi: toNumber(o.rssi, 0),
      firmware: typeof o.firmware === 'string' ? o.firmware : 'unknown',
    };
  });

  const bookings: Booking[] = list(data.bookings ?? [], 'bookings').map((o, i) => {
    const interval = parseInterval(o, `bookings[${i}]`);
    return { ...interval, id: o.id == null ? `${interval.roomId}-${interval.start}` : String(o.id) };
  });

  const occupancy: Interval[] = list(data.occupancy ?? [], 'occupancy').map((o, i) => {
    // An open visit may be sent with `end: null`; it runs up to the snapshot time.
    const open = o.end == null ? { ...o, end: generatedAt } : o;
    return parseInterval(open, `occupancy[${i}]`);
  });

  return {
    generatedAt,
    days: toNumber(data.days, 0),
    rooms,
    devices,
    bookings,
    occupancy,
  };
}

export async function fetchSnapshot(baseUrl: string, days: number): Promise<Snapshot> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('No server address set. Add one in Settings.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/snapshot?days=${days}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Server responded with ${res.status}.`);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error('Server did not return JSON.');
    }
    return parseSnapshot(body, Date.now());
  } catch (e) {
    if (controller.signal.aborted) throw new Error('Server did not respond in time.');
    if (e instanceof TypeError) throw new Error(`Could not reach ${base}.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
