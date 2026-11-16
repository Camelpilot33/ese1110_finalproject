import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DailyBars, HourStrip, Legend, RatioBar } from '@/components/charts';
import {
  Card,
  Empty,
  Header,
  Icon,
  Loading,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
} from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { formatPercent } from '@/lib/format';
import {
  emptyShareByHour,
  historyStart,
  usageAll,
  usageByDay,
  usageFor,
  usedShare,
} from '@/lib/stats';
import { HOUR, atHour, formatHours, formatTime, startOfDay } from '@/lib/time';
import { HISTORY_DAYS, useData } from '@/state/data';

type Range = 'today' | 'week';

export default function InsightsScreen() {
  const theme = useTheme();
  const { index, loading, error, refresh, refreshing } = useData();
  const [range, setRange] = useState<Range>('week');

  const data = useMemo(() => {
    if (!index) return null;
    const days = range === 'today' ? 0 : HISTORY_DAYS;
    const from = range === 'today' ? startOfDay(index.now) : historyStart(index, HISTORY_DAYS);
    const total = usageAll(index, from, index.now);
    const byRoom = index.rooms
      .map((room) => ({ room, usage: usageFor(index, room.id, from, index.now) }))
      .sort((a, b) => b.usage.ghostMs - a.usage.ghostMs);
    const byHour = emptyShareByHour(index, days);
    // Ignore hours with too little booked time to say anything meaningful.
    const worst = byHour
      .filter((c) => c.emptyShare != null && c.bookedMs >= HOUR)
      .sort((a, b) => (b.emptyShare ?? 0) - (a.emptyShare ?? 0))[0];
    const worstHour = worst
      ? {
          label: formatTime(atHour(startOfDay(index.now), worst.hour)),
          share: formatPercent(worst.emptyShare ?? 0, 1),
        }
      : null;
    return { total, byRoom, byDay: usageByDay(index, days), byHour, worstHour };
  }, [index, range]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header title="Insights" subtitle="How bookings compare with real use" />

      <Segmented
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: `Last ${HISTORY_DAYS} days` },
        ]}
        value={range}
        onChange={setRange}
      />

      {error ? <Notice message={index ? `${error} Showing the last data received.` : error} /> : null}
      {loading ? <Loading /> : null}

      {data && data.total.bookedMs === 0 ? (
        <Empty message="Nothing has been booked in this period yet." />
      ) : null}

      {data && data.total.bookedMs > 0 ? (
        <>
          <Card>
            <CompareBar
              label="Booked"
              value={formatHours(data.total.bookedMs)}
              share={1}
              color={theme.booked}
            />
            <CompareBar
              label="Used"
              value={formatHours(data.total.usedMs)}
              share={usedShare(data.total) ?? 0}
              color={theme.accent}
            />
            <T color={theme.accent} style={{ fontWeight: '700' }}>
              {formatHours(data.total.ghostMs)} booked but empty (
              {formatPercent(data.total.ghostMs, data.total.bookedMs)})
            </T>
          </Card>

          <View style={[styles.stats, { backgroundColor: theme.surface }]}>
            <Stat
              value={formatPercent(data.total.noShows, data.total.bookings)}
              label="No-show bookings"
              detail={`${data.total.noShows} of ${data.total.bookings}`}
            />
            <Stat
              value={formatHours(data.total.walkInMs)}
              label="Walk-in use"
              detail="Occupied, not booked"
            />
          </View>

          {range === 'week' ? (
            <Section title="By day">
              <Card>
                <DailyBars days={data.byDay} />
                <Legend
                  items={[
                    { color: theme.booked, label: 'Booked' },
                    { color: theme.accent, label: 'Used' },
                  ]}
                />
              </Card>
            </Section>
          ) : null}

          <Section title="Empty bookings by hour" hint="Darker means more of the booked time sat empty.">
            <Card>
              <HourStrip cells={data.byHour} />
              {data.worstHour ? (
                <T variant="small" muted>
                  Worst hour: {data.worstHour.label}, {data.worstHour.share} of booked time empty.
                </T>
              ) : null}
            </Card>
          </Section>

          <Section title="By room" hint="Most booked-but-empty time first.">
            <View style={[styles.group, { borderColor: theme.border }]}>
              {data.byRoom.map(({ room, usage }, i) => (
                <Pressable
                  key={room.id}
                  onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${room.name}: ${formatHours(usage.ghostMs)} booked but empty`}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    pressed && { backgroundColor: theme.surface },
                  ]}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={styles.rowTop}>
                      <T variant="heading">{room.name}</T>
                      <T variant="small" muted>
                        {usage.bookedMs > 0
                          ? `${formatHours(usage.ghostMs)} empty of ${formatHours(usage.bookedMs)}`
                          : 'Nothing to compare'}
                      </T>
                    </View>
                    <RatioBar share={usedShare(usage)} />
                  </View>
                  <Icon name="chevron" color={theme.offline} size={20} />
                </Pressable>
              ))}
            </View>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function CompareBar({
  label,
  value,
  share,
  color,
}: {
  label: string;
  value: string;
  share: number;
  color: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.rowTop}>
        <T variant="small" muted>
          {label}
        </T>
        <T variant="small" style={{ fontWeight: '700' }}>
          {value}
        </T>
      </View>
      <View
        style={{
          height: 14,
          borderRadius: 4,
          backgroundColor: color,
          width: `${Math.max(1, Math.min(100, share * 100))}%`,
        }}
      />
    </View>
  );
}

function Stat({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="number">{value}</T>
      <T variant="small">{label}</T>
      <T variant="small" muted>
        {detail}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Spacing.md, borderRadius: Radius.md, padding: Spacing.lg },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
});
