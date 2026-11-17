import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Db } from './db.ts';
import { buildOccupancy } from './occupancy.ts';
import type { Booking, Config, Snapshot } from './types.ts';

const MINUTE = 60_000;

export type AppOptions = {
  /** Shared secret the sensors send as `Authorization: Bearer ...`. Unset = no check (dev only). */
  deviceToken?: string;
  /** Secret for editing bookings. Unset = booking edits disabled. */
  adminToken?: string;
  /** A device with no heartbeat for this long is offline. */
  offlineAfterMs: number;
  gapMs: number;
  tailMs: number;
  maxDays: number;
  now?: () => number;
};

export const defaultOptions: AppOptions = {
  offlineAfterMs: 3 * MINUTE,
  gapMs: 10 * MINUTE,
  tailMs: 2 * MINUTE,
  maxDays: 60,
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_BODY = 64 * 1024;

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function tokenMatches(req: IncomingMessage, expected: string): boolean {
  const got = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function toTime(v: unknown, what: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  throw new HttpError(400, `${what} is not a timestamp`);
}

/** Local midnight `n` days after the day containing `t` (uses process TZ). */
function dayStart(t: number, n = 0): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function createApp(db: Db, config: Config, opts: AppOptions) {
  const now = opts.now ?? Date.now;
  const roomOf = new Map(config.devices.map((d) => [d.id, d.roomId]));
  const roomIds = new Set(config.rooms.map((r) => r.id));

  function snapshot(days: number): Snapshot {
    const t = now();
    const from = dayStart(t, -days);
    const to = dayStart(t, 1);
    const states = db.deviceStates();

    const occupancy = buildOccupancy(db.motionsSince(from - opts.gapMs), t, opts)
      .filter((i) => i.end === null || i.end > from)
      .map((i) => ({ ...i, start: Math.max(i.start, from) }));

    return {
      generatedAt: t,
      days,
      rooms: config.rooms,
      devices: config.devices.map((d) => {
        const s = states.get(d.id);
        return {
          id: d.id,
          roomId: d.roomId,
          online: !!s && t - s.lastSeenAt < opts.offlineAfterMs,
          lastSeenAt: s?.lastSeenAt ?? 0,
          lastMotionAt: s?.lastMotionAt ?? null,
          rssi: s?.rssi ?? 0,
          firmware: s?.firmware ?? 'unknown',
        };
      }),
      bookings: db.bookingsBetween(from, to),
      occupancy,
    };
  }

  function parseEvent(body: unknown) {
    if (typeof body !== 'object' || body === null) throw new HttpError(400, 'Expected a JSON object');
    const o = body as Record<string, unknown>;
    if (typeof o.deviceId !== 'string' || !/^[\w.-]{1,64}$/.test(o.deviceId))
      throw new HttpError(400, 'deviceId is missing or invalid');
    if (o.type !== 'heartbeat' && o.type !== 'motion')
      throw new HttpError(400, 'type must be "heartbeat" or "motion"');
    return {
      deviceId: o.deviceId,
      type: o.type,
      rssi: typeof o.rssi === 'number' ? Math.round(o.rssi) : 0,
      firmware: typeof o.firmware === 'string' ? o.firmware.slice(0, 32) : 'unknown',
    } as const;
  }

  function parseBooking(o: unknown, i: number): Booking {
    if (typeof o !== 'object' || o === null) throw new HttpError(400, `bookings[${i}] is not an object`);
    const b = o as Record<string, unknown>;
    if (typeof b.roomId !== 'string' || !roomIds.has(b.roomId))
      throw new HttpError(400, `bookings[${i}].roomId is not a known room`);
    const start = toTime(b.start, `bookings[${i}].start`);
    const end = toTime(b.end, `bookings[${i}].end`);
    if (end <= start) throw new HttpError(400, `bookings[${i}] ends before it starts`);
    const id = b.id == null ? `${b.roomId}-${start}` : String(b.id);
    return { id, roomId: b.roomId, start, end };
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'OPTIONS') return send(res, 204);

      if (req.method === 'GET' && (path === '/' || path === '/api/health'))
        return send(res, 200, { ok: true, time: now() });

      if (req.method === 'GET' && path === '/api/snapshot') {
        const raw = Number(url.searchParams.get('days') ?? 7);
        const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 0), opts.maxDays) : 7;
        return send(res, 200, snapshot(days));
      }

      if (req.method === 'POST' && path === '/api/events') {
        if (opts.deviceToken && !tokenMatches(req, opts.deviceToken)) throw new HttpError(401, 'Bad device token');
        const e = parseEvent(await readJson(req));
        const roomId = roomOf.get(e.deviceId) ?? null;
        if (!roomId) console.warn(`[events] ${e.deviceId} is not assigned to a room in config`);
        db.recordEvent({ ...e, roomId, at: now() });
        return send(res, 200, { ok: true, roomId });
      }

      if (path === '/api/bookings' || path.startsWith('/api/bookings/')) {
        if (!opts.adminToken) throw new HttpError(403, 'Booking edits are disabled (no ADMIN_TOKEN set)');
        if (!tokenMatches(req, opts.adminToken)) throw new HttpError(401, 'Bad admin token');

        if (req.method === 'POST' && path === '/api/bookings') {
          const body = await readJson(req);
          const list = Array.isArray(body) ? body : [body];
          const bookings = list.map(parseBooking);
          for (const b of bookings) db.saveBooking(b);
          return send(res, 200, { ok: true, saved: bookings.length, ids: bookings.map((b) => b.id) });
        }
        if (req.method === 'DELETE' && path.startsWith('/api/bookings/')) {
          const id = decodeURIComponent(path.slice('/api/bookings/'.length));
          if (!db.deleteBooking(id)) throw new HttpError(404, 'No such booking');
          return send(res, 200, { ok: true });
        }
      }

      throw new HttpError(404, 'Not found');
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      return send(res, 500, { error: 'Internal error' });
    }
  };
}
