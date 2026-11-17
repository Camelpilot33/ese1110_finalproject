/**
 * Data model shared by the demo generator and the real backend.
 * All timestamps are Unix epoch milliseconds.
 */

export type Room = {
  id: string;
  name: string;
  floor: number;
  capacity: number;
};

/** One Obsv sensor node (ESP32-C6-DevKitC-1 + HC-SR501 PIR) mounted in a room. */
export type Device = {
  id: string;
  roomId: string;
  online: boolean;
  /** Last heartbeat received by the server. */
  lastSeenAt: number;
  /** Last time the PIR reported motion. */
  lastMotionAt: number | null;
  /** WiFi signal strength in dBm (e.g. -55). */
  rssi: number;
  firmware: string;
};

export type Interval = {
  roomId: string;
  start: number;
  end: number;
};

export type Booking = Interval & {
  id: string;
};

export type Snapshot = {
  generatedAt: number;
  /** How many full past days of history are included (plus today). */
  days: number;
  rooms: Room[];
  devices: Device[];
  /** Reservations from the booking system, including later today. */
  bookings: Booking[];
  /** Periods the sensor saw the room occupied. Never extends past generatedAt. */
  occupancy: Interval[];
};

export type RoomStatusKind =
  | 'free' // not booked, nobody there
  | 'in_use' // booked and occupied
  | 'walk_in' // occupied without a booking
  | 'arriving' // booking just started, nobody yet (grace period)
  | 'ghost' // booked but empty
  | 'offline'; // sensor not reporting

export type RoomStatus = {
  kind: RoomStatusKind;
  label: string;
  detail: string;
  currentBooking: Booking | null;
  nextBooking: Booking | null;
};
