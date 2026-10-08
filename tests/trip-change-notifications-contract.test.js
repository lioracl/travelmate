'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('assets/trip-change-notifications.js');
const css = read('assets/trip-change-notifications.css');
const cloud = read('assets/cloud-sync.js');
const helpers = require('../assets/trip-change-notifications.js');

test('notification helpers suppress own events and count unread external changes', () => {
  const events = [
    { id: 1, actor_user_id: 'me' },
    { id: 2, actor_user_id: 'other' },
    { id: 3, actor_user_id: 'other' },
    { id: 4, actor_user_id: 'me' }
  ];
  assert.deepEqual(helpers.externalEvents(events, 'me').map(item => item.id), [2, 3]);
  assert.equal(helpers.unreadCount(events, 'me', 1), 2);
  assert.equal(helpers.unreadCount(events, 'me', 2), 1);
  assert.equal(helpers.unreadCount(events, 'me', 4), 0);
});

test('deep-link routing is bounded to existing trip views', () => {
  assert.equal(helpers.targetView({ entity_type: 'activity' }), 'plan');
  assert.equal(helpers.targetView({ entity_type: 'plan' }), 'plan');
  assert.equal(helpers.targetView({ entity_type: 'place' }), 'places');
  assert.equal(helpers.targetView({ entity_type: 'places' }), 'places');
  assert.equal(helpers.targetView({ entity_type: 'budget' }), 'budget');
  assert.equal(helpers.targetView({ entity_type: 'transport' }), 'transport');
  assert.equal(helpers.targetView({ entity_type: 'lodging' }), 'places');
  assert.equal(helpers.targetView({ entity_type: 'unknown' }), 'overview');
});

test('change summaries expose categories/actions rather than private payload content', () => {
  assert.equal(helpers.actionLabel({ entity_type: 'activity', action: 'added' }), 'נוספה פעילות לתוכנית');
  assert.equal(helpers.actionLabel({ entity_type: 'place', action: 'removed' }), 'מקום הוסר מהטיול');
  const mixed = helpers.actionLabel({ entity_type: 'trip', summary: { plan_changed: true, budget_changed: true } });
  assert.match(mixed, /התוכנית/);
  assert.match(mixed, /התקציב/);
});

test('cloud API uses persisted events as source of truth and fetches the latest bounded window', () => {
  assert.match(cloud, /from\('trip_change_events'\)/);
  assert.match(cloud, /select\('id,actor_user_id,revision,entity_type,entity_id,action,summary,severity,created_at'\)/);
  assert.match(cloud, /order\('id', \{ ascending: false \}\)\.limit\(boundedLimit\)/);
  assert.match(cloud, /return \(result\.data \|\| \[\]\)\.slice\(\)\.reverse\(\)/);
  assert.match(cloud, /from\('trip_change_read_state'\)/);
});

test('read state is written only through the monotonic RPC', () => {
  assert.match(cloud, /rpc\('mark_trip_changes_read'/);
  assert.doesNotMatch(cloud, /from\('trip_change_read_state'\)[\s\S]{0,300}\.(?:insert|upsert|update)\(/);
  assert.match(source, /cloud\.markTripChangesRead\(ownerId\(\), state\.trip\.id, value\)/);
});

test('realtime is an INSERT signal fenced by owner and auth generation', () => {
  assert.match(cloud, /table: 'trip_change_events'/);
  assert.match(cloud, /event: 'INSERT'/);
  assert.match(cloud, /subscriberGeneration !== authGeneration/);
  assert.match(cloud, /String\(payload\.new\.trip_owner_id \|\| ''\) !== String\(ownerId\)/);
  assert.match(source, /mergeEvent\(event\)/);
  assert.match(source, /refresh\(true\)/);
});

test('offline catch-up and account lifecycle are explicit', () => {
  assert.match(source, /navigator\.onLine === false/);
  assert.match(source, /addEventListener\('online'/);
  assert.match(source, /travelmate:sync-restored/);
  assert.match(source, /cloud\.onAuthChange/);
  assert.match(source, /state\.accountToken \+= 1/);
  assert.match(source, /await stopRealtime\(\)/);
});

test('refresh errors fail closed and clear memory-backed event data', () => {
  assert.match(source, /state\.events = \[\];[\s\S]*state\.members = \[\];[\s\S]*state\.lastReadId = 0;[\s\S]*setLaunchersVisible\(false\);[\s\S]*await stopRealtime\(\)/);
});

test('notification UI is accessible and does not request push permissions', () => {
  assert.match(source, /aria-haspopup', 'dialog'/);
  assert.match(source, /setAttribute\('aria-expanded'/);
  assert.match(source, /setAttribute\('role', 'dialog'\)/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(source, /requestPermission\s*\(/);
  assert.doesNotMatch(source, /PushManager|showNotification|serviceWorker\.ready/);
});

test('CSS is scoped, mobile-safe and reduced-motion aware', () => {
  assert.match(css, /\.trip-notification-panel/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /is-trip-notification-target/);
  assert.doesNotMatch(css, /!important\b/);
  assert.doesNotMatch(css, /weather|hero/i);
});

test('all trip entry points load notification assets and SW caches them', () => {
  ['trip/custom/index.html', 'trip/italy-2028/index.html', 'trip/japan-2027/index.html'].forEach(file => {
    const html = read(file);
    assert.match(html, /trip-change-notifications\.css\?v=/, file + ' CSS');
    assert.match(html, /trip-change-notifications\.js\?v=/, file + ' JS');
  });
  const sw = read('sw.js');
  assert.match(sw, /'\.\/assets\/trip-change-notifications\.css'/);
  assert.match(sw, /'\.\/assets\/trip-change-notifications\.js'/);
});

test('exact activity/place targets are optional and removed items fall back to their screen', () => {
  assert.match(source, /event\.entity_id && event\.action !== 'removed'/);
  assert.match(source, /TravelMatePlanner\.openDay\(record\.date\)/);
  assert.match(source, /\[data-activity-id\]/);
  assert.match(source, /\[data-saved-shelf-id\]/);
  assert.match(source, /data-saved-places-toggle/);
});
