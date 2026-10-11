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

test('Weather 2.0 summary is fully transparent glass while the forecast modal stays independent', () => {
  assert.match(block, /body\[data-trip-kind="custom"\]\.tm-new-design\[data-trip-view="overview"\]/);
  assert.match(block, /background:transparent/);
  assert.match(block, /backdrop-filter:var\(--tm-weather-card-blur\)/);
  assert.match(block, /--tm-weather-surface:color-mix\(in srgb,var\(--tm-surface-neutral\) 78%,transparent\)/);
  assert.doesNotMatch(block, /!important/);
  assert.doesNotMatch(block, /background:\s*(?:#000|black)\b/i);
  assert.doesNotMatch(block, /rgba\(244,243,239,\.82\)/);
});

test('Weather compact card and forecast controls keep mobile touch geometry', () => {
  assert.match(block, /min-height:78px;[\s\S]*?max-height:82px/);
  assert.match(block, /\.weather-top-action\{[\s\S]*?min-width:44px;[\s\S]*?min-height:44px/);
  assert.match(block, /@media\(max-width:650px\)[\s\S]*?min-height:72px;[\s\S]*?max-height:82px/);
  assert.match(block, /:is\(\.weather-live-actions button,\.modal-close\)\{[\s\S]*?min-height:44px/);
});

test('Weather keeps centered arrow geometry and reduced-transparency fallback', () => {
  assert.match(block, /\.weather-top-action i\{[^}]*display:grid;place-items:center;[^}]*inline-size:12px;block-size:12px/);
  assert.match(block, /\.weather-top-action i::before\{[^}]*inline-size:10px;block-size:6px/);
  assert.match(block, /aria-expanded="true"[^}]*transform:rotate\(180deg\)/);
  assert.match(block, /@media\(prefers-reduced-transparency:reduce\)[\s\S]*?background:var\(--tm-family-solid\);[\s\S]*?backdrop-filter:none/);
  assert.match(block, /html\[data-theme="dark"\][^}]*--tm-weather-text-shadow:0 1px 2px rgba\(8,24,20,\.9\)/);
});

test('Weather forecast rows flatten and wrap metrics without horizontal overflow', () => {
  assert.match(block, /\.weather-live-grid\{[\s\S]*?overflow-x:hidden/);
  assert.match(block, /\.weather-live-day\{[\s\S]*?border-radius:0;[\s\S]*?box-shadow:none/);
  assert.match(block, /\.weather-live-metrics\{[\s\S]*?display:flex;[\s\S]*?flex-wrap:wrap/);
  assert.match(block, /\.weather-live-metrics b\{[\s\S]*?flex:1 1 92px/);
  assert.match(block, /\.weather-source\{[\s\S]*?overflow-wrap:anywhere/);
});

test('Weather compact summary shows the current temperature once', () => {
  assert.ok(js.includes("ui.temperature.textContent = round(current.temperature_2m) + '\\u00b0'") || js.includes("ui.temperature.textContent = round(current.temperature_2m) + '?'"));
  assert.match(js, /ui\.icon\.innerHTML = weatherSvg\(details\.icon\)/);
  assert.doesNotMatch(js, /ui\.icon\.innerHTML = weatherSvg\(details\.icon\) \+ '<small>'/);
});

test('Weather modal behavior, history and accessibility contracts remain intact', () => {
  assert.match(js, /aria-haspopup/);
  assert.match(js, /aria-modal/);
  assert.match(js, /aria-labelledby/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /event\.key !== 'Tab'/);
  assert.match(js, /TravelMateHistory\.pushOverlay\('weather', function/);
  assert.match(js, /TravelMateHistory\.closeOverlay\('weather'\)/);
  assert.doesNotMatch(js, /window\.addEventListener\('popstate'/);
  assert.match(js, /close\(ui, false\); window\.TravelMateEvents\.emit/);
  assert.match(js, /TravelMateFeatures\.load\('assistant'\)/);
});

test('Weather documentation seed covers requirements, integration and guide', () => {
  const doc = fs.readFileSync(path.join(root, 'docs', 'features', 'weather', 'weather-v2.md'), 'utf8');
  assert.match(doc, /FR-WEA-001/);
  assert.match(doc, /Open-Meteo/);
  assert.match(doc, /DFD/);
  assert.match(doc, /Sequence diagram/);
  assert.match(doc, /User-guide seed/);
});