const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260921124726_safety_pack_3_mfa_permissions.sql'),
  'utf8'
);
const adminCenter = fs.readFileSync(
  path.join(root, 'supabase/functions/admin-center/index.ts'),
  'utf8'
);

test('collaboration RPCs require MFA when enrolled', () => {
  const matches = migration.match(/if not public\.mfa_satisfied_if_enrolled\(\) then/g) || [];
  assert.equal(matches.length, 2);
  assert.match(migration, /create or replace function public\.create_trip_invite/);
  assert.match(migration, /create or replace function public\.accept_trip_invite/);
});

test('re-accepting an invite is idempotent for an existing member', () => {
  assert.match(migration, /if exists \([\s\S]*from public\.trip_members[\s\S]*user_id = actor_id[\s\S]*already_member', true/);
  assert.match(migration, /set use_count = use_count \+ 1/);
});

test('authenticated trip member grants keep only app-required data operations', () => {
  assert.match(migration, /revoke insert, references, trigger, truncate[\s\S]*public\.trip_members[\s\S]*authenticated/);
});

test('admin personal-data reads and writes require aal2', () => {
  for (const action of ['list-users', 'update-user', 'update-role', 'settings', 'update-settings', 'audit']) {
    assert.match(adminCenter, new RegExp("'" + action + "'"));
  }
  assert.match(adminCenter, /sensitive\.has\(action\) && jwtPayload\(token\)\.aal !== 'aal2'/);
});

test('admin center allows the active local TravelMate development port', () => {
  assert.match(adminCenter, /http:\/\/127\.0\.0\.1:8001/);
  assert.match(adminCenter, /http:\/\/localhost:8001/);
});

test('legacy day activity renderer escapes user-controlled values before innerHTML', () => {
  const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
  assert.match(app, /<time>'\+escapePlannerText\(time\)\+'<\/time>/);
  assert.match(app, /חדש · '\+escapePlannerText\(category\)/);
  assert.match(app, /<strong>'\+escapePlannerText\(title\)\+'<\/strong>/);
  assert.match(app, /משך: '\+escapePlannerText\(duration\)\+' דק׳/);
  assert.doesNotMatch(app, /<strong>'\+title\+'<\/strong>/);
});
