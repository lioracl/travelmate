'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261008194600_trip_change_events.sql'), 'utf8');

test('change event foundation is additive and does not replace trip save RPC', () => {
  assert.match(migration, /create table public\.trip_change_events/);
  assert.match(migration, /create table public\.trip_change_read_state/);
  assert.doesNotMatch(migration, /create or replace function public\.save_travel_trip/i);
});

test('event log is durable, ordered and deduplicated by mutation', () => {
  assert.match(migration, /id bigint generated always as identity primary key/);
  assert.match(migration, /mutation_id uuid not null/);
  assert.match(migration, /revision bigint not null check \(revision > 0\)/);
  assert.match(migration, /unique \(trip_owner_id, trip_id, mutation_id\)/);
  assert.match(migration, /trip_change_events_trip_order_idx/);
  assert.match(migration, /on conflict \(trip_owner_id, trip_id, mutation_id\) do nothing/);
});

test('event payload is sanitized metadata rather than user content', () => {
  ['plan_changed','places_changed','budget_changed','transport_changed','lodging_changed','trip_details_changed'].forEach(key => assert.match(migration, new RegExp("'" + key + "'")));
  assert.match(migration, /octet_length\(summary::text\) <= 2048/);
  assert.doesNotMatch(migration, /summary[^\n]*(description|notes|document|health|medical)/i);
  assert.doesNotMatch(migration, /new\.payload\s*(,|\))/i);
});

test('only successful non-deleted revision updates create events', () => {
  assert.match(migration, /after update of[\s\S]*on public\.travel_trips/);
  assert.match(migration, /old\.revision is distinct from new\.revision/);
  assert.match(migration, /old\.deleted_at is null and new\.deleted_at is null/);
  assert.match(migration, /new\.last_mutation_id is null/);
  assert.match(migration, /new\.last_mutation_by is null/);
});

test('events and read state use RLS, least privilege and MFA', () => {
  assert.match(migration, /alter table public\.trip_change_events enable row level security/);
  assert.match(migration, /alter table public\.trip_change_read_state enable row level security/);
  assert.match(migration, /revoke all on table public\.trip_change_events from anon, authenticated/);
  assert.match(migration, /grant select on table public\.trip_change_events to authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.trip_change_read_state to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*trip_change_read_state/i);
  assert.match(migration, /create policy \"MFA protects trip change events\"[\s\S]*?as restrictive/);
  assert.match(migration, /MFA protects trip change read state/);
});

test('membership visibility starts at join time and removed members lose access', () => {
  assert.match(migration, /public\.is_trip_member\(trip_owner_id, trip_id\)/);
  assert.match(migration, /trip_change_events\.created_at >= m\.joined_at/);
  assert.match(migration, /m\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /t\.deleted_at is null/);
});

test('read pointer can target only a visible event in the same trip', () => {
  assert.match(migration, /e\.id = trip_change_read_state\.last_read_event_id/);
  assert.match(migration, /e\.trip_owner_id = trip_change_read_state\.trip_owner_id/);
  assert.match(migration, /e\.trip_id = trip_change_read_state\.trip_id/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
});

test('realtime publishes persisted events and trigger helper is not client callable', () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.trip_change_events/);
  assert.match(migration, /create or replace function private\.log_trip_change_event\(\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function private\.log_trip_change_event\(\) from public, anon, authenticated/);
});
