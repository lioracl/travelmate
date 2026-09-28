'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets/trip-experience.js'), 'utf8');

test('new trip memories keep the device-local calendar date alongside the timestamp', () => {
  assert.match(source, /var memoryNow = new Date\(\)/);
  assert.match(source, /localDate: localDateValue\(memoryNow\)/);
  assert.match(source, /date: memoryNow\.toISOString\(\)/);
});

test('memory rendering prefers localDate while keeping legacy timestamp fallback', () => {
  assert.match(source, /function memoryDateLabel\(memory\)/);
  assert.match(source, /memory && memory\.localDate/);
  assert.match(source, /new Date\(local \+ 'T12:00:00'\)/);
  assert.match(source, /new Date\(memory && memory\.date \|\| Date\.now\(\)\)/);
  assert.match(source, /memoryDateLabel\(memory\)/);
});
