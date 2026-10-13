'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function context() {
  const window = {};
  const source = fs.readFileSync(path.join(__dirname, '../assets/trip-context.js'), 'utf8');
  vm.runInNewContext(source, { window, Date });
  return window.TravelMateTripContext;
}

const date = '2026-10-13';
function record(id, time, extra = {}) {
  return { id, date, time, duration: 60, scheduleMode: 'fixed', ...extra };
}
function sample(completed = true) {
  return {
    id: 'transition-regression',
    activities: [
      record('first', '12:00'),
      record('middle', '13:00', { done: completed }),
      record('last', '14:00', { travelMinutesBefore: 30 })
    ],
    savedPlaces: [record('completed-place', '13:30', { done: true })]
  };
}

test('completed activities and saved places cannot cause false transition warnings', () => {
  const trip = sample();
  const before = JSON.stringify(trip);
  const assessments = context().transitionAssessmentsForDate(trip, date, { bufferMinutes: 10 });
  assert.equal(assessments['activity:last'].fromId, 'first');
  assert.equal(assessments['activity:last'].gapMinutes, 60);
  assert.equal(assessments['activity:last'].risk, false);
  assert.equal(Object.hasOwn(assessments, 'activity:middle'), false);
  assert.equal(Object.hasOwn(assessments, 'place:completed-place'), false);
  assert.equal(JSON.stringify(trip), before);
});

test('unfinished intermediate commitment remains a genuine transition constraint', () => {
  const assessments = context().transitionAssessmentsForDate(sample(false), date, { bufferMinutes: 10 });
  assert.equal(assessments['activity:last'].fromId, 'middle');
  assert.equal(assessments['activity:last'].risk, true);
  assert.equal(assessments['activity:last'].shortfallMinutes, 40);
});
