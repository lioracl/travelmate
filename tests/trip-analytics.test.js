'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contextSource = fs.readFileSync(path.resolve(__dirname, '../assets/trip-context.js'), 'utf8');
const analyticsSource = fs.readFileSync(path.resolve(__dirname, '../assets/trip-analytics.js'), 'utf8');

function loadApi() {
  const window = { dispatchEvent() {} };
  const sandbox = {
    window,
    Date,
    Object,
    Number,
    String,
    Array,
    Math,
    URL,
    CustomEvent: function CustomEvent(type) { this.type = type; }
  };
  vm.runInNewContext(contextSource, sandbox, { filename: 'trip-context.js' });
  vm.runInNewContext(analyticsSource, sandbox, { filename: 'trip-analytics.js' });
  return window.TravelMateTripAnalytics;
}

test('Trip Analytics counts only completed visits and preserves daily facts', () => {
  const api = loadApi();
  const data = api.build({
    activities: [
      { id: 'a1', title: 'Museum', date: '2026-09-28', time: '10:00', done: true, lat: 50.08, lon: 14.42 },
      { id: 'a2', title: 'Cafe', date: '2026-09-28', time: '13:00', done: false, lat: 50.09, lon: 14.43 },
      { id: 'a3', title: 'Park', date: '2026-09-29', time: '11:00', done: true, lat: 50.10, lon: 14.44 }
    ],
    savedPlaces: [
      { id: 'p1', name: 'Old Town', date: '2026-09-28', time: '15:00', done: true, lat: 50.081, lon: 14.421 }
    ]
  });

  assert.equal(data.completedVisits, 3);
  assert.equal(data.completedActivities, 2);
  assert.equal(data.completedPlaces, 1);
  assert.equal(data.activeDays, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(data.days)), [
    { date: '2026-09-28', completedVisits: 2, activities: 1, places: 1 },
    { date: '2026-09-29', completedVisits: 1, activities: 1, places: 0 }
  ]);
});

test('Trip Analytics reuses TripContext and labels coordinate distance as estimated', () => {
  const api = loadApi();
  const data = api.build({
    activities: [
      { id: 'a1', date: '2026-09-28', time: '10:00', duration: 60, done: true, lat: 50.08, lon: 14.42 },
      { id: 'a2', date: '2026-09-28', time: '12:00', duration: 60, done: true, lat: 50.09, lon: 14.43, travelMode: 'walking' },
      { id: 'a3', date: '2026-09-28', time: '15:00', duration: 60, done: true, lat: 50.10, lon: 14.44, travelMode: 'transit', transitionMinutes: 25 }
    ]
  });

  assert.ok(data.movement.distanceKm > 0);
  assert.ok(data.movement.walkingDistanceKm > 0);
  assert.ok(data.movement.transportDistanceKm > 0);
  assert.equal(data.status.distance, 'estimated');
  assert.equal(data.status.travelTime, 'estimated');
  assert.ok(data.coverage.segmentCoverage > 0);
});

test('Trip Analytics reports unknown movement when there is no calculable segment', () => {
  const api = loadApi();
  const data = api.build({
    activities: [
      { id: 'a1', date: '2026-09-28', time: '10:00', done: true },
      { id: 'a2', date: '2026-09-29', time: '10:00', done: true }
    ]
  });

  assert.equal(data.movement.distanceKm, 0);
  assert.equal(data.movement.travelMinutes, 0);
  assert.equal(data.status.distance, 'unknown');
  assert.equal(data.status.travelTime, 'unknown');
});

test('Trip Analytics marks travel time confirmed only when every segment has explicit duration', () => {
  const api = loadApi();
  const data = api.build({
    activities: [
      { id: 'a1', date: '2026-09-28', time: '10:00', duration: 60, done: true, lat: 50.08, lon: 14.42 },
      { id: 'a2', date: '2026-09-28', time: '12:00', duration: 60, done: true, lat: 50.09, lon: 14.43, travelMinutesBefore: 35 }
    ]
  });

  assert.equal(data.status.travelTime, 'confirmed');
  assert.equal(data.movement.manualTimeCoverage, 1);
});
