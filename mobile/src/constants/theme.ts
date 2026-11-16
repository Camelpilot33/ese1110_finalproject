import { useColorScheme } from 'react-native';

import type { RoomStatusKind } from '@/lib/types';

export const Colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F5F5F3',
    border: '#E4E4E0',
    text: '#171717',
    muted: '#6B6B6B',
    accent: '#C2531E',
    onAccent: '#FFFFFF',
    free: '#2F855A',
    busy: '#6B6B6B',
    arriving: '#B7791F',
    offline: '#B0B0AC',
    /** "Booked" bars in charts; the accent is used for "used". */
    booked: '#D9D6CC',
  },
  dark: {
    background: '#0E0E0E',
    surface: '#1A1A1A',
    border: '#2C2C2C',
    text: '#F2F2F2',
    muted: '#9A9A9A',
    accent: '#E0703A',
    onAccent: '#0E0E0E',
    free: '#5DBB8A',
    busy: '#9A9A9A',
    arriving: '#D9A441',
    offline: '#555555',
    booked: '#57554D',
  },
} as const;

export type Theme = { [K in keyof typeof Colors.light]: string };

export function useTheme(): Theme {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function statusColor(theme: Theme, kind: RoomStatusKind): string {
  switch (kind) {
    case 'free':
      return theme.free;
    case 'ghost':
      return theme.accent;
    case 'arriving':
      return theme.arriving;
    case 'offline':
      return theme.offline;
    default:
      return theme.busy;
  }
}

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 6, md: 12, pill: 999 } as const;
export const MaxContentWidth = 640;
