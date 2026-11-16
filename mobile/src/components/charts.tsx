import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Spacing, useTheme } from '@/constants/theme';
import type { DayUsage, HourCell } from '@/lib/stats';
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR,
  atHour,
  formatHourLabel,
  weekdayShort,
} from '@/lib/time';
import type { Interval } from '@/lib/types';

import { Dot, T } from './ui';

const pct = (n: number): DimensionValue => `${Math.max(0, Math.min(100, n * 100))}%`;

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dot color={i.color} size={8} />
          <T variant="small" muted>
            {i.label}
          </T>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------ day timeline

function Track({
  label,
  intervals,
  from,
  to,
  color,
}: {
  label: string;
  intervals: Interval[];
  from: number;
  to: number;
  color: string;
}) {
  const theme = useTheme();
  const span = to - from;
  return (
    <View style={{ gap: 4 }}>
      <T variant="small" muted>
        {label}
      </T>
      <View style={[styles.track, { backgroundColor: theme.surface }]}>
        {intervals.map((i, n) => {
          const start = Math.max(i.start, from);
          const end = Math.min(i.end, to);
          if (end <= start) return null;
          return (
            <View
              key={n}
              style={[
                styles.trackBar,
                {
                  left: pct((start - from) / span),
                  width: pct((end - start) / span),
                  backgroundColor: color,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

/** Booked vs. actually occupied across one day (8 AM to midnight). */
export function DayTimeline({
  bookings,
  occupancy,
  dayStart,
  now,
}: {
  bookings: Interval[];
  occupancy: Interval[];
  dayStart: number;
  now: number;
}) {
  const theme = useTheme();
  const from = atHour(dayStart, DAY_START_HOUR);
  const to = from + (DAY_END_HOUR - DAY_START_HOUR) * HOUR;
  const nowInRange = now > from && now < to;
  const ticks = [8, 12, 16, 20, 24];

  return (
    <View style={{ gap: Spacing.sm }}>
      <View>
        <View style={{ gap: Spacing.sm }}>
          <Track label="Booked" intervals={bookings} from={from} to={to} color={theme.booked} />
          <Track label="Occupied" intervals={occupancy} from={from} to={to} color={theme.accent} />
        </View>
        {nowInRange ? (
          <View
            pointerEvents="none"
            style={[
              styles.nowLine,
              { left: pct((now - from) / (to - from)), backgroundColor: theme.text },
            ]}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ticks.map((h) => (
          <T key={h} variant="small" muted>
            {formatHourLabel(h)}
          </T>
        ))}
      </View>
    </View>
  );
}

// -------------------------------------------------------------- daily bars

/** Paired vertical bars per day: booked hours next to hours actually used. */
export function DailyBars({ days, height = 120 }: { days: DayUsage[]; height?: number }) {
  const theme = useTheme();
  const max = Math.max(1, ...days.map((d) => d.usage.bookedMs));
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        return (
          <View key={d.dayStart} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
              <View
                style={[
                  styles.bar,
                  { height: pct(d.usage.bookedMs / max), backgroundColor: theme.booked },
                ]}
              />
              <View
                style={[
                  styles.bar,
                  { height: pct(d.usage.usedMs / max), backgroundColor: theme.accent },
                ]}
              />
            </View>
            <T variant="small" muted={!isToday} style={isToday ? { fontWeight: '700' } : undefined}>
              {isToday ? 'Today' : weekdayShort(d.dayStart)}
            </T>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- ratio bar

/** One horizontal bar: the filled part is the share of booked time that was used. */
export function RatioBar({ share }: { share: number | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.ratio, { backgroundColor: share == null ? theme.surface : theme.booked }]}>
      {share != null ? (
        <View style={[styles.ratioFill, { width: pct(share), backgroundColor: theme.accent }]} />
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------- hour strip

/** One cell per hour of the day; darker means more booked time sat empty. */
export function HourStrip({ cells }: { cells: HourCell[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {cells.map((c) => (
          <View
            key={c.hour}
            accessibilityLabel={
              c.emptyShare == null
                ? `${formatHourLabel(c.hour)}: no bookings`
                : `${formatHourLabel(c.hour)}: ${Math.round(c.emptyShare * 100)}% of booked time empty`
            }
            style={[styles.cell, { backgroundColor: theme.surface }]}>
            {c.emptyShare != null ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: theme.accent, opacity: 0.12 + 0.88 * c.emptyShare },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {cells
          .filter((c) => c.hour % 4 === 0)
          .map((c) => (
            // Each label sits under the first of the four cells it covers.
            <T key={c.hour} variant="small" muted style={styles.cellLabel}>
              {formatHourLabel(c.hour)}
            </T>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 18, borderRadius: 4, overflow: 'hidden' },
  trackBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1 },
  bar: { width: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  ratio: { height: 8, borderRadius: 4, overflow: 'hidden' },
  ratioFill: { height: '100%', borderRadius: 4 },
  cell: { flex: 1, height: 28, borderRadius: 3, overflow: 'hidden' },
  cellLabel: { flex: 1, fontSize: 11 },
});
