'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261008203231_trip_change_event_ui_contract.sql'), 'utf8');

test('single activity/place changes can expose only an opaque entity id', () => {
  assert.match(migration, /private\.single_changed_record_id/);
  assert.match(migration, /event_entity := 'activity'/);
  assert.match(migration, /event_entity := 'place'/);
  assert.match(migration, /event_entity_id := private\.single_changed_record_id/);
  assert.match(migration, /char_length\(entity_id\) between 1 and 180/);
  assert.doesNotMatch(migration, /event_entity_id\s*:=\s*.*(?:title|name|description)/i);
});

test('activity/place action stays bounded to added removed updated', () => {
  assert.match(migration, /event_action text := 'updated'/);
  assert.match(migration, /event_action := 'added'/);
  assert.match(migration, /event_action := 'removed'/);
});

test('read state is advanced only through an authenticated MFA protected RPC', () => {
  assert.match(migration, /create or replace function public\.mark_trip_changes_read/);
  assert.match(migration, /actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /mfa_satisfied_if_enrolled\(\)/);
  assert.match(migration, /e\.created_at >= m\.joined_at/);
  assert.match(migration, /t\.deleted_at is null/);
});

test('mark-read is monotonic across tabs and retries', () => {
  assert.match(migration, /greatest\(coalesce\(public\.trip_change_read_state\.last_read_event_id, 0\), excluded\.last_read_event_id\)/);
  assert.match(migration, /on conflict \(trip_owner_id, trip_id, user_id\) do update/);
});

test('clients cannot directly mutate read state after RPC hardening', () => {
  assert.match(migration, /revoke insert, update on table public\.trip_change_read_state from authenticated/);
  assert.match(migration, /grant select on table public\.trip_change_read_state to authenticated/);
  assert.match(migration, /grant execute on function public\.mark_trip_changes_read/);
});

test('private diff helper remains unavailable to app roles', () => {
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function private\.single_changed_record_id\(jsonb, jsonb\) from public, anon, authenticated/);
});
