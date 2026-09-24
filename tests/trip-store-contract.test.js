'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('Trip Store exposes one synchronous local persistence facade', () => {
  const store = read('assets/trip-store.js');
  assert.match(store, /window\.TravelMateTripStore = Object\.freeze\(/);
  for (const method of ['getTrips', 'getTrip', 'saveTrip', 'updateTrip', 'removeTrip']) {
    assert.match(store, new RegExp('\\b' + method + '\\b'));
  }
  assert.match(store, /service\.getLocalTrips\(\)/);
  assert.match(store, /service\.upsertLocalTrip\(trip\)/);
  assert.match(store, /service\.queueTripSave\(trip, options\.delay\)/);
  assert.match(store, /service\.removeLocalTrip\(id, ownerId\)/);
});

test('Trip Store loads after Cloud Sync and before trip feature code on every entry point', () => {
  for (const relative of ['index.html', 'trip/custom/index.html', 'trip/italy-2028/index.html', 'trip/japan-2027/index.html']) {
    const html = read(relative);
    const cloud = html.indexOf('cloud-sync.js');
    const store = html.indexOf('trip-store.js');
    const app = html.indexOf('app.js');
    assert.ok(cloud >= 0, relative + ' must load cloud-sync.js');
    assert.ok(store > cloud, relative + ' must load trip-store.js after cloud-sync.js');
    assert.ok(app > store, relative + ' must load app.js after trip-store.js');
    if (relative === 'trip/custom/index.html') {
      const customTrip = html.indexOf('custom-trip.js');
      assert.ok(customTrip > store, relative + ' must load custom-trip.js after trip-store.js');
    }
  }
});

test('high-risk feature writers no longer access travelmate-trips directly', () => {
  for (const relative of [
    'assets/app.js',
    'assets/ai-assistant.js',
    'assets/auto-planner.js',
    'assets/lodging-manager.js',
    'assets/custom-trip.js'
  ]) {
    const source = read(relative);
    assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\(\s*['"]travelmate-trips['"]/,
      relative + ' must use TravelMateTripStore instead of direct trip storage');
  }
});

test('migrated writers preserve feature ownership while delegating persistence', () => {
  const app = read('assets/app.js');
  assert.match(app, /tripStore\.updateTrip\(trip\.id/);
  assert.match(app, /TravelMateTripStore\.saveTrip\(trip\)/);

  const planner = read('assets/auto-planner.js');
  assert.match(planner, /store\.updateTrip\(trip\.id/);

  const assistant = read('assets/ai-assistant.js');
  assert.match(assistant, /store\.saveTrip\(trip\)/);

  const lodging = read('assets/lodging-manager.js');
  assert.match(lodging, /TravelMateTripStore\.updateTrip\(trip\.id/);
  assert.match(lodging, /managedAnchor/);
});

test('travelmate-trips storage key is owned only by Cloud Sync and Trip Store', () => {
  const assetsDir = path.join(root, 'assets');
  const owners = fs.readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => /['\"]travelmate-trips['\"]/.test(fs.readFileSync(path.join(assetsDir, name), 'utf8')))
    .sort();
  assert.deepEqual(owners, ['cloud-sync.js', 'trip-store.js']);
});

test('Trip Store is part of the offline application shell', () => {
  const sw = read('sw.js');
  assert.match(sw, /\.\/assets\/trip-store\.js/);
});
