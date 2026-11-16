import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR,
  MINUTE,
  addDays,
  atHour,
  formatAgo,
  formatDuration,
  formatTime,
  startOfDay,
} from './time';
import type { Booking, Device, Interval, Room, RoomStatus, Snapshot } from './types';

/** A booking counts as "arriving" rather than empty for this long after it starts. */
export const ARRIVAL_GRACE = 10 * MINUTE;
/** A finished booking with less occupancy than this is a no-show. */
export const NO_SHOW_THRESHOLD = 5 * MINUTE;

// ---------------------------------------------------------------- intervals

export function clip<T extends Interval>(list: T[], from: number, to: number): T[] {
  const out: T[] = [];
  for (const i of list) {
    if (i.end <= from || i.start >= to) continue;
    out.push({ ...i, start: Math.max(i.start, from), end: Math.min(i.end, to) });
  }
  return out;
}

export function totalMs(list: Interval[]): number {
  let sum = 0;
  for (const i of list) sum += i.end - i.start;
  return sum;
}

/** Total time covered by both lists. Both must belong to the same room. */
export function overlapMs(a: Interval[], b: Interval[]): number {
  let sum = 0;
  for (const x of a) {
    for (const y of b) {
      const d = Math.min(x.end, y.end) - Math.max(x.start, y.start);
      if (d > 0) sum += d;
    }
  }
  return sum;
}

export function byRoom<T extends Interval>(list: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const i of list) (out[i.roomId] ??= []).push(i);
  return out;
}

// ------------------------------------------------------------- live status

export function isOccupied(device: Device | undefined, now: number, emptyAfterMs: number): boolean {
  if (!device || !device.online || device.lastMotionAt == null) return false;
  return now - device.lastMotionAt < emptyAfterMs;
}

export function getRoomStatus(
  device: Device | undefined,
  roomBookings: Booking[],
  now: number,
  emptyAfterMs: number,
): RoomStatus {
  const endOfToday = addDays(now, 1);
  let currentBooking: Booking | null = null;
  let nextBooking: Booking | null = null;
  for (const b of roomBookings) {
    if (b.start <= now && now < b.end) currentBooking = b;
    else if (b.start > now && b.start < endOfToday && (!nextBooking || b.start < nextBooking.start))
      nextBooking = b;
  }
  const base = { currentBooking, nextBooking };

  if (!device || !device.online) {
    return {
      ...base,
      kind: 'offline',
      label: 'No data',
      detail: device ? `Sensor last seen ${formatAgo(device.lastSeenAt, now)}` : 'No sensor installed',
    };
  }

  const occupied = isOccupied(device, now, emptyAfterMs);

  if (occupied && currentBooking) {
    return {
      ...base,
      kind: 'in_use',
      label: 'In use',
      detail: `Booked until ${formatTime(currentBooking.end)}`,
    };
  }
  if (occupied) {
    return {
      ...base,
      kind: 'walk_in',
      label: 'In use',
      detail: nextBooking
        ? `Not booked · next booking ${formatTime(nextBooking.start)}`
        : 'Not booked · no more bookings today',
    };
  }
  if (currentBooking) {
    const sinceStart = now - currentBooking.start;
    if (sinceStart < ARRIVAL_GRACE) {
      return {
        ...base,
        kind: 'arriving',
        label: 'Booked',
        detail: `Booking started ${formatAgo(currentBooking.start, now)} · nobody yet`,
      };
    }
    const emptySince = Math.max(device.lastMotionAt ?? 0, currentBooking.start);
    return {
      ...base,
      kind: 'ghost',
      label: 'Booked, empty',
      detail: `Empty for ${formatDuration(now - emptySince)} · booked until ${formatTime(currentBooking.end)}`,
    };
  }
  return {
    ...base,
    kind: 'free',
    label: 'Free',
    detail: nextBooking
      ? nextBooking.start - now < MINUTE
        ? `Booked from ${formatTime(nextBooking.start)}`
        : `Until ${formatTime(nextBooking.start)} (${formatDuration(nextBooking.start - now)})`
      : 'For the rest of the day',
  };
}

// ------------------------------------------------------------------- usage

export type Usage = {
  /** Booked time that has already elapsed. */
  bookedMs: number;
  /** Booked time the room was actually occupied. */
  usedMs: number;
  /** Booked time the room sat empty. */
  ghostMs: number;
  /** Occupied time with no booking. */
  walkInMs: number;
  /** Finished bookings. */
  bookings: number;
  /** Finished bookings nobody showed up to. */
  noShows: number;
};

