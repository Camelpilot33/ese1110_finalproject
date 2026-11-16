import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Dot, Empty, Header, Loading, Notice, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { signalLabel } from '@/lib/format';
import { formatAgo } from '@/lib/time';
import type { Device, Room } from '@/lib/types';
import { useData } from '@/state/data';

export default function SensorsScreen() {
  const { index, loading, error, refresh, refreshing } = useData();

  const rows = index
    ? index.rooms
        .map((room) => ({ room, device: index.deviceByRoom[room.id] as Device | undefined }))
        // Problems first: missing, then offline, then healthy.
        .sort((a, b) => health(a.device) - health(b.device) || a.room.name.localeCompare(b.room.name))
    : [];
  const online = rows.filter((r) => r.device?.online).length;
  const attention = rows.filter((r) => !r.device?.online);
  const healthy = rows.filter((r) => r.device?.online);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Header
        title="Sensors"
        subtitle={index ? `${online} of ${rows.length} rooms reporting` : 'Motion sensors in each room'}
      />

      {error ? <Notice message={index ? `${error} Showing the last data received.` : error} /> : null}
      {loading ? <Loading /> : null}
      {index && rows.length === 0 ? <Empty message="No rooms to show." /> : null}

      {index && attention.length > 0 ? (
        <Section title="Needs attention">
          <Group>
            {attention.map((r, i) => (
              <SensorRow key={r.room.id} room={r.room} device={r.device} now={index.now} first={i === 0} />
            ))}
          </Group>
        </Section>
      ) : null}

      {index && healthy.length > 0 ? (
        <Section title="Online">
          <Group>
            {healthy.map((r, i) => (
              <SensorRow key={r.room.id} room={r.room} device={r.device} now={index.now} first={i === 0} />
            ))}
          </Group>
        </Section>
      ) : null}

      {index ? (
        <T variant="small" muted>
          Each unit is a PIR motion sensor on a QT Py ESP32-C3, reporting over Wi-Fi. A sensor is
          marked offline when its heartbeats stop arriving.
        </T>
      ) : null}
    </Screen>
  );
}

function health(device: Device | undefined): number {
  if (!device) return 0;
  return device.online ? 2 : 1;
}

function Group({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.group, { borderColor: theme.border }]}>{children}</View>;
}

function SensorRow({
  room,
  device,
  now,
  first,
}: {
  room: Room;
  device: Device | undefined;
  now: number;
  first: boolean;
}) {
  const theme = useTheme();
  const state = !device ? 'No sensor' : device.online ? 'Online' : 'Offline';
  const color = device?.online ? theme.free : device ? theme.accent : theme.offline;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/room/[id]', params: { id: room.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${room.name} sensor, ${state}`}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        pressed && { backgroundColor: theme.surface },
      ]}>
      <View style={styles.line}>
        <View style={styles.name}>
          <Dot color={color} />
          <T variant="heading">{room.name}</T>
          {device ? (
            <T variant="small" muted>
              {device.id}
            </T>
          ) : null}
        </View>
        <T variant="small" color={color} style={{ fontWeight: '700' }}>
          {state}
        </T>
      </View>

      {device ? (
        <View style={styles.facts}>
          <Fact label="Last seen" value={formatAgo(device.lastSeenAt, now)} />
          <Fact
            label="Last motion"
            value={device.lastMotionAt == null ? 'Never' : formatAgo(device.lastMotionAt, now)}
          />
          <Fact
            label="Signal"
            value={device.online ? `${signalLabel(device.rssi)} (${device.rssi} dBm)` : '–'}
          />
          <Fact label="Firmware" value={device.firmware} />
        </View>
      ) : (
        <T variant="small" muted>
          Occupancy for this room is unknown until a sensor is installed.
        </T>
      )}
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <T variant="small" muted>
        {label}
      </T>
      <T variant="small">{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, overflow: 'hidden' },
  row: { gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.sm },
  fact: { width: '50%', gap: 1 },
});
