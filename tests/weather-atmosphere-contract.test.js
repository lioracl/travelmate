'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets', 'weather-widget.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'weather-widget.css'), 'utf8');

function classifier() {
  const start = js.indexOf('function weatherAtmosphere(');
  const end = js.indexOf('function contextSnapshot(', start);
  assert.ok(start >= 0 && end > start, 'weather atmosphere classifier must exist before context snapshot');
  const context = {};
  vm.runInNewContext(js.slice(start, end) + '\nthis.classify = weatherAtmosphere;', context);
  return context.classify;
}

test('weather atmosphere maps Open-Meteo current conditions deterministically', () => {
  const classify = classifier();
  assert.equal(classify(0, 1, 22, 22), 'clear-day');
  assert.equal(classify(0, 0, 18, 18), 'clear-night');
  assert.equal(classify(2, 1, 24, 24), 'clouds');
  assert.equal(classify(45, 1, 18, 18), 'fog');
  assert.equal(classify(51, 1, 18, 18), 'rain');
  assert.equal(classify(61, 1, 18, 18), 'rain');
  assert.equal(classify(80, 1, 18, 18), 'rain');
  assert.equal(classify(71, 1, -2, -5), 'snow');
  assert.equal(classify(85, 1, 0, -2), 'snow');
  assert.equal(classify(95, 1, 38, 42), 'storm');
  assert.equal(classify(0, 1, 35, 37), 'heat');
  assert.equal(classify(3, 1, 36, 38), 'heat');
});

test('atmosphere stays inside the existing Weather owner and uses existing forecast fields only', () => {
  const start = js.indexOf('function weatherAtmosphere(');
  const end = js.indexOf('function contextSnapshot(', start);
  const block = js.slice(start, end);
  assert.doesNotMatch(block, /fetch\s*\(|geolocation|supabase|askAi|localStorage/);
  assert.match(js, /data-weather-atmosphere="idle" aria-hidden="true"/);
  assert.match(js, /var currentAtmosphere = weatherAtmosphere\(current\.weather_code, current\.is_day, current\.temperature_2m, current\.apparent_temperature\)/);
  assert.match(js, /ui\.atmosphere\.dataset\.weatherAtmosphere = currentAtmosphere/);
  assert.match(js, /atmosphere: button\.querySelector\('\[data-weather-atmosphere\]'\)/);
});

test('weather atmosphere is decorative, motion-safe and adds no specificity escalation', () => {
  const marker = '/* Dynamic Weather Atmosphere */';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, 'Dynamic Weather Atmosphere CSS block must exist');
  const block = css.slice(start);
  assert.match(block, /\.weather-atmosphere\{[^}]*pointer-events:none/);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)\{[^}]*animation:none;transition:none/);
  assert.match(block, /@media\(prefers-reduced-transparency:reduce\)\{\.weather-atmosphere\{display:none\}\}/);
  assert.match(block, /data-weather-atmosphere="clear-night"/);
  assert.match(block, /data-weather-atmosphere="storm"/);
  assert.match(block, /data-weather-atmosphere="snow"/);
  assert.match(block, /data-weather-atmosphere="fog"/);
  assert.match(block, /--tm-weather-cloud-scale:\.72/);
  assert.match(block, /weather-cloud-drift\{from\{transform:translate3d\(-5px,0,0\) scale\(var\(--tm-weather-cloud-scale\)\)/);
  assert.doesNotMatch(block, /!important/);
});


test('modal reuses current atmosphere and forecast days expose condition accents', () => {
  assert.match(js, /weather-live-scene weather-atmosphere/);
  assert.match(js, /data-weather-atmosphere="' \+ currentAtmosphere/);
  assert.match(js, /data-weather-day="' \+ dayAtmosphere/);
  assert.match(js, /var dayAtmosphere = weatherAtmosphere\(daily\.weather_code\[index\]/);
});

test('advice names its target day and explains mixed-condition UV peaks', () => {
  assert.match(js, /title: uvDay === 'היום' \? 'UV גבוה היום' : 'UV גבוה ב' \+ uvDay/);
  assert.match(js, /זהו שיא ה־UV היומי הצפוי, גם אם בחלק מהיום התחזית מעוננת או גשומה/);
  assert.match(js, /title: rainDay === 'היום' \? 'גשם צפוי היום' : 'גשם צפוי ב' \+ rainDay/);
  assert.match(js, /title: windDay === 'היום' \? 'רוח חזקה צפויה היום' : 'רוח חזקה צפויה ב' \+ windDay/);
});

test('color pass enriches all atmosphere states without accessibility or specificity debt', () => {
  const marker = '/* Weather Atmosphere Color Pass */';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1);
  const block = css.slice(start);
  for (const state of ['clear-day','heat','clear-night','clouds','rain','storm','snow','fog']) assert.match(block, new RegExp('data-weather-atmosphere="' + state + '"'));
  assert.match(block, /weather-live-scene\.weather-atmosphere/);
  assert.match(block, /data-weather-day="rain"/);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(block, /!important/);
});
