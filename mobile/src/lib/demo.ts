/**
 * Built-in simulator so the app is fully usable before any hardware is deployed.
 *
 * Every (room, calendar day) pair is generated from its own seed, so the data
 * is stable: refreshing never reshuffles history, and "now" simply moves
 * through a fixed plan for today.
 */
import { addDays, atHour, DAY_END_HOUR, DAY_START_HOUR, MINUTE } from './time';
import type { Booking, Device, Interval, Room, Snapshot } from './types';

const SLOT = 30 * MINUTE;
const SLOTS_PER_DAY = (DAY_END_HOUR - DAY_START_HOUR) * 2;

/** Placeholder rooms. Real room names come from the server. */
const ROOMS: (Room & { popularity: number })[] = [
  { id: 'agh-204', name: 'AGH 204', floor: 2, capacity: 6, popularity: 0.95 },
  { id: 'agh-206', name: 'AGH 206', floor: 2, capacity: 4, popularity: 0.85 },
  { id: 'agh-212', name: 'AGH 212', floor: 2, capacity: 8, popularity: 0.75 },
  { id: 'agh-304', name: 'AGH 304', floor: 3, capacity: 6, popularity: 0.9 },
  { id: 'agh-306', name: 'AGH 306', floor: 3, capacity: 4, popularity: 0.7 },
  { id: 'agh-312', name: 'AGH 312', floor: 3, capacity: 8, popularity: 0.8 },
  { id: 'agh-404', name: 'AGH 404', floor: 4, capacity: 6, popularity: 0.65 },
  { id: 'agh-406', name: 'AGH 406', floor: 4, capacity: 4, popularity: 0.75 },
  { id: 'agh-504', name: 'AGH 504', floor: 5, capacity: 6, popularity: 0.55 },
  { id: 'agh-506', name: 'AGH 506', floor: 5, capacity: 4, popularity: 0.6 },
];

/** This room's sensor is shown as offline so that state is visible in the demo. */
const OFFLINE_ROOM = 'agh-404';
const OFFLINE_FOR = 140 * MINUTE;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayKey(dayStart: number): number {
  const d = new Date(dayStart);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** How likely a free half-hour slot is to get booked, by time of day. */
function demandAt(hour: number): number {
  if (hour < 10) return 0.22;
  if (hour < 12) return 0.45;
  if (hour < 17) return 0.68;
  if (hour < 21) return 0.78;
  return 0.4;
}

type Span = { start: number; end: number };

function planDay(roomIdx: number, dayStart: number): { bookings: Span[]; visits: Span[] } {
  const rng = mulberry32(Math.imul(dayKey(dayStart), 0x9e3779b1) ^ Math.imul(roomIdx + 1, 0x85ebca6b));
  // Nearby seeds start out correlated; throw the first few values away.
  for (let i = 0; i < 8; i++) rng();
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const weekday = new Date(dayStart).getDay();
  const weekend = weekday === 0 || weekday === 6;
  const popularity = ROOMS[roomIdx].popularity * (weekend ? 0.55 : 1);
  const open = atHour(dayStart, DAY_START_HOUR);

  const bookings: Span[] = [];
  const visits: Span[] = [];

  let slot = 0;
  while (slot < SLOTS_PER_DAY) {
    const hour = DAY_START_HOUR + slot / 2;
    const demand = demandAt(hour) * popularity;

    if (rng() < demand) {
      const length = Math.min([2, 2, 3, 3, 4][Math.floor(rng() * 5)], SLOTS_PER_DAY - slot);
      const start = open + slot * SLOT;
      const end = start + length * SLOT;
      bookings.push({ start, end });

      // Mornings and late nights are the most likely to be abandoned.
      const noShow = 0.22 + (hour < 11 ? 0.14 : 0) + (hour >= 21 ? 0.08 : 0);
      const roll = rng();
      if (roll >= noShow) {
        if (roll < noShow + 0.22) {
          // Shows up late and leaves well before the booking ends.
          const arrive = start + between(5, 25) * MINUTE;
          const stay = (end - start) * between(0.3, 0.65);
          visits.push({ start: arrive, end: Math.min(end, arrive + stay) });
        } else {
          const arrive = start + between(-2, 9) * MINUTE;
          const leave = end - between(-3, 18) * MINUTE;
          visits.push({ start: arrive, end: leave });
        }
      }
      slot += length;
    } else {
      if (rng() < 0.09 * popularity) {
        // Someone wanders into an unbooked room for a bit.
        const start = open + slot * SLOT + between(0, 10) * MINUTE;
        visits.push({ start, end: start + between(12, 26) * MINUTE });
      }
      slot += 1;
    }
  }
  return { bookings, visits };
}

export function generateDemoSnapshot(now: number, days: number): Snapshot {
  const rooms: Room[] = ROOMS.map(({ popularity: _popularity, ...room }) => room);
  const bookings: Booking[] = [];
  const occupancy: Interval[] = [];
  const devices: Device[] = [];

  ROOMS.forEach((room, roomIdx) => {
    const offline = room.id === OFFLINE_ROOM;
    const lastSeenAt = offline ? now - OFFLINE_FOR : now - (5 + ((roomIdx * 7) % 20)) * 1000;
    let lastMotionAt: number | null = null;

    for (let i = days; i >= 0; i--) {
      const dayStart = addDays(now, -i);
      const plan = planDay(roomIdx, dayStart);
      const key = dayKey(dayStart);
      plan.bookings.forEach((b, n) => {
        bookings.push({ id: `${room.id}-${key}-${n}`, roomId: room.id, start: b.start, end: b.end });
      });
      for (const v of plan.visits) {
        if (v.start >= lastSeenAt) continue;
        const end = Math.min(v.end, lastSeenAt);
        occupancy.push({ roomId: room.id, start: v.start, end });
        lastMotionAt = Math.max(lastMotionAt ?? 0, end);
      }
    }

    const minute = Math.floor(now / MINUTE);
    devices.push({
      id: `obsv-${String(roomIdx + 1).padStart(2, '0')}`,
      roomId: room.id,
      online: !offline,
      lastSeenAt,
      lastMotionAt,
      rssi: -48 - ((roomIdx * 13) % 30) - ((minute + roomIdx) % 4),
      firmware: roomIdx === 8 ? '0.3.0' : '0.3.1',
    });
  });

  return { generatedAt: now, days, rooms, devices, bookings, occupancy };
}
