import { addDays, startOfDay, weekdayShort } from './time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", or "Tue, Nov 10". */
export function formatDay(t: number, now: number): string {
  const day = startOfDay(t);
  if (day === startOfDay(now)) return 'Today';
  if (day === addDays(now, -1)) return 'Yesterday';
  const d = new Date(t);
  return `${weekdayShort(t)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 0.42 -> "42%". Returns an en dash when there is nothing to divide by. */
export function formatPercent(part: number, whole: number): string {
  if (!(whole > 0)) return '–';
  return `${Math.round((part / whole) * 100)}%`;
}

export function signalLabel(rssi: number): string {
  if (rssi >= -55) return 'Strong';
  if (rssi >= -67) return 'Good';
  if (rssi >= -75) return 'Fair';
  return 'Weak';
}
