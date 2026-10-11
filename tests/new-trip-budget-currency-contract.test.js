'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
const home = fs.readFileSync('assets/home.js', 'utf8');
const budget = fs.readFileSync('assets/trip-experience.js', 'utf8');

test('New Trip declares budget input as canonical EUR and only promises local presentation', () => {
  assert.match(index, /תקציב משוער \(€\) — יוצג גם במטבע המקומי/);
  assert.doesNotMatch(index, /תקציב משוער \(יוצג במטבע המקומי\)/);
  assert.match(home, /budget:\s*Number\(form\.elements\.budget\.value \|\| 2500\)/);
  assert.match(budget, /var plannedEuros = Number\(state\.trip && state\.trip\.budget \|\| 0\)/);
  assert.match(budget, /var totalPlannedLocal = state\.localCurrency === 'EUR' \? totalPlanned : localFromEuros\(totalPlanned\)/);
});
