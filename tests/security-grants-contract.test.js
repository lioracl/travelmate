const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260921125633_safety_pack_4_least_privilege.sql'),
  'utf8'
);

test('admin table reads are forced through the MFA-protected edge function', () => {
  assert.match(migration, /revoke select[\s\S]*public\.app_admins[\s\S]*from authenticated/i);
  assert.match(migration, /revoke select[\s\S]*public\.admin_audit_log[\s\S]*from authenticated/i);
});

test('public settings keep read access but drop administrative relation privileges', () => {
  assert.match(migration, /revoke references, trigger, truncate[\s\S]*public\.app_settings[\s\S]*from authenticated/i);
});

test('document and message tables retain only their functional app privileges', () => {
  assert.match(migration, /public\.travel_documents/);
  assert.match(migration, /revoke update, references, trigger, truncate[\s\S]*public\.trip_messages[\s\S]*from authenticated/i);
});
