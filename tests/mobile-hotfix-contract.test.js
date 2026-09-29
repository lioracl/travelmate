'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Overview Today rebinds a replaced toggle instead of trusting stale card state', () => {
  const source = read('assets/today-activities.js');
  assert.match(source, /toggle\.dataset\.todayActivitiesBound !== 'true'/);
  assert.match(source, /toggle\.dataset\.todayActivitiesBound = 'true'/);
  assert.match(source, /card\.dataset\.todayActivitiesLessBound !== 'true'/);
  assert.doesNotMatch(source, /card\.dataset\.todayActivitiesBound === 'true'/);
});

test('mobile past-day history uses stable equal-width grid cells', () => {
  const css = read('assets/plan-ux-polish.css');
  assert.match(css, /past-days-strip>div\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /past-days-strip button\{[\s\S]*white-space:normal/);
});

test('Places hides duplicated legacy radius controls after modern discovery initializes', () => {
  const css = read('assets/nearby.css');
  assert.match(css, /nearby-panel\[data-nearby-initialized="true"\]>\.nearby-controls\{display:none\}/);
});

test('Places chooses search distance by context rather than exposing radius as a primary control', () => {
  const source = read('assets/nearby.js');
  assert.match(source, /radiusSelect\.value=mode==='gps'\?'1000':mode==='destination'\?'3000'/);
  assert.doesNotMatch(source, /מקומות ברדיוס שבחרת/);
  assert.match(source, /מקומות בסביבת האזור שבחרת/);
});


test('past Plan days remain hidden until the history strip explicitly reopens them', () => {
  const css = read('assets/plan-ux-polish.css');
  assert.match(css, /html body\.tm-new-design\[data-trip-view="plan"\] #plan \.generated-day\.past-trip-day:not\(\.past-trip-day-open\)\{\s*display:none\s*\}/);
});


test('past-day strip keeps stable DOM while UX polish adds progress metadata', () => {
  const source = read('assets/auto-planner.js');
  assert.match(source, /stripSignature=past\.map/);
  assert.match(source, /strip\.dataset\.renderSignature!==stripSignature/);
  assert.doesNotMatch(source, /strip\.innerHTML!==nextStripHtml/);
});
