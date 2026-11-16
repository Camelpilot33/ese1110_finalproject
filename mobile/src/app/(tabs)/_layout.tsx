import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useSettings } from '@/state/settings';

function icon(name: IconName) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Icon name={name} color={color} />;
  };
}

export default function TabsLayout() {
  const theme = useTheme();
  const { settings } = useSettings();
  // Insights and Sensors are for staff; hide them in the student view.
  const adminHref = settings.adminView ? undefined : null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Rooms', tabBarIcon: icon('rooms') }} />
      <Tabs.Screen
        name="insights"
        options={{ title: 'Insights', tabBarIcon: icon('insights'), href: adminHref }}
      />
      <Tabs.Screen
        name="sensors"
        options={{ title: 'Sensors', tabBarIcon: icon('sensors'), href: adminHref }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
