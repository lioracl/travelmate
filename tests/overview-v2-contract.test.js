'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

const html = read('trip/custom/index.html');
const custom = read('assets/custom-trip.js');
const css = read('assets/trip-redesign.css');

test('Overview V2 exposes exactly four control-center status cards', () => {
  const section = html.match(/<section class="trip-overview-summary overview-control-center"[\s\S]*?<\/section>/);
  assert.ok(section, 'Overview control center must exist');
  const cards = Array.from(section[0].matchAll(/data-overview-(next|budget|lodging|attention)(?:>|\s)/g), m => m[1]);
  assert.deepEqual(cards, ['next', 'budget', 'lodging', 'attention']);
});

test('Overview V2 uses lightweight trip data instead of eager-loading heavy features', () => {
  assert.match(custom, /function renderOverviewControlCenter\(trip\)/);
  assert.match(custom, /function nextOverviewItem\(trip\)/);
  assert.match(custom, /function overviewLodging\(trip\)/);
  assert.match(custom, /function spentInEuros\(trip\)/);
  assert.doesNotMatch(custom, /TravelMateFeatures\.load\('budget'\)/);
  assert.doesNotMatch(custom, /TravelMateFeatures\.load\('plan'\)/);
});

test('Overview budget summary supports limited and unlimited modes', () => {
  assert.match(custom, /trip\.budgetUnlimited === true/);
  assert.match(custom, /budgetTitle\.textContent = 'ללא הגבלה'/);
  assert.match(custom, /נותרו/);
  assert.match(custom, /הוצאות נרשמו/);
});

test('Overview does not recycle a past item as the next activity', () => {
  assert.match(custom, /return items\.find\(function \(item\) \{[\s\S]*?\}\) \|\| null;/);
});

test('Overview attention state prioritizes missing plan, lodging, then budget setup', () => {
  const plan = custom.indexOf("attentionTitle.textContent = 'התוכנית עדיין ריקה'");
  const lodging = custom.indexOf("attentionTitle.textContent = 'לא הוגדר מקום לינה'");
  const budget = custom.indexOf("attentionTitle.textContent = 'לא הוגדר מצב תקציב'");
  assert.ok(plan > 0 && lodging > plan && budget > lodging);
});

test('Overview refreshes from canonical trip-store updates', () => {
  assert.match(custom, /function refreshOverviewFromStore\(\)/);
  assert.match(custom, /travelmate:local-trips-updated/);
  assert.match(custom, /travelmate:trip-synced/);
  assert.match(custom, /travelmate:activities-updated/);
  assert.match(custom, /travelmate:places-updated/);
});

test('Overview quick actions prioritize plan, currency, documents, sharing and places', () => {
  const block = html.match(/<section class="trip-home-actions"[\s\S]*?<\/section>/);
  assert.ok(block);
  assert.match(block[0], />להתחיל לתכנן</);
  assert.match(block[0], />המרת מטבע</);
  assert.match(block[0], />להעלות מסמכים</);
  assert.match(block[0], />לשתף את הטיול</);
  assert.match(block[0], />למצוא מקום</);
  assert.doesNotMatch(block[0], /מידע נוסף על היעד/);
});

test('Overview V2 control center is responsive and feature scoped', () => {
  assert.match(css, /Overview V2 control center/);
  assert.match(css, /body\[data-trip-view="overview"\] \.overview-control-center/);
  assert.match(css, /grid-template-columns:repeat\(2/);
  assert.match(css, /@media\(max-width:760px\)/);
});
