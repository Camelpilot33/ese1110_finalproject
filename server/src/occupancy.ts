import type { OpenInterval } from './types.ts';

export type Motion = { roomId: string; at: number };

export type OccupancyOptions = {
  /** Motions closer together than this belong to the same visit. */
  gapMs: number;
  /** A finished visit is assumed to last this long after its final motion. */
  tailMs: number;
};

/**
 * Turns raw PIR motion reports into "room was occupied" stretches.
 *
 * People sitting still trigger a PIR only now and then, so motions up to
 * `gapMs` apart are merged into one visit. A visit whose last motion is less
 * than `gapMs` ago is still open (`end: null`).
 */
export function buildOccupancy(motions: Motion[], now: number, opts: OccupancyOptions): OpenInterval[] {
  const byRoom = new Map<string, number[]>();
  for (const m of motions) {
    let list = byRoom.get(m.roomId);
    if (!list) byRoom.set(m.roomId, (list = []));
    list.push(m.at);
  }

  const out: OpenInterval[] = [];
  for (const [roomId, times] of byRoom) {
    times.sort((a, b) => a - b);
    let start = times[0];
    let last = times[0];
    const close = (open: boolean) =>
      out.push({ roomId, start, end: open ? null : Math.min(last + opts.tailMs, now) });

    for (let i = 1; i < times.length; i++) {
      if (times[i] - last <= opts.gapMs) {
        last = times[i];
      } else {
        close(false);
        start = last = times[i];
      }
    }
    close(now - last < opts.gapMs);
  }
  return out.sort((a, b) => a.start - b.start);
}
