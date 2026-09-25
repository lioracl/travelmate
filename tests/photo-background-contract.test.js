'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('destination image remains the app background on trip screens', () => {
  const css = read('assets/trip-redesign.css');
  assert.match(css, /body:not\(\.home-page\)\{color:#111;background-color:#10241e;background-image:linear-gradient/);
  assert.match(css, /var\(--trip-bg-image/);
  assert.match(css, /body:not\(\.home-page\)::after\{[\s\S]*background-image:linear-gradient[\s\S]*var\(--trip-bg-image/);
  assert.doesNotMatch(css, /body:not\(\.home-page\)\{color:#111;background-color:#eef2ef;background-image:none\}/);
});

test('trip content stays transparent and cards use glass surfaces', () => {
  const css = read('assets/readable-glass.css');
  assert.match(css, /--tm-page-section-surface:transparent/);
  assert.match(css, /--tm-readable-surface:transparent/);
  assert.match(css, /--tm-readable-control:var\(--tm-action-secondary\)/);
  assert.match(css, /main\.content\{\s*background:transparent/);
  assert.match(css, /Photo-background restore: cards float over the destination image/);
  assert.match(css, /backdrop-filter:blur\(16px\) saturate\(118%\)/);
});

test('dark mobile background keeps the destination image with a darker scrim', () => {
  const css = read('assets/trip-redesign.css');
  assert.match(css, /html\[data-theme="dark"\]\[dir="rtl"\] body:not\(\.home-page\)::after/);
  assert.match(css, /rgba\(3,11,9,\.68\).*var\(--trip-bg-image/);
});
