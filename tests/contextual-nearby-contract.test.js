'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function contextApi() {
  const sandbox = { window: {}, Date, Object, Number, String, Array, Math };
  vm.runInNewContext(read('assets/trip-context.js'), sandbox);
  return sandbox.window.TravelMateTripContext;
}

test('Free Time Finder computes a conservative window before the next fixed commitment', () => {
  const api = contextApi();
  const now = new Date('2026-09-30T12:00:00');
  const trip = {
    start: '2026-09-29',
    end: '2026-10-02',
    savedPlaces: [],
    activities: [
      { id: 'coffee', date: '2026-09-30', time: '12:30', scheduleMode: 'flexible' },
      { id: 'tour', date: '2026-09-30', time: '14:00', scheduleMode: 'fixed', title: 'Booked Tour' }
    ]
  };

  const windowInfo = api.freeTimeWindow(trip, now, { bufferMinutes: 30 });
  assert.equal(windowInfo.availableMinutes, 90);
  assert.equal(windowInfo.bufferMinutes, 30);
  assert.equal(windowInfo.nextFixedActivity.record.id, 'tour');
  assert.equal(windowInfo.radiusMeters, 1200);
  assert.equal(windowInfo.openEnded, false);
});

test('Free Time Finder ignores flexible activities as hard deadlines and scales search radius', () => {
  const api = contextApi();

  assert.equal(api.contextualRadiusMeters(30), 800);
  assert.equal(api.contextualRadiusMeters(60), 1200);
  assert.equal(api.contextualRadiusMeters(120), 2000);
  assert.equal(api.contextualRadiusMeters(240), 3000);

  const request = api.buildNearbyRequest({
    position: { lat: 32.0853, lon: 34.7818 },
    availableMinutes: 60,
    now: new Date('2026-09-30T12:00:00'),
    trip: { activities: [], savedPlaces: [] }
  });
  assert.equal(request.userInvoked, true);
  assert.equal(request.availableMinutes, 60);
  assert.equal(request.radiusMeters, 1200);
  assert.equal(api.buildNearbyRequest({ availableMinutes: 60 }), null);
});

test('Contextual Nearby scoring prefers options that fit the available window', () => {
  const api = contextApi();
  const place = { lat: 32.081, lon: 34.782, category: 'cafe', distance: 250 };
  const next = { record: { lat: 32.09, lon: 34.79, time: '15:00', scheduleMode: 'fixed' } };

  const fit = api.contextualNearbyFit(place, {
    userInvoked: true,
    lat: 32.08,
    lon: 34.78,
    availableMinutes: 90,
    nextFixedActivity: next
  });
  const tooShort = api.contextualNearbyFit(place, {
    userInvoked: true,
    lat: 32.08,
    lon: 34.78,
    availableMinutes: 20,
    nextFixedActivity: next
  });

  assert.equal(fit.fit, true);
  assert.equal(tooShort.fit, false);
  assert.ok(fit.totalMinutes > 0);
  assert.equal(api.contextualNearbyFit(place, { userInvoked: false }), null);
});

test('Places exposes contextual search only as an explicit user action', () => {
  const nearby = read('assets/nearby.js');
  const css = read('assets/nearby.css');

  assert.match(nearby, /dataset\.nearbyTimeContext/);
  assert.match(nearby, /data-nearby-time-search/);
  assert.match(nearby, /refreshFreeTimeContext/);
  assert.match(nearby, /controls\.timeSearch\.addEventListener\('click'/);
  assert.match(nearby, /requestGpsConsent\(panel\)/);
  assert.match(nearby, /contextualNearbyFit/);
  assert.match(nearby, /data-context-fit/);
  assert.match(nearby, /המיקום יתבקש רק אחרי אישור מפורש/);
  assert.match(css, /2\.3 Free Time Finder/);

  const featureCss = css.slice(css.indexOf('/* 2.3 Free Time Finder'));
  assert.doesNotMatch(featureCss, /!important/);
});
