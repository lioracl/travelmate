'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');

test('Home trip shortcuts and new-trip defaults use the device local calendar date', () => {
  assert.match(home, /function localDateString\(value\)/);
  assert.match(home, /var now = localDateString\(\)/);
  assert.match(home, /form\.elements\.start\.value = localDateString\(today\)/);
  assert.match(home, /form\.elements\.end\.value = localDateString\(next\)/);
  assert.doesNotMatch(home, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.doesNotMatch(home, /today\.toISOString\(\)\.slice\(0, 10\)/);
  assert.doesNotMatch(home, /next\.toISOString\(\)\.slice\(0, 10\)/);
});
