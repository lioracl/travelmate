const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20260921142800_safety_pack_7_revoke_anon_member_rpcs.sql'),
  'utf8'
);

test('collaborator management RPCs explicitly revoke anon execution', () => {
  assert.match(sql, /revoke all on function public\.update_trip_member_role\(uuid,text,uuid,text\) from anon/i);
  assert.match(sql, /revoke all on function public\.remove_trip_member\(uuid,text,uuid\) from anon/i);
});
