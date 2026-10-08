'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const today = require('../assets/custom-trip.js');
const compact = require('../assets/today-activities.js');
const source = fs.readFileSync(path.join(root, 'assets/today-activities.js'), 'utf8');
const brief = fs.readFileSync(path.join(root, 'assets/today-brief.js'), 'utf8');

function at(hour, minute, day = 8) {
  return new Date(2026, 9, day, hour, minute, 0, 0);
}
function activeTrip(activities) {
  return { start:'2026-10-08', end:'2026-10-10', days:3, activities, savedPlaces:[] };
}

test('custom compact Today uses canonical selection and skips done flexible and window items', () => {
  const trip = activeTrip([
    { id:'done', date:'2026-10-08', time:'11:00', duration:120, title:'Done', done:true, scheduleMode:'fixed' },
    { id:'flex', date:'2026-10-08', time:'11:10', duration:120, title:'Flexible', scheduleMode:'flexible' },
    { id:'window', date:'2026-10-08', time:'11:20', duration:60, title:'Window', scheduleMode:'window' },
    { id:'fixed', date:'2026-10-08', time:'12:00', duration:60, title:'Fixed', scheduleMode:'fixed' }
  ]);
  const now = at(11, 30);
  const model = today.model(trip, now);
  assert.equal(model.currentOrNext.id, 'fixed');
  const result = compact.summaryFromModel(model, now);
  assert.equal(result.activity.id, 'fixed');
  assert.equal(result.status, 'עוד 30 דקות');
});

test('current fixed commitment is described as happening now', () => {
  const trip = activeTrip([{ id:'current', date:'2026-10-08', time:'11:00', duration:90, title:'Current', scheduleMode:'fixed' }]);
  const now = at(11, 30);
  const result = compact.summaryFromModel(today.model(trip, now), now);
  assert.equal(result.activity.id, 'current');
  assert.equal(result.status, 'מתקיים עכשיו');
});

test('flexible-only remainder stays visible as an open flexible day without becoming next commitment', () => {
  const trip = activeTrip([{ id:'flex', date:'2026-10-08', time:'12:00', duration:120, title:'Flexible', scheduleMode:'flexible' }]);
  const now = at(11, 30);
  const model = today.model(trip, now);
  assert.equal(model.currentOrNext, null);
  assert.equal(compact.summaryFromModel(model, now).status, 'היום פתוח וגמיש');
});

test('before and after phases share the canonical trip model', () => {
  const trip = activeTrip([]);
  assert.equal(compact.summaryFromModel(today.model(trip, at(12, 0, 7)), at(12, 0, 7)).status, 'מחר יוצאים לדרך');
  assert.equal(compact.summaryFromModel(today.model(trip, at(12, 0, 11)), at(12, 0, 11)).status, 'הטיול הסתיים');
});

test('next commitment wording updates correctly at the minute boundary', () => {
  const trip = activeTrip([{ id:'next', date:'2026-10-08', time:'12:00', duration:60, title:'Next', scheduleMode:'fixed' }]);
  assert.equal(compact.summaryFromModel(today.model(trip, at(11, 58)), at(11, 58)).status, 'עוד 2 דקות');
  assert.equal(compact.summaryFromModel(today.model(trip, at(11, 59)), at(11, 59)).status, 'מתחיל עכשיו');
});

test('custom runtime consumes TravelMateToday.model and does not use the legacy selector', () => {
  const customStart = source.indexOf('  function enhanceCustom() {');
  const customEnd = source.indexOf('  var initScheduled = false;', customStart);
  assert.ok(customStart >= 0 && customEnd > customStart, 'custom Today runtime block is bounded');
  const custom = source.slice(customStart, customEnd);
  assert.match(custom, /TravelMateToday\.model\(freshTrip, now\)/);
  assert.match(custom, /summaryFromModel\(model, now\)/);
  assert.doesNotMatch(custom, /selectNextActivity\(/);
  assert.doesNotMatch(source, /function customActivityData\(/);
});

test('minute refresh is aligned, idempotent and shared with Today Brief', () => {
  assert.match(source, /var initScheduled = false/);
  assert.match(source, /Promise\.resolve\(\)\.then/);
  assert.doesNotMatch(source, /observer\.observe\(document\.body/);
  assert.match(source, /var started = false, minuteTimer = 0/);
  assert.match(source, /if \(started\) return;/);
  assert.match(source, /60000 - \(Date\.now\(\) % 60000\) \+ 25/);
  assert.match(source, /travelmate:today-minute/);
  assert.doesNotMatch(source, /setInterval\(renderSummary, 60000\)/);
  assert.match(brief, /travelmate:today-minute/);
});
