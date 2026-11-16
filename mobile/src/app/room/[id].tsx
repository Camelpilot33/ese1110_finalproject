import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DailyBars, DayTimeline, Legend } from '@/components/charts';
import { Card, Divider, Dot, Empty, Icon, Loading, Notice, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing, statusColor, useTheme, type Theme } from '@/constants/theme';
import { formatDay, formatPercent, signalLabel } from '@/lib/format';
import {
  ARRIVAL_GRACE,
  NO_SHOW_THRESHOLD,
  clip,
  getRoomStatus,
  historyStart,
  overlapMs,
  usageByDay,
  usageFor,
  type Indexed,
} from '@/lib/stats';
import { MINUTE, addDays, formatAgo, formatDuration, formatHours, formatRange } from '@/lib/time';
import type { Booking } from '@/lib/types';
import { HISTORY_DAYS, useData } from '@/state/data';
import { useSettings } from '@/state/settings';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { index, loading, error, refresh, refreshing } = useData();
  const { settings, toggleFavorite } = useSettings();
  /** 0 = today, 1 = yesterday, ... */
  const [daysBack, setDaysBack] = useState(0);

  const room = index?.rooms.find((r) => r.id === id);
  const favorite = settings.favorites.includes(id);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: room?.name ?? '',
          headerRight: () =>
            room ? (
              <Pressable
                onPress={() => toggleFavorite(id)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{ paddingHorizontal: Spacing.sm }}>
                <Icon
                  name={favorite ? 'starFilled' : 'star'}
                  color={favorite ? theme.text : theme.muted}
                />
              </Pressable>
            ) : null,
        }}
      />

      {error ? <Notice message={index ? `${error} Showing the last data received.` : error} /> : null}
      {loading ? <Loading /> : null}
      {index && !room ? <Empty message="This room is no longer available." /> : null}

      {index && room ? (
        <RoomDetail
          index={index}
          roomId={room.id}
          daysBack={daysBack}
          onDaysBack={setDaysBack}
          emptyAfterMs={settings.emptyAfterMin * MINUTE}
          showSensor={settings.adminView}
        />
      ) : null}
    </Screen>
  );
}

