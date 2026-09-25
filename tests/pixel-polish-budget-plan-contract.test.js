'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Budget keeps summary visible and defers only category bars on phones', () => {
  const js = read('assets/trip-experience.js');
  const css = read('assets/trip-experience.css');
  assert.match(js, /data-budget-chart-details aria-expanded="false"/);
  assert.match(js, /mobile-details-open/);
  assert.match(js, /charts\.classList\.add\('mobile-details-open'\)/);
  assert.match(css, /#budget \.budget-chart-bars\{display:none\}/);
  assert.match(css, /#budget \.budget-charts\.mobile-details-open \.budget-chart-bars\{display:grid/);
  assert.doesNotMatch(css, /#budget \.budget-smart-summary\{display:none/);
  assert.doesNotMatch(css, /#budget \.currency-converter\{display:none/);
});

test('Plan uses a single mobile action row and keeps three actions', () => {
  const theme = read('assets/theme.css');
  const css = read('assets/auto-planner.css');
  const js = read('assets/auto-planner.js');
  assert.match(theme, /planner-toolbar-actions\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /#plan \.planner-more\{grid-column:auto\}/);
  assert.match(css, /#plan \.trip-calendar-hint\{display:none\}/);
  assert.match(js, /data-open-trip-calendar/);
  assert.match(js, /data-new-activity/);
  assert.match(js, /class="planner-more"/);
});
