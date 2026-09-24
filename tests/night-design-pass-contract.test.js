'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Plan keeps only daily actions in the primary toolbar', () => {
  const js = read('assets/auto-planner.js');
  assert.match(js, /class="planner-more"/);
  assert.match(js, /<summary><i class="fa-solid fa-ellipsis"><\/i> עוד פעולות<\/summary>/);
  assert.match(js, /data-open-trip-calendar/);
  assert.match(js, /data-new-activity/);
  assert.match(js, /planner-more-menu[^]*data-smart-build[^]*data-export-calendar[^]*data-clear-plan/);
});

test('core screens share the night design system geometry', () => {
  const finalCss = read('assets/readable-glass.css');
  assert.match(finalCss, /Night design system pass/);
  assert.match(finalCss, /--tm-core-radius-xl:22px/);
  assert.match(finalCss, /#overview,#plan,#places,#budget,#documents/);
  assert.match(finalCss, /Night core-screen redesign: Overview/);
});

test('each core feature owns a focused visual hierarchy pass', () => {
  assert.match(read('assets/auto-planner.css'), /Night core-screen redesign: Plan/);
  assert.match(read('assets/nearby.css'), /Night core-screen redesign: Places/);
  assert.match(read('assets/trip-experience.css'), /Night core-screen redesign: Budget/);
  assert.match(read('assets/document-vault.css'), /Night core-screen redesign: Documents/);
});
