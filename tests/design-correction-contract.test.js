'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('trip photo is owned by the app background while content uses readable glass surfaces', () => {
  const trip = read('assets/trip-redesign.css');
  const glass = read('assets/readable-glass.css');
  assert.match(trip, /body:not\(\.home-page\)\{color:#111;background-color:#10241e;background-image:linear-gradient/);
  assert.match(trip, /hero\.custom-hero\{[^}]*background:linear-gradient/);
  assert.match(glass, /Destination photo background: trip content uses readable glass surfaces/);
  assert.match(glass, /--tm-page-section-surface:transparent/);
  assert.match(glass, /--tm-readable-surface:transparent/);
  assert.match(glass, /--tm-readable-surface-soft:color-mix\(in srgb,var\(--tm-accent-soft,#D7EDF2\) 12%,rgba\(248,252,250,\.58\)\)/);
  assert.match(glass, /--tm-card-text:#173f32/);
});

test('light section and Plan day headings no longer force white text', () => {
  const theme = read('assets/theme.css');
  assert.match(theme, /section-head\.section-head[\s\S]*color:var\(--tm-card-heading\)!important/);
  assert.match(theme, /day-heading\.day-heading,.day-tab\.day-tab[\s\S]*\*\{\s*color:inherit!important/);
});

test('mobile Plan collapses only empty future days and keeps heading visible', () => {
  const js = read('assets/auto-planner.js');
  const theme = read('assets/theme.css');
  const glass = read('assets/readable-glass.css');
  assert.match(js, /index>0&&!activityCount&&!savedCount&&!hasNote/);
  assert.match(theme, /generated-day\.day-collapsed>div\{\s*display:block!important/);
  assert.match(glass, /generated-day\.day-collapsed>div>:not\(\.day-heading\)/);
});

test('mobile Places and Documents use progressive compact layouts', () => {
  const lodgingJs = read('assets/lodging-manager.js');
  const lodgingCss = read('assets/lodging-manager.css');
  const docs = read('assets/document-vault.css');
  assert.match(lodgingJs, /lodging-toggle/);
  assert.match(lodgingJs, /setLodgingCollapsed/);
  assert.match(lodgingCss, /lodging-setup\.is-collapsed \.lodging-fields/);
  assert.match(docs, /document categories read as compact rows on phones/);
});

test('Mate launcher is compact on trip screens', () => {
  const theme = read('assets/theme.css');
  const ai = read('assets/ai-assistant.css');
  assert.match(theme, /width:48px!important;\s*min-width:48px!important;\s*height:48px!important/);
  assert.match(ai, /smaller mobile Mate launcher with safe-area clearance/);
});
