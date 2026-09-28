'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('destination image remains the app background on trip screens', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /body\.tm-new-design:not\(\.home-page\)\{[^}]*background-image:var\(--tm-destination-canvas\)/);
  assert.match(css, /var\(--trip-bg-image/);
  assert.match(css, /body\.tm-new-design:not\(\.home-page\)::after\{[^}]*background-image:var\(--tm-destination-canvas\)/);
  assert.doesNotMatch(css, /body:not\(\.home-page\)\{color:#111;background-color:#eef2ef;background-image:none\}/);
});

test('trip content stays transparent and cards use glass surfaces', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /--tm-page-section-surface:transparent/);
  assert.match(css, /--tm-readable-surface:transparent/);
  assert.match(css, /--tm-readable-control:var\(--tm-action-secondary\)/);
  assert.match(css, /Surface Authority 2\.0/);
  assert.match(css, /main\.content[\s\S]*background:transparent/);
  assert.match(css, /--tm-surface-blur:blur\(14px\) saturate\(112%\)/);
  assert.match(css, /--tm-surface-blur-photo:blur\(8px\) saturate\(104%\)/);
});

test('dark mobile background keeps the destination image with a darker scrim', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /--tm-destination-canvas:linear-gradient\(90deg,var\(--tm-photo-scrim-start\)/);
  assert.match(read('assets/theme.css'), /html\[data-theme="dark"\] body\.tm-new-design:not\(\.home-page\)\{[^}]*--tm-photo-scrim-end:rgba\(24,35,38,\.16\)/);
});
