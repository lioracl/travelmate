'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lodging = fs.readFileSync(path.join(root, 'assets', 'lodging-manager.js'), 'utf8');

test('lodging form submit wiring is idempotent across Places re-entry', () => {
  assert.match(lodging, /if\(!existing\.dataset\.submitReady\)\{existing\.dataset\.submitReady='true';existing\.addEventListener\('submit'/);
  assert.equal((lodging.match(/addEventListener\('submit'/g) || []).length, 1);
});

test('lodging submit lifecycle disables the actual submit control', () => {
  assert.match(lodging, /querySelector\('button\[type="submit"\]'\)/);
  assert.doesNotMatch(lodging, /button=existing\.querySelector\('button'\),status=/);
});
