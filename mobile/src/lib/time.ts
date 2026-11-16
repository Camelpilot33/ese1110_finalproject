export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Rooms are bookable from 8 AM to midnight; charts use this window. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 24;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `n` days after the day containing `t` (handles DST). */
export function addDays(t: number, n: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function atHour(dayStart: number, hour: number): number {
  const d = new Date(dayStart);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export function formatTime(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / MINUTE));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatHours(ms: number): string {
  const h = ms / HOUR;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

export function formatAgo(t: number, now: number): string {
  const diff = Math.max(0, now - t);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  return `${Math.floor(diff / DAY)} d ago`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayShort(t: number): string {
  return WEEKDAYS[new Date(t).getDay()];
}

export function formatHourLabel(hour: number): string {
  const h = hour % 24;
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
