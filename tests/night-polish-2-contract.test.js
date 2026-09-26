'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('mobile budget uses progressive disclosure without removing modes', () => {
  const js = read('assets/trip-experience.js');
  const css = read('assets/trip-experience.css');
  assert.match(js, /budget-settings-toggle/);
  assert.match(js, /form\.hidden = compactBudget/);
  assert.match(js, /budgetMode/);
  assert.match(css, /budget-smart-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /budget-chart-summary\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('mobile core and secondary tap targets are hardened', () => {
  const css = read('assets/readable-glass.css');
  const planner = read('assets/auto-planner.css');
  const theme = read('assets/theme.css');
  assert.match(css, /Night polish 2: accessibility/);
  assert.match(css, /day-add,.day-replace,.activity-buttons button,.saved-place-actions button/);
  assert.match(css, /min-width:44px/);
  assert.match(planner, /activity-buttons,.saved-place-actions\)>button\{[\s\S]*min-width:44px;[\s\S]*min-height:44px;[\s\S]*height:44px;/);
  assert.doesNotMatch(theme, /min-width:44px!important;\s*min-height:44px!important;\s*height:44px!important/);
  assert.match(css, /#transport,#getaways,#group,#memories,#destination-info/);
});

test('secondary screens receive compact hierarchy passes', () => {
  assert.match(read('assets/transport-planner.css'), /Night polish 2: transport/);
  assert.match(read('assets/travel-services.css'), /Night polish 2: travel services/);
  assert.match(read('assets/trip-experience.css'), /Night polish 2: memories/);
  assert.match(read('assets/collaboration.css'), /Night polish 2: collaboration/);
  assert.match(read('assets/nearby.css'), /Night polish 2: mobile Places density/);
});
