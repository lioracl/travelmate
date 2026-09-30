'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Trip context normalizes flexible, window and fixed timing modes', () => {
  const sandbox = { window: {}, Date, Object, Number, String, Array, Math };
  vm.runInNewContext(read('assets/trip-context.js'), sandbox);
  const api = sandbox.window.TravelMateTripContext;

  assert.equal(api.scheduleMode({}), 'planned');
  assert.equal(api.scheduleMode({ scheduleMode: 'flexible' }), 'flexible');
  assert.equal(api.scheduleMode({ timingMode: 'time-window' }), 'window');
  assert.equal(api.scheduleMode({ flexibility: 'reservation' }), 'fixed');

  const date = '2026-10-10';
  assert.equal(api.dayMode({ activities: [{ date, scheduleMode: 'flexible' }], savedPlaces: [] }, date), 'flexible');
  assert.equal(api.dayMode({ activities: [{ date, scheduleMode: 'flexible' }, { date, scheduleMode: 'fixed' }], savedPlaces: [] }, date), 'balanced');
  assert.equal(api.dayMode({ activities: [
    { date, scheduleMode: 'fixed' },
    { date, scheduleMode: 'fixed' },
    { date, scheduleMode: 'fixed' },
    { date, scheduleMode: 'flexible' }
  ], savedPlaces: [] }, date), 'scheduled');

  assert.equal(api.explicitDayMode({ dayModes: { [date]: 'flexible' } }, date), 'flexible');
  assert.equal(api.dayMode({
    dayModes: { [date]: 'flexible' },
    activities: [{ date, scheduleMode: 'fixed' }, { date, scheduleMode: 'fixed' }, { date, scheduleMode: 'fixed' }],
    savedPlaces: []
  }, date), 'flexible');
});

test('Planner stores timing mode and optional preferred window without migrating old trips', () => {
  const planner = read('assets/auto-planner.js');
  assert.match(planner, /name="scheduleMode"/);
  assert.match(planner, /value="flexible"/);
  assert.match(planner, /value="window"/);
  assert.match(planner, /value="fixed"/);
  assert.match(planner, /name="windowStart"/);
  assert.match(planner, /name="windowEnd"/);
  assert.match(planner, /record\.scheduleMode=mode/);
  assert.match(planner, /record\.timeWindowStart=/);
  assert.match(planner, /record\.timeWindowEnd=/);
  assert.match(planner, /scheduleMode:mode\|\|'flexible'/);
});

