/**
 * Snapshot format served to the app. Mirrors mobile/src/lib/types.ts:
 * keep the two in sync. All timestamps are epoch milliseconds.
 */

export type Room = { id: string; name: string; floor: number; capacity: number };

export type Device = {
  id: string;
  roomId: string;
  online: boolean;
  lastSeenAt: number;
  lastMotionAt: number | null;
  rssi: number;
  firmware: string;
};

export type Booking = { id: string; roomId: string; start: number; end: number };

/** `end: null` means the visit is still going on. */
export type OpenInterval = { roomId: string; start: number; end: number | null };

export type Snapshot = {
  generatedAt: number;
  days: number;
  rooms: Room[];
  devices: Device[];
  bookings: Booking[];
  occupancy: OpenInterval[];
};

export type Config = {
  rooms: Room[];
  devices: { id: string; roomId: string }[];
};