export const EMPTY_USAGE: Usage = {
  bookedMs: 0,
  usedMs: 0,
  ghostMs: 0,
  walkInMs: 0,
  bookings: 0,
  noShows: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    bookedMs: a.bookedMs + b.bookedMs,
    usedMs: a.usedMs + b.usedMs,
    ghostMs: a.ghostMs + b.ghostMs,
    walkInMs: a.walkInMs + b.walkInMs,
    bookings: a.bookings + b.bookings,
    noShows: a.noShows + b.noShows,
  };
}

/** Share of booked time the room was actually used, or null if nothing was booked. */
export function usedShare(u: Usage): number | null {
  return u.bookedMs > 0 ? u.usedMs / u.bookedMs : null;
}

/** Usage for one room inside [from, to). Pass that room's intervals only. */
export function roomUsage(
  bookings: Booking[],
  occupancy: Interval[],
  from: number,
  to: number,
): Usage {
  if (to <= from) return EMPTY_USAGE;
  const b = clip(bookings, from, to);
  const o = clip(occupancy, from, to);
  const bookedMs = totalMs(b);
  const usedMs = overlapMs(b, o);
  let finished = 0;
  let noShows = 0;
  for (const full of bookings) {
    // Count a booking in the window where it ends, and only once it is over.
    if (full.end <= from || full.end > to) continue;
    finished++;
    if (overlapMs([full], occupancy) < NO_SHOW_THRESHOLD) noShows++;
  }
  return {
    bookedMs,
    usedMs,
    ghostMs: bookedMs - usedMs,
    walkInMs: totalMs(o) - usedMs,
    bookings: finished,
    noShows,
  };
}

export type Indexed = {
  now: number;
  rooms: Room[];
  deviceByRoom: Record<string, Device>;
  bookingsByRoom: Record<string, Booking[]>;
  occupancyByRoom: Record<string, Interval[]>;
  /** Per room, the last moment we have sensor data for (now, or last heartbeat if offline). */
  coverageEnd: Record<string, number>;
};

export function indexSnapshot(s: Snapshot): Indexed {
  const deviceByRoom: Record<string, Device> = {};
  for (const d of s.devices) deviceByRoom[d.roomId] = d;
  const coverageEnd: Record<string, number> = {};
  for (const r of s.rooms) {
    const d = deviceByRoom[r.id];
    coverageEnd[r.id] = !d ? 0 : d.online ? s.generatedAt : Math.min(d.lastSeenAt, s.generatedAt);
  }
  return {
    now: s.generatedAt,
    rooms: s.rooms,
    deviceByRoom,
    bookingsByRoom: byRoom(s.bookings),
    occupancyByRoom: byRoom(s.occupancy),
    coverageEnd,
  };
}

/** Usage for one room in a window, ignoring time the sensor was not reporting. */
export function usageFor(ix: Indexed, roomId: string, from: number, to: number): Usage {
  return roomUsage(
    ix.bookingsByRoom[roomId] ?? [],
    ix.occupancyByRoom[roomId] ?? [],
    from,
    Math.min(to, ix.coverageEnd[roomId] ?? 0),
  );
}

export function usageAll(ix: Indexed, from: number, to: number): Usage {
  let u = EMPTY_USAGE;
  for (const r of ix.rooms) u = addUsage(u, usageFor(ix, r.id, from, to));
  return u;
}

export type DayUsage = { dayStart: number; usage: Usage };

/** One entry per day, oldest first, ending with today. */
export function usageByDay(ix: Indexed, days: number, roomId?: string): DayUsage[] {
  const out: DayUsage[] = [];
  for (let n = days; n >= 0; n--) {
    const dayStart = addDays(ix.now, -n);
    const dayEnd = addDays(ix.now, -n + 1);
    out.push({
      dayStart,
      usage: roomId ? usageFor(ix, roomId, dayStart, dayEnd) : usageAll(ix, dayStart, dayEnd),
    });
  }
  return out;
}

export type HourCell = {
  hour: number;
  /** Share of booked time that sat empty, or null when nothing was booked. */
  emptyShare: number | null;
  bookedMs: number;
};

/** Across all rooms and days: for each hour of the day, how much booked time was empty. */
export function emptyShareByHour(ix: Indexed, days: number): HourCell[] {
  const cells: HourCell[] = [];
  for (let hour = DAY_START_HOUR; hour < DAY_END_HOUR; hour++) {
    let u = EMPTY_USAGE;
    for (let n = days; n >= 0; n--) {
      const day = addDays(ix.now, -n);
      const from = atHour(day, hour);
      u = addUsage(u, usageAll(ix, from, from + HOUR));
    }
    cells.push({
      hour,
      emptyShare: u.bookedMs > 0 ? u.ghostMs / u.bookedMs : null,
      bookedMs: u.bookedMs,
    });
  }
  return cells;
}

export function historyStart(ix: Indexed, days: number): number {
  return addDays(startOfDay(ix.now), -days);
}
