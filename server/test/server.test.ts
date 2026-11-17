import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp, defaultOptions } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { buildOccupancy } from '../src/occupancy.ts';

const MIN = 60_000;
const opts = { gapMs: 10 * MIN, tailMs: 2 * MIN };

describe('buildOccupancy', () => {
  const t0 = Date.UTC(2026, 10, 17, 14);

  it('merges motions closer than the gap into one visit', () => {
    const m = [0, 3, 9, 15].map((x) => ({ roomId: 'r', at: t0 + x * MIN }));
    assert.deepEqual(buildOccupancy(m, t0 + 60 * MIN, opts), [
      { roomId: 'r', start: t0, end: t0 + 17 * MIN },
    ]);
  });

  it('splits visits at a long gap', () => {
    const m = [0, 2, 30].map((x) => ({ roomId: 'r', at: t0 + x * MIN }));
    const v = buildOccupancy(m, t0 + 60 * MIN, opts);
    assert.equal(v.length, 2);
    assert.deepEqual(v[0], { roomId: 'r', start: t0, end: t0 + 4 * MIN });
    assert.deepEqual(v[1], { roomId: 'r', start: t0 + 30 * MIN, end: t0 + 32 * MIN });
  });

  it('leaves a recent visit open', () => {
    const m = [0, 5].map((x) => ({ roomId: 'r', at: t0 + x * MIN }));
    assert.deepEqual(buildOccupancy(m, t0 + 8 * MIN, opts), [{ roomId: 'r', start: t0, end: null }]);
  });

  it('never ends a closed visit after now', () => {
    const m = [{ roomId: 'r', at: t0 }];
    assert.deepEqual(buildOccupancy(m, t0 + 11 * MIN, { gapMs: 10 * MIN, tailMs: 15 * MIN }), [
      { roomId: 'r', start: t0, end: t0 + 11 * MIN },
    ]);
  });

  it('keeps rooms separate', () => {
    const m = [
      { roomId: 'a', at: t0 },
      { roomId: 'b', at: t0 + MIN },
    ];
    assert.equal(buildOccupancy(m, t0 + 60 * MIN, opts).length, 2);
  });
});

describe('HTTP API', () => {
  let server: Server;
  let base: string;
  let clock = Date.now();
  const db = openDb(':memory:');
  const config = {
    rooms: [{ id: 'agh-204', name: 'AGH 204', floor: 2, capacity: 6 }],
    devices: [{ id: 'obsv-1', roomId: 'agh-204' }],
  };

  before(async () => {
    const app = createApp(db, config, {
      ...defaultOptions,
      deviceToken: 'dev-secret',
      adminToken: 'admin-secret',
      now: () => clock,
    });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => {
    server.close();
    db.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  it('rejects events without the device token', async () => {
    const res = await post('/api/events', { deviceId: 'obsv-1', type: 'motion' });
    assert.equal(res.status, 401);
  });

  it('rejects malformed events', async () => {
    const res = await post('/api/events', { deviceId: 'obsv-1', type: 'nope' }, 'dev-secret');
    assert.equal(res.status, 400);
  });

  it('shows a device offline before any heartbeat', async () => {
    const snap = await (await fetch(`${base}/api/snapshot?days=1`)).json();
    assert.equal(snap.devices[0].online, false);
    assert.equal(snap.devices[0].lastMotionAt, null);
  });

  it('records heartbeats and motion into the snapshot', async () => {
    const start = clock;
    assert.equal((await post('/api/events', { deviceId: 'obsv-1', type: 'heartbeat', rssi: -60, firmware: '0.2.0' }, 'dev-secret')).status, 200);
    assert.equal((await post('/api/events', { deviceId: 'obsv-1', type: 'motion', rssi: -61, firmware: '0.2.0' }, 'dev-secret')).status, 200);
    clock += 2 * MIN;
    await post('/api/events', { deviceId: 'obsv-1', type: 'motion', rssi: -62, firmware: '0.2.0' }, 'dev-secret');

    const res = await fetch(`${base}/api/snapshot?days=1`);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const snap = await res.json();
    const d = snap.devices[0];
    assert.equal(d.online, true);
    assert.equal(d.rssi, -62);
    assert.equal(d.firmware, '0.2.0');
    assert.equal(d.lastMotionAt, clock);
    assert.deepEqual(snap.occupancy, [{ roomId: 'agh-204', start, end: null }]);
  });

  it('marks a silent device offline', async () => {
    clock += 5 * MIN;
    const snap = await (await fetch(`${base}/api/snapshot?days=1`)).json();
    assert.equal(snap.devices[0].online, false);
  });

  it('adds and deletes bookings with the admin token', async () => {
    assert.equal((await post('/api/bookings', { roomId: 'agh-204', start: clock, end: clock + 60 * MIN })).status, 401);
    assert.equal((await post('/api/bookings', { roomId: 'nope', start: clock, end: clock + 1 }, 'admin-secret')).status, 400);

    const res = await post('/api/bookings', [{ id: 'b1', roomId: 'agh-204', start: clock, end: clock + 60 * MIN }], 'admin-secret');
    assert.equal(res.status, 200);
    let snap = await (await fetch(`${base}/api/snapshot`)).json();
    assert.deepEqual(snap.bookings.map((b: { id: string }) => b.id), ['b1']);

    const del = await fetch(`${base}/api/bookings/b1`, { method: 'DELETE', headers: { Authorization: 'Bearer admin-secret' } });
    assert.equal(del.status, 200);
    snap = await (await fetch(`${base}/api/snapshot`)).json();
    assert.equal(snap.bookings.length, 0);
  });
});
