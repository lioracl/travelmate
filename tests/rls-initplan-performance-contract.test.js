const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20260921171437_performance_pack_1_rls_initplan.sql'),
  'utf8'
);
const executableSql = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

test('performance RLS policies use auth.uid through initplans', () => {
  for (const policy of [
    'Members leave trips',
    'Owners manage trip members',
    'Senders delete trip messages',
    'Members send trip messages'
  ]) {
    assert.ok(executableSql.includes('create policy "' + policy + '"'));
  }
  const authCalls = executableSql.match(/auth\.uid\(\)/g) || [];
  const optimizedCalls = executableSql.match(/\(select auth\.uid\(\)\)/g) || [];
  assert.ok(authCalls.length >= 5);
  assert.equal(authCalls.length, optimizedCalls.length);
});

test('active-trip guards remain intact', () => {
  const guards = executableSql.match(/trips\.deleted_at is null/g) || [];
  assert.ok(guards.length >= 4);
});