function RoomDetail({
  index,
  roomId,
  daysBack,
  onDaysBack,
  emptyAfterMs,
  showSensor,
}: {
  index: Indexed;
  roomId: string;
  daysBack: number;
  onDaysBack: (n: number) => void;
  emptyAfterMs: number;
  showSensor: boolean;
}) {
  const theme = useTheme();
  const now = index.now;
  const room = index.rooms.find((r) => r.id === roomId)!;
  const device = index.deviceByRoom[roomId];
  const bookings = index.bookingsByRoom[roomId] ?? [];
  const occupancy = index.occupancyByRoom[roomId] ?? [];
  const coverageEnd = index.coverageEnd[roomId] ?? 0;

  const status = getRoomStatus(device, bookings, now, emptyAfterMs);
  const color = statusColor(theme, status.kind);

  const dayStart = addDays(now, -daysBack);
  const dayEnd = addDays(dayStart, 1);
  const dayBookings = clip(bookings, dayStart, dayEnd);
  const dayOccupancy = clip(occupancy, dayStart, Math.min(dayEnd, coverageEnd));
  const dayUsage = usageFor(index, roomId, dayStart, dayEnd);

  const week = usageFor(index, roomId, historyStart(index, HISTORY_DAYS), now);

  return (
    <>
      <View style={{ gap: Spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Dot color={color} size={12} />
          <T variant="title" color={color}>
            {status.label}
          </T>
        </View>
        <T muted>{status.detail}</T>
        <T variant="small" muted>
          Floor {room.floor} · {room.capacity} seats
          {device?.lastMotionAt != null ? ` · last motion ${formatAgo(device.lastMotionAt, now)}` : ''}
        </T>
      </View>

      <Section title="Booked vs. occupied">
        <Card>
          <View style={styles.dayPicker}>
            <Step
              icon="chevronLeft"
              label="Previous day"
              disabled={daysBack >= HISTORY_DAYS}
              onPress={() => onDaysBack(daysBack + 1)}
            />
            <T variant="heading">{formatDay(dayStart, now)}</T>
            <Step
              icon="chevron"
              label="Next day"
              disabled={daysBack === 0}
              onPress={() => onDaysBack(daysBack - 1)}
            />
          </View>

          <DayTimeline bookings={dayBookings} occupancy={dayOccupancy} dayStart={dayStart} now={now} />

          <Divider />
          <View style={{ flexDirection: 'row' }}>
            <Total label="Booked" value={formatHours(dayUsage.bookedMs)} />
            <Total label="Used" value={formatHours(dayUsage.usedMs)} />
            <Total label="Booked, empty" value={formatHours(dayUsage.ghostMs)} color={theme.accent} />
          </View>
          {daysBack === 0 ? (
            <T variant="small" muted>
              Totals count only the part of today that has already happened.
            </T>
          ) : null}
        </Card>
      </Section>

      <Section title="Bookings">
        {dayBookings.length === 0 ? (
          <T muted>No bookings {daysBack === 0 ? 'today' : 'that day'}.</T>
        ) : (
          <View style={[styles.group, { borderColor: theme.border }]}>
            {dayBookings.map((b, i) => {
              const outcome = bookingOutcome(b, occupancy, now, coverageEnd, theme);
              return (
                <View
                  key={b.id}
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  ]}>
                  <View style={{ gap: 1 }}>
                    <T>{formatRange(b.start, b.end)}</T>
                    <T variant="small" muted>
                      {formatDuration(b.end - b.start)}
                    </T>
                  </View>
                  <T variant="small" color={outcome.color} style={{ fontWeight: '700' }}>
                    {outcome.label}
                  </T>
                </View>
              );
            })}
          </View>
        )}
      </Section>

      <Section title={`Last ${HISTORY_DAYS} days`}>
        <Card>
          <DailyBars days={usageByDay(index, HISTORY_DAYS, roomId)} height={90} />
          <Legend
            items={[
              { color: theme.booked, label: 'Booked' },
              { color: theme.accent, label: 'Used' },
            ]}
          />
          <Divider />
          <View style={{ flexDirection: 'row' }}>
            <Total label="Booked time used" value={formatPercent(week.usedMs, week.bookedMs)} />
            <Total label="No-shows" value={`${week.noShows} of ${week.bookings}`} />
            <Total label="Walk-in use" value={formatHours(week.walkInMs)} />
          </View>
        </Card>
      </Section>

      {showSensor ? (
        <Section title="Sensor">
          {device ? (
            <Card>
              <Fact label="Status" value={device.online ? 'Online' : 'Offline'} />
              <Fact label="Last seen" value={formatAgo(device.lastSeenAt, now)} />
              <Fact
                label="Signal"
                value={device.online ? `${signalLabel(device.rssi)} (${device.rssi} dBm)` : '–'}
              />
              <Fact label="Device" value={`${device.id} · firmware ${device.firmware}`} />
            </Card>
          ) : (
            <T muted>No sensor is installed in this room.</T>
          )}
        </Section>
      ) : null}
    </>
  );
}

/** How a booking turned out, judged by how much of it the room was occupied. */
function bookingOutcome(
  booking: Booking,
  occupancy: Parameters<typeof overlapMs>[1],
  now: number,
  coverageEnd: number,
  theme: Theme,
): { label: string; color: string } {
  if (booking.start > now) return { label: 'Upcoming', color: theme.muted };
  const elapsedEnd = Math.min(booking.end, now);
  if (coverageEnd < elapsedEnd) return { label: 'No sensor data', color: theme.offline };

  const used = overlapMs([{ ...booking, end: elapsedEnd }], occupancy);
  if (now < booking.end) {
    if (used > 0) return { label: 'In progress', color: theme.text };
    return now - booking.start < ARRIVAL_GRACE
      ? { label: 'Nobody yet', color: theme.arriving }
      : { label: 'Empty so far', color: theme.accent };
  }
  if (used < NO_SHOW_THRESHOLD) return { label: 'No-show', color: theme.accent };
  return { label: `${formatPercent(used, booking.end - booking.start)} used`, color: theme.text };
}

function Step({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron' | 'chevronLeft';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: theme.surface, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} color={theme.text} size={20} />
    </Pressable>
  );
}

function Total({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <T variant="heading" color={color}>
        {value}
      </T>
      <T variant="small" muted>
        {label}
      </T>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md }}>
      <T variant="small" muted>
        {label}
      </T>
      <T variant="small" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  dayPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
