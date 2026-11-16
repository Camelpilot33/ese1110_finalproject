import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { useTheme } from '@/constants/theme';
import { DataProvider } from '@/state/data';
import { SettingsProvider } from '@/state/settings';

export default function RootLayout() {
  const theme = useTheme();
  const base = useColorScheme() === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <SettingsProvider>
        <DataProvider>
          <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: theme.text }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="room/[id]" options={{ title: '', headerBackTitle: 'Rooms' }} />
          </Stack>
          <StatusBar style="auto" />
        </DataProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
