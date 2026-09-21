const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260921134500_safety_pack_5_deleted_trip_collaboration.sql'),
  'utf8'
);

test('invite creation and acceptance reject tombstoned trips', () => {
  assert.match(sql, /create or replace function public\.create_trip_invite/);
  assert.match(sql, /create or replace function public\.accept_trip_invite/);
  const activeChecks = sql.match(/deleted_at is null/g) || [];
  assert.ok(activeChecks.length >= 8);
});

test('trip deletion invalidates invitations and removes collaboration messages', () => {
  assert.match(sql, /delete from public\.trip_invites/);
  assert.match(sql, /delete from public\.trip_messages/);
});

test('membership rows are retained for tombstone discovery', () => {
  assert.doesNotMatch(sql, /delete from public\.trip_members/i);
});

test('member and message policies require an active trip', () => {
  const policies = [
    'Members leave trips',
    'Members see trip members',
    'Owners manage trip members',
    'Senders delete trip messages',
    'Members send trip messages',
    'Members read trip messages'
  ];
  for (const policy of policies) assert.ok(sql.includes('create policy "' + policy + '"'));
  assert.match(sql, /from public\.travel_trips as trips/);
  assert.match(sql, /trips\.deleted_at is null/);
});
