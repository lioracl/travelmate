'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'weather-widget.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets', 'weather-widget.js'), 'utf8');
const marker = '/* Weather 2.0 final authority — neutral material, compact mobile, flat forecast. */';
const start = css.indexOf(marker);
assert.notEqual(start, -1, 'Weather 2.0 final authority block must exist');
const block = css.slice(start);

test('custom trip Weather remains a sibling after Hero', () => {
  assert.match(js, /hero\.insertAdjacentElement\('afterend', button\)/);
  assert.match(js, /button\.parentElement !== content/);
});

test('Weather 2.0 final authority is neutral and blur-free', () => {
  assert.match(block, /body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="overview"\]/);
  assert.match(block, /background:color-mix\(in srgb,var\(--tm-surface-neutral\) 72%,transparent\)/);
  assert.match(block, /backdrop-filter:none/);
  assert.match(block, /--tm-weather-surface:var\(--tm-surface-neutral\)/);
  assert.doesNotMatch(block, /!important/);
  assert.doesNotMatch(block, /background:\s*(?:#000|black)\b/i);
  assert.doesNotMatch(block, /backdrop-filter:\s*blur\(/i);
});

test('Weather compact card and forecast controls keep mobile touch geometry', () => {
  assert.match(block, /min-height:78px;[\s\S]*?max-height:82px/);
  assert.match(block, /\.weather-top-action\{[\s\S]*?min-width:44px;[\s\S]*?min-height:44px/);
  assert.match(block, /@media\(max-width:650px\)[\s\S]*?min-height:72px;[\s\S]*?max-height:82px/);
  assert.match(block, /:is\(\.weather-live-actions button,\.modal-close\)\{[\s\S]*?min-height:44px/);
});

test('Weather forecast rows flatten and wrap metrics without horizontal overflow', () => {
  assert.match(block, /\.weather-live-grid\{[\s\S]*?overflow-x:hidden/);
  assert.match(block, /\.weather-live-day\{[\s\S]*?border-radius:0;[\s\S]*?box-shadow:none/);
  assert.match(block, /\.weather-live-metrics\{[\s\S]*?display:flex;[\s\S]*?flex-wrap:wrap/);
  assert.match(block, /\.weather-live-metrics b\{[\s\S]*?flex:1 1 92px/);
  assert.match(block, /\.weather-source\{[\s\S]*?overflow-wrap:anywhere/);
});

test('Weather modal behavior and accessibility contracts remain intact', () => {
  assert.match(js, /aria-haspopup/);
  assert.match(js, /aria-modal/);
  assert.match(js, /aria-labelledby/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.key !== 'Tab'/);
  assert.match(js, /close\(ui\); window\.TravelMateEvents\.emit/);
});

test('Weather documentation seed covers requirements, integration and guide', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'features', 'weather', 'weather-v2.md'), 'utf8');
  assert.match(doc, /FR-WEA-001/);
  assert.match(doc, /Open-Meteo/);
  assert.match(doc, /DFD/);
  assert.match(doc, /Sequence diagram/);
  assert.match(doc, /User-guide seed/);
});
