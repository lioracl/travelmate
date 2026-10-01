'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const contextSource = fs.readFileSync('assets/trip-context.js', 'utf8');
const analyticsSource = fs.readFileSync('assets/trip-analytics.js', 'utf8');

function api() {
  const window = { dispatchEvent() {} };
  const sandbox = {
    window, Date, Object, Number, String, Array, Math, URL,
    CustomEvent: function CustomEvent(type) { this.type = type; }
  };
  vm.runInNewContext(contextSource, sandbox);
  vm.runInNewContext(analyticsSource, sandbox);
  return window.TravelMateTripAnalytics;
}

test('personal stats aggregate only owned trips', () => {
  const a = api();
  const stats = a.buildPersonalStats([
    {
      id: 't1', ownerId: 'u1', days: 3,
      activities: [
        { id: 'a1', date: '2026-09-01', time: '10:00', done: true, lat: 50.08, lon: 14.42 },
        { id: 'a2', date: '2026-09-01', time: '13:00', done: true, lat: 50.09, lon: 14.43 }
      ]
    },
    {
      id: 't2', ownerId: 'u1', days: 2,
      savedPlaces: [
        { id: 'p1', date: '2026-09-10', time: '11:00', done: true, lat: 48.20, lon: 16.37 }
      ]
    },
    {
      id: 'shared', ownerId: 'u2', days: 20,
      activities: [
        { id: 'a9', date: '2026-09-01', time: '10:00', done: true, lat: 40, lon: 20 }
      ]
    }
  ], 'u1');

  assert.equal(stats.tripsCount, 2);
  assert.equal(stats.totalDays, 5);
  assert.equal(stats.completedVisits, 3);
  assert.equal(stats.completedActivities, 2);
  assert.equal(stats.completedPlaces, 1);
});

test('personal stats exclude deleted trips and cap the input safely', () => {
  const a = api();
  const trips = Array.from({ length: 60 }, (_, index) => ({
    id: 't' + index,
    ownerId: 'u1',
    days: 1,
    activities: []
  }));
  trips[2].deletedAt = '2026-09-01T00:00:00Z';
  const stats = a.buildPersonalStats(trips, 'u1');
  assert.equal(stats.tripsCount, 50);
});
