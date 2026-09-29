'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('assets/app.js');
const css = read('assets/nearby.css');

test('saved places exposes one lifecycle shelf with scheduled and saved-only counts', () => {
  assert.match(app, /data-saved-places-shelf/);
  assert.match(app, /data-saved-places-scheduled/);
  assert.match(app, /data-saved-places-unscheduled/);
  assert.match(app, /המקומות ששמרתי/);
  assert.match(app, /נשמר כאן · עדיין לא תוזמן/);
  assert.match(app, /בתוכנית · /);
});

test('saved places can schedule, unschedule, remove and jump directly to Plan', () => {
  assert.match(app, /data-saved-shelf-schedule/);
  assert.match(app, /data-saved-shelf-unschedule/);
  assert.match(app, /data-saved-shelf-delete/);
  assert.match(app, /data-saved-shelf-open-plan/);
  assert.match(app, /function openSavedPlaceInPlan\(place\)/);
  assert.match(app, /document\.querySelector\('\.sidebar \[data-view="plan"\],\[data-view="plan"\]'\)/);
  assert.match(app, /place\.date=''/);
});

test('saving a search result visibly leads back to the saved places shelf', () => {
  assert.match(app, /function revealSavedPlace\(placeId\)/);
  assert.match(app, /revealSavedPlace\(placeData\.id\)/);
  assert.match(app, /נשמר · הצג במקומות ששמרתי/);
  assert.match(app, /is-just-saved/);
});

test('saved places lifecycle is responsive and keyboard-visible', () => {
  assert.match(css, /\.saved-places-shelf\{/);
  assert.match(css, /\.saved-places-shelf__item\.is-just-saved/);
  assert.match(css, /\.saved-place\.is-plan-target/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 96px/);
});
