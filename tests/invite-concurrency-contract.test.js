const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const allSql = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n');

const inviteSql = fs.readFileSync(
  path.join(migrationsDir, '20260921134839_safety_pack_5_deleted_trip_collaboration.sql'),
  'utf8'
);

test('invite acceptance serializes concurrent consumers on the invite row', () => {
  assert.match(inviteSql, /select \* into invitation[\s\S]*from public\.trip_invites[\s\S]*where token = p_token[\s\S]*for update/i);
});

test('repeat acceptance by the same user is idempotent before consuming another use', () => {
  const memberCheck = inviteSql.indexOf('if exists (');
  const useLimitCheck = inviteSql.indexOf('invitation.use_count >= invitation.max_uses');
  const increment = inviteSql.indexOf('set use_count = use_count + 1');
  assert.ok(memberCheck >= 0);
  assert.ok(useLimitCheck > memberCheck);
  assert.ok(increment > useLimitCheck);
  assert.match(inviteSql, /'already_member', true/);
});

test('membership uniqueness prevents duplicate rows across simultaneous accepts', () => {
  assert.match(allSql, /primary key\s*\(\s*trip_owner_id\s*,\s*trip_id\s*,\s*user_id\s*\)/i);
});

test('invite use count has a bounded maximum', () => {
  assert.match(allSql, /max_uses[\s\S]*check[\s\S]*max_uses\s*>=\s*1[\s\S]*max_uses\s*<=\s*100/i);
});
