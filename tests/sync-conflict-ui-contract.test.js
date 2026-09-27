'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('custom trip exposes a dedicated accessible sync conflict banner', () => {
  const html = read('trip/custom/index.html');
  assert.match(html, /sync-status\.css\?v=20260927-25/);
  assert.match(html, /data-sync-conflict[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /data-sync-use-cloud/);
  assert.match(html, /data-sync-keep-local/);
});

test('custom trip conflict actions delegate to Trip Store resolution', () => {
  const source = read('assets/custom-trip.js');
  assert.match(source, /store\.resolveConflict\(trip\.id, strategy, trip\.ownerId\)/);
  assert.match(source, /resolveVisibleConflict\('cloud'\)/);
  assert.match(source, /resolveVisibleConflict\('local'\)/);
  assert.match(source, /syncStatus \|\| ''\) === 'conflict'/);
});

test('sync conflict styling is isolated and does not add important escalation', () => {
  const css = read('assets/sync-status.css');
  assert.match(css, /\.trip-sync-conflict-banner/);
  assert.match(css, /data-sync-conflict-visible="true"/);
  assert.doesNotMatch(css, /!important/);
});
