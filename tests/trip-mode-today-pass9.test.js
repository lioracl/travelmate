'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const today = require('../assets/custom-trip.js');
const trip = { start: '2026-10-10', end: '2026-10-14', days: 5, activities: [], savedPlaces: [] };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} is not balanced`);
}

test('BEFORE phase reports a deterministic local-calendar daysUntil', () => {
  assert.deepEqual(today.phase(trip, '2026-10-07'), { name: 'before', today: '2026-10-07', daysUntil: 3, dayIndex: 0 });
  assert.equal(today.localDateKey('2026-10-07T23:45:00Z'), '2026-10-07');
  assert.equal(today.localDateKey(new Date(2026, 9, 7, 23, 45)), '2026-10-07');
});

test('ACTIVE phase reports a one-based dayIndex', () => {
  assert.deepEqual(today.phase(trip, '2026-10-12'), { name: 'active', today: '2026-10-12', daysUntil: 0, dayIndex: 3 });
});

test('AFTER phase is reported after the trip end', () => {
  assert.equal(today.phase(trip, '2026-10-15').name, 'after');
});

test('agenda merges dated activities and saved places and sorts by time', () => {
  const value = {
    activities: [{ id: 'late', date: '2026-10-12', time: '14:00', title: 'Late' }, { id: 'other-day', date: '2026-10-13', time: '08:00', title: 'Other' }],
    savedPlaces: [{ id: 'early', date: '2026-10-12', time: '09:30', name: 'Early' }]
  };
  assert.deepEqual(today.agenda(value, '2026-10-12').map(item => [item.kind, item.id]), [['place', 'early'], ['activity', 'late']]);
});

test('current activity wins over a later next item', () => {
  const items = [{ id: 'current', time: '10:00', duration: 90, done: false }, { id: 'next', time: '12:00', duration: 60, done: false }];
  assert.equal(today.currentOrNext(items, 10 * 60 + 30).id, 'current');
});

test('next item is selected when there is no current item', () => {
  const items = [{ id: 'past', time: '09:00', duration: 30, done: false }, { id: 'next', time: '12:00', duration: 60, done: false }];
  assert.equal(today.currentOrNext(items, 11 * 60).id, 'next');
  assert.equal(today.currentOrNext(items, 13 * 60), null);
});

test('done items stay in agenda but are excluded from current and next', () => {
  const value = { activities: [{ id: 'done', date: '2026-10-12', time: '10:00', duration: 120, title: 'Done', done: true }], savedPlaces: [] };
  const items = today.agenda(value, '2026-10-12');
  assert.equal(items.length, 1);
  assert.equal(items[0].done, true);
  assert.equal(today.currentOrNext(items, 10 * 60 + 30), null);
});

test('flexible and window activities stay visible in Today but do not become current or next commitments', () => {
  const value = {
    activities: [
      { id: 'flex', date: '2026-10-12', time: '10:00', duration: 120, title: 'Flexible', scheduleMode: 'flexible' },
      { id: 'window', date: '2026-10-12', time: '11:00', duration: 60, title: 'Window', scheduleMode: 'window' },
      { id: 'fixed', date: '2026-10-12', time: '12:30', duration: 60, title: 'Fixed', scheduleMode: 'fixed' }
    ],
    savedPlaces: []
  };
  const items = today.agenda(value, '2026-10-12');
  assert.deepEqual(items.map(item => item.scheduleMode), ['flexible', 'window', 'fixed']);
  assert.equal(today.currentOrNext(items, 10 * 60 + 30).id, 'fixed');
  assert.equal(today.currentOrNext(items, 13 * 60 + 40), null);
});

test('empty day returns an empty agenda', () => {
  assert.deepEqual(today.agenda(trip, '2026-10-12'), []);
});

test('HTML places Today after weather and before overview control center', () => {
  const html = read('trip/custom/index.html');
  const weather = html.indexOf('data-weather-top-widget');
  const todayRegion = html.indexOf('data-trip-today');
  const overview = html.indexOf('data-overview-control-center');
  assert.ok(weather >= 0 && weather < todayRegion && todayRegion < overview);
});

test('canonical navigation keeps Today classified as an Overview surface', () => {
  assert.match(read('assets/trip-redesign.js'), /overviewClasses = \['trip-overview-summary', 'trip-today', 'trip-home-actions'\]/);
});

test('Plan marks only the active local current day and preserves past-day behavior', () => {
  const enhancement = functionSource(read('assets/auto-planner.js'), 'enhancePastDays');
  assert.match(enhancement, /localDateKey\(new Date\(\)\)/);
  assert.match(enhancement, /phase\(trip,today\)\.name==='active'/);
  assert.match(enhancement, /classList\.toggle\('current-trip-day',current\)/);
  assert.match(enhancement, /setAttribute\('aria-current','date'\)/);
  assert.match(enhancement, /removeAttribute\('aria-current'\)/);
  assert.match(enhancement, /classList\.toggle\('past-trip-day',isPast\)/);
  assert.match(enhancement, /isPast=!current&&value<today/);
  assert.match(read('assets/auto-planner.js'), /if\(currentDay\)collapsedDays\[date\.value\]=false/);
});

test('current-day enhancement does not auto-scroll', () => {
  const enhancement = functionSource(read('assets/auto-planner.js'), 'enhancePastDays');
  const automaticPart = enhancement.split('strip.onclick=')[0];
  assert.doesNotMatch(automaticPart, /scrollIntoView|window\.scroll|scrollTo/);
});

test('refresh uses no broad observer and Today handlers are bound once', () => {
  const custom = read('assets/custom-trip.js');
  const planner = read('assets/auto-planner.js');
  assert.doesNotMatch(custom, /MutationObserver|\.observe\(document\.body/);
  assert.doesNotMatch(planner, /\.observe\(document\.body/);
  assert.equal((custom.match(/root\.addEventListener\('click'/g) || []).length, 1);
  assert.match(custom, /root\.dataset\.weatherBound !== 'true'/);
  const refresh = functionSource(custom, 'refreshOverviewFromStore');
  assert.doesNotMatch(refresh, /saveTrip|queueTripSave|scheduleCloudRefresh|resolveCloudTrip/);
});

test('Today CSS adds no important declarations and repository CSS total remains 212', () => {
  const changedCss = read('assets/trip-redesign.css') + read('assets/auto-planner.css');
  assert.doesNotMatch(changedCss, /trip-today[^{}]*\{[^}]*!important/s);
  assert.doesNotMatch(changedCss, /current-trip-day[^{}]*\{[^}]*!important/s);
  const cssFiles = fs.readdirSync(path.join(root, 'assets')).filter(file => file.endsWith('.css'));
  const total = cssFiles.reduce((sum, file) => sum + (read(`assets/${file}`).match(/!important\b/g) || []).length, 0);
  assert.equal(total, 212);
});