test('Flexible and window activities do not create hard overlap conflicts or now-next pressure', () => {
  const planner = read('assets/auto-planner.js');
  const polish = read('assets/plan-ux-polish.js');

  assert.match(planner, /mode!==\'flexible\'&&mode!==\'window\'/);
  assert.match(polish, /mode!==\'flexible\'&&mode!==\'window\'/);
});

test('Plan surfaces timing mode and inferred day tone without adding important escalation', () => {
  const planner = read('assets/auto-planner.js');
  const polish = read('assets/plan-ux-polish.js');
  const css = read('assets/auto-planner.css');

  assert.match(planner, /activity-schedule-mode/);
  assert.match(planner, /data-schedule-mode=/);
  assert.match(polish, /dayModeLabel/);
  assert.match(polish, /tm-plan-day-mode/);
  assert.match(css, /2\.1 Flexible Planning/);
  assert.match(css, /activity-schedule-mode/);

  const featureBlock = css.slice(css.indexOf('/* 2.1 Flexible Planning'));
  assert.doesNotMatch(featureBlock, /!important/);
});


test('Quick Add keeps advanced fields behind explicit progressive disclosure', () => {
  const planner = read('assets/auto-planner.js');
  const css = read('assets/auto-planner.css');

  assert.match(planner, /data-planner-details-toggle/);
  assert.match(planner, /data-planner-details hidden/);
  assert.match(planner, /function setComposerDetails\(expanded\)/);
  assert.match(planner, /setComposerDetails\(Boolean\(activity\)\)/);
  assert.match(planner, /function preferredComposerDate\(\)/);
  assert.match(planner, /scheduleMode\.value='flexible'/);
  assert.match(css, /2\.1 Quick Add/);
  assert.match(css, /planner-composer-advanced\[hidden\]/);

  const quickAddCss = css.slice(css.indexOf('/* 2.1 Quick Add'));
  assert.doesNotMatch(quickAddCss, /!important/);
});


test('Plan exposes an optional day-mode override without replacing automatic inference', () => {
  const polish = read('assets/plan-ux-polish.js');
  const css = read('assets/auto-planner.css');

  assert.match(polish, /tm-plan-day-mode-select/);
  assert.match(polish, /value="auto"/);
  assert.match(polish, /value="flexible"/);
  assert.match(polish, /value="balanced"/);
  assert.match(polish, /value="scheduled"/);
  assert.match(polish, /delete trip\.dayModes\[date\]/);
  assert.match(polish, /store&&store\.saveTrip/);
  assert.match(css, /2\.1 Day Mode Control/);

  const dayModeCss = css.slice(css.indexOf('/* 2.1 Day Mode Control'));
  assert.doesNotMatch(dayModeCss, /!important/);
});


test('Travel Time estimates transitions only between timed commitments and flags insufficient arrival time', () => {
  const sandbox = { window: {}, Date, Object, Number, String, Array, Math, Set };
  vm.runInNewContext(read('assets/trip-context.js'), sandbox);
  const api = sandbox.window.TravelMateTripContext;
  const date = '2026-10-10';
  const trip = {
    activities: [
      { id:'a', date, time:'10:00', duration:60, scheduleMode:'fixed', lat:32.0853, lon:34.7818, title:'Museum' },
      { id:'free', date, time:'11:05', duration:30, scheduleMode:'flexible', lat:32.09, lon:34.79, title:'Coffee' },
      { id:'b', date, time:'11:15', duration:60, scheduleMode:'fixed', lat:32.1093, lon:34.8555, title:'Tour' }
    ],
    savedPlaces: []
  };

  const estimate = api.estimateTravelMinutes(trip.activities[0], trip.activities[2]);
  assert.ok(estimate);
  assert.equal(estimate.source, 'estimate');
  assert.ok(estimate.minutes > 0);
  assert.ok(estimate.distanceKm > 0);

  const assessment = api.transitionAssessment(trip.activities[0], trip.activities[2]);
  assert.equal(assessment.gapMinutes, 15);
  assert.equal(assessment.risk, true);
  assert.ok(assessment.shortfallMinutes > 0);
  assert.match(assessment.latestDepartureTime, /^\d{2}:\d{2}$/);

  const relaxedNext = Object.assign({}, trip.activities[2], { id:'c', time:'13:00' });
  const relaxed = api.transitionAssessment(trip.activities[0], relaxedNext);
  assert.equal(relaxed.risk, false);
  assert.match(relaxed.latestDepartureTime, /^\d{2}:\d{2}$/);

  const map = api.transitionAssessmentsForDate(trip, date);
  assert.ok(map['activity:b']);
  assert.equal(map['activity:b'].fromId, 'a');
  assert.equal(map['activity:b'].risk, true);
  assert.equal(map['activity:free'], undefined);
});

test('Travel Time UI remains advisory and introduces no important escalation', () => {
  const polish = read('assets/plan-ux-polish.js');
  const css = read('assets/auto-planner.css');

  assert.match(polish, /transitionAssessmentsForDate/);
  assert.match(polish, /tm-plan-transition/);
  assert.match(polish, /tm-plan-travel-risk/);
  assert.match(css, /2\.2 Travel Time \+ Smart Conflicts/);

  const featureCss = css.slice(css.indexOf('/* 2.2 Travel Time + Smart Conflicts'));
  assert.doesNotMatch(featureCss, /!important/);
});
