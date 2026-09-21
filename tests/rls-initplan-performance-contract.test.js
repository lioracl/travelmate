const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20260921172000_performance_pack_1_rls_initplan.sql'),
  'utf8'
);

test('performance RLS policies use auth.uid through initplans', () => {
  for (const policy of [
    'Members leave trips',
    'Owners manage trip members',
    'Senders delete trip messages',
    'Members send trip messages'
  ]) {
    assert.ok(sql.includes('create policy "' + policy + '"'));
  }
  assert.doesNotMatch(sql, /(?<!select )auth\.uid\(\)/);
  const optimizedCalls = sql.match(/\(select auth\.uid\(\)\)/g) || [];
  assert.ok(optimizedCalls.length >= 5);
});

test('active-trip guards remain intact', () => {
  const guards = sql.match(/trips\.deleted_at is null/g) || [];
  assert.equal(guards.length, 4);
});
