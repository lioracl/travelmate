'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const custom = fs.readFileSync(path.join(root, 'assets', 'custom-trip.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'assets', 'trip-redesign.js'), 'utf8');

test('Overview control-center arrows use canonical view navigation', () => {
  assert.match(nav, /\.overview-control-center a\[href\^="\#"\]/);
  assert.match(nav, /\.trip-home-actions a, \.overview-control-center a, \.places-hub-nav a/);
});

test('Overview budget uses a presentation currency instead of hardcoded EUR', () => {
  assert.match(custom, /function overviewBudgetMoney\(euros, trip\)/);
  assert.match(custom, /trip && trip\.budgetCurrency \|\| 'ILS'/);
  const block = custom.match(/function renderOverviewControlCenter\(trip\)[\s\S]*?var lodging = overviewLodging\(trip\)/);
  assert.ok(block);
  assert.doesNotMatch(block[0], /compactMoney\([^\n]*'EUR'/);
  assert.match(block[0], /overviewBudgetMoney\(spent, trip\)/);
});
