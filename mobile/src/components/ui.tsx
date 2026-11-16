import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Radius, Spacing, useTheme } from '@/constants/theme';

// --------------------------------------------------------------------- text

type Variant = 'title' | 'heading' | 'body' | 'label' | 'small' | 'number';

export function T({
  variant = 'body',
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const theme = useTheme();
  return (
    <Text
      style={[text[variant], { color: color ?? (muted ? theme.muted : theme.text) }, style]}
      {...rest}
    />
  );
}

const text = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  small: { fontSize: 13, lineHeight: 18 },
  number: { fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
});

// -------------------------------------------------------------------- icons

const ICONS = {
  rooms: { ios: 'door.left.hand.open', android: 'meeting_room', web: 'meeting_room' },
  insights: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  sensors: { ios: 'sensor', android: 'sensors', web: 'sensors' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  star: { ios: 'star', android: 'star_border', web: 'star_border' },
  starFilled: { ios: 'star.fill', android: 'star', web: 'star' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
} satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
}) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}

// ------------------------------------------------------------------- layout

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  edges = ['top'],
}: {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={edges}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.muted} />
          ) : undefined
        }>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 2, marginBottom: Spacing.sm }}>
      <T variant="title">{title}</T>
      {subtitle ? <T muted>{subtitle}</T> : null}
    </View>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ gap: 2 }}>
        <T variant="label" muted>
          {title}
        </T>
        {hint ? (
          <T variant="small" muted>
            {hint}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background }, style]}>
      {children}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}

// ----------------------------------------------------------------- controls

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? theme.text : theme.border,
          backgroundColor: selected ? theme.text : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <T variant="small" color={selected ? theme.background : theme.text} style={{ fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.surface }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.background, borderColor: theme.border },
            ]}>
            <T variant="small" muted={!selected} style={{ fontWeight: '600' }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { borderColor: theme.text, opacity: inactive ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      {busy ? <ActivityIndicator size="small" color={theme.text} /> : null}
      <T style={{ fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
}

// ------------------------------------------------------------------- states

export function Notice({ message, tone = 'error' }: { message: string; tone?: 'error' | 'info' }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: theme.surface, borderLeftColor: tone === 'error' ? theme.accent : theme.muted },
      ]}>
      <T variant="small">{message}</T>
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ paddingVertical: Spacing.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.muted} />
    </View>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <View style={{ paddingVertical: Spacing.xxl, alignItems: 'center' }}>
      <T muted style={{ textAlign: 'center' }}>
        {message}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: Radius.md - 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  button: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  notice: { borderLeftWidth: 3, borderRadius: Radius.sm, padding: Spacing.md },
});
