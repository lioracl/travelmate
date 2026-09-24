'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('custom trip no longer owns legacy budget allocation rows', () => {
  const custom = read('assets/custom-trip.js');
  assert.doesNotMatch(custom, /var splits = \[\['לינה', \.4\]/);
  assert.doesNotMatch(custom, /className = 'expense'/);
  assert.doesNotMatch(custom, /data-expenses/);
});

test('Budget V2 remains the active budget workspace owner', () => {
  const budget = read('assets/trip-experience.js');
  assert.match(budget, /data-budget-smart-summary/);
  assert.match(budget, /data-expense-workspace/);
  assert.match(budget, /createCurrencyConverter/);
});

test('lodging persistence merges only its managed anchors into the latest trip', () => {
  const lodging = read('assets/lodging-manager.js');
  assert.match(lodging, /function managedAnchor\(item\)/);
  assert.match(lodging, /TravelMateTripStore\.updateTrip\(trip\.id/);
  assert.match(lodging, /unmanaged=currentPlaces\.filter/);
  assert.match(lodging, /currentTrip\.savedPlaces=unmanaged\.concat\(managed\)/);
  assert.doesNotMatch(lodging, /TravelMateTripStore\.saveTrip\(trip\)/);
});
