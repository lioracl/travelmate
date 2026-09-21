const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260921142454_safety_pack_6_member_concurrency.sql'),
  'utf8'
);
const cloud = fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8');

test('trip save locks the active editor membership after locking the trip', () => {
  const tripLock = sql.indexOf('from public.travel_trips');
  const memberLock = sql.indexOf('from public.trip_members', tripLock);
  assert.ok(tripLock >= 0);
  assert.ok(memberLock > tripLock);
  assert.match(sql, /actor_role is distinct from 'editor'/);
});

test('role changes and removals use the same trip-first lock order', () => {
  assert.match(sql, /function public\.update_trip_member_role[\s\S]*from public\.travel_trips[\s\S]*for update[\s\S]*from public\.trip_members[\s\S]*for update/);
  assert.match(sql, /function public\.remove_trip_member[\s\S]*from public\.travel_trips[\s\S]*for update[\s\S]*from public\.trip_members[\s\S]*for update/);
});

test('authenticated clients can no longer mutate trip_members directly', () => {
  assert.match(sql, /revoke update, delete on table public\.trip_members from authenticated/i);
});

test('cloud client manages membership through RPCs only', () => {
  assert.match(cloud, /rpc\('update_trip_member_role'/);
  assert.match(cloud, /rpc\('remove_trip_member'/);
});
