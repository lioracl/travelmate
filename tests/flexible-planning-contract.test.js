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
