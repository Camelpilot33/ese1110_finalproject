import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Dot, Empty, Header, Icon, Loading, Notice, Screen, T } from '@/components/ui';
import { Radius, Spacing, statusColor, useTheme } from '@/constants/theme';
import { getRoomStatus } from '@/lib/stats';
import { MINUTE, formatTime } from '@/lib/time';
import type { Room, RoomStatus } from '@/lib/types';
import { useData } from '@/state/data';
import { useSettings } from '@/state/settings';

type Filter = 'all' | 'available' | 'favorites';

/** Rooms a student could walk into right now. */
const isAvailable = (s: RoomStatus) => s.kind === 'free' || s.kind === 'ghost';

export default function RoomsScreen() {
  const theme = useTheme();
  const { index, loading, error, refresh, refreshing } = useData();
  const { settings, toggleFavorite } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    if (!index) return [];
    return index.rooms.map((room) => ({
      room,
      status: getRoomStatus(
        index.deviceByRoom[room.id],
        index.bookingsByRoom[room.id] ?? [],
        index.now,
        settings.emptyAfterMin * MINUTE,
      ),
    }));
  }, [index, settings.emptyAfterMin]);

  const counts = useMemo(() => {
    let free = 0;
    let ghost = 0;
    let busy = 0;
    for (const r of rows) {
      if (r.status.kind === 'free') free++;
      else if (r.status.kind === 'ghost') ghost++;
      else if (r.status.kind !== 'offline') busy++;
    }
    return { free, ghost, busy };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === 'available') return isAvailable(r.status);
    if (filter === 'favorites') return settings.favorites.includes(r.room.id);
    return true;
  });

  const floors = useMemo(() => {
    const byFloor = new Map<number, typeof visible>();
    for (const r of visible) {
      const list = byFloor.get(r.room.floor) ?? [];
      list.push(r);
      byFloor.set(r.room.floor, list);
    }
    return [...byFloor.entries()].sort((a, b) => a[0] - b[0]);
  }, [visible]);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header
        title="Rooms"
        subtitle={
          index
            ? `Amy Gutmann Hall · updated ${formatTime(index.now)}${settings.source === 'demo' ? ' · demo data' : ''}`
            : 'Amy Gutmann Hall'
        }
      />

      {error ? <Notice message={index ? `${error} Showing the last data received.` : error} /> : null}

      {loading ? <Loading /> : null}

      {index ? (
        <>
          <View style={[styles.summary, { backgroundColor: theme.surface }]}>
            <Count value={counts.free} label="Free" color={theme.free} />
            <Count value={counts.ghost} label="Booked, empty" color={theme.accent} />
            <Count value={counts.busy} label="In use" color={theme.busy} />
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip
              label="Empty now"
              selected={filter === 'available'}
              onPress={() => setFilter('available')}
            />
            <Chip
              label="Favorites"
              selected={filter === 'favorites'}
              onPress={() => setFilter('favorites')}
            />
          </View>

          {visible.length === 0 ? (
            <Empty
              message={
                filter === 'favorites'
                  ? 'No favorites yet. Tap the star on a room to add it.'
                  : filter === 'available'
                    ? 'Every room is occupied right now.'
                    : 'No rooms to show.'
              }
            />
          ) : (
            floors.map(([floor, list]) => (
              <View key={floor} style={{ gap: Spacing.sm }}>
                <T variant="label" muted>
                  Floor {floor}
                </T>
                <View style={[styles.group, { borderColor: theme.border }]}>
                  {list.map((r, i) => (
                    <RoomRow
                      key={r.room.id}
                      room={r.room}
                      status={r.status}
                      first={i === 0}
                      favorite={settings.favorites.includes(r.room.id)}
                      onToggleFavorite={() => toggleFavorite(r.room.id)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <T variant="number">{value}</T>
        <Dot color={color} size={8} />
      </View>
      <T variant="small" muted>
        {label}
      </T>
    </View>
  );
}

function RoomRow({
  room,
  status,
  first,
  favorite,
  onToggleFavorite,
}: {
  room: Room;
  status: RoomStatus;
  first: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const theme = useTheme();
  const color = statusColor(theme, status.kind);
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
      ]}>
      <Pressable
        onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${room.name}, ${status.label}. ${status.detail}`}
        style={({ pressed }) => [styles.rowMain, pressed && { backgroundColor: theme.surface }]}>
        <Dot color={color} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm }}>
            <T variant="heading">{room.name}</T>
            <T variant="small" muted>
              {room.capacity} seats
            </T>
          </View>
          <T variant="small" color={color} style={{ fontWeight: '700' }}>
            {status.label}
          </T>
          <T variant="small" muted>
            {status.detail}
          </T>
        </View>
      </Pressable>
      <Pressable
        onPress={onToggleFavorite}
        accessibilityRole="button"
        accessibilityLabel={favorite ? `Remove ${room.name} from favorites` : `Add ${room.name} to favorites`}
        style={({ pressed }) => [styles.star, pressed && { opacity: 0.5 }]}>
        <Icon
          name={favorite ? 'starFilled' : 'star'}
          color={favorite ? theme.text : theme.offline}
          size={22}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: Spacing.md, borderRadius: Radius.md, padding: Spacing.lg },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.lg,
  },
  star: { justifyContent: 'center', paddingHorizontal: Spacing.lg },
});
