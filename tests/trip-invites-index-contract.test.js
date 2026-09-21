const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20260921172500_performance_pack_2_trip_invites_index.sql'),
  'utf8'
);

test('trip invite owner/trip lookups have a covering composite index', () => {
  assert.match(sql, /create index if not exists trip_invites_trip_idx/i);
  assert.match(sql, /on public\.trip_invites\s*\(trip_owner_id, trip_id\)/i);
});
