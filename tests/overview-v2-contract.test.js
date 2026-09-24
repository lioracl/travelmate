'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

const html = read('trip/custom/index.html');
const app = read('assets/app.js');
const overview = read('assets/overview-control-center.js');
const currency = read('assets/currency-utils.js');
const redesign = read('assets/trip-redesign.js');
const budget = read('assets/trip-experience.js');

test('Overview V2 replaces the old static budget-only summary', () => {
  assert.match(html, /data-overview-control-center/);
  assert.match(html, /טוען את מצב הטיול/);
  const overviewShell = html.match(/<section class="quick-grid trip-overview-summary"[\s\S]*?<\/section>/);
  assert.ok(overviewShell);
  assert.doesNotMatch(overviewShell[0], /budget-card/);
});

test('Overview quick actions contain only the four high-value routes', () => {
  const actions = html.match(/<section class="trip-home-actions"[\s\S]*?<\/section>/);
  assert.ok(actions);
  const hrefs = Array.from(actions[0].matchAll(/<a href="#([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(hrefs, ['plan', 'budget', 'places', 'documents']);
  assert.doesNotMatch(actions[0], /#group|#destination-info/);
  assert.match(actions[0], /data-budget-converter-open/);
});

test('Overview V2 is lazy and does not load the full Budget workspace', () => {
  assert.match(app, /overview:\{styles:\['overview-control-center\.css'/);
  assert.match(app, /scripts:\['currency-utils\.js','overview-control-center\.js','weather-widget\.js'/);
  assert.doesNotMatch(app.match(/overview:\{[^\n]+/)[0], /trip-experience\.js/);
});

test('Budget and Overview reuse one country-currency owner', () => {
  assert.match(currency, /function countryCurrency\(country\)/);
  assert.match(currency, /window\.TravelMateCurrencyUtils/);
  assert.doesNotMatch(budget, /function countryCurrency\(country\)/);
  assert.match(budget, /currencyUtils\.countryCurrency\(state\.trip\.country\)/);
  assert.match(app, /budget:\{styles:\['trip-experience\.css'\],scripts:\['currency-utils\.js','trip-experience\.js'\]/);
});

test('Overview V2 reads canonical trip data and renders next, budget and lodging summaries', () => {
  assert.match(overview, /TravelMateTripStore\.getTrip\(tripId\)/);
  assert.match(overview, /data-overview-card="next"/);
  assert.match(overview, /data-overview-card="budget"/);
  assert.match(overview, /data-overview-card="hotel"/);
  assert.match(overview, /budgetUnlimited === true/);
  assert.match(overview, /item\.isTripBase/);
  assert.match(overview, /travelAnchor/);
  assert.doesNotMatch(overview, /localStorage\.getItem\('travelmate-trips'/);
});

test('Overview V2 cards use the canonical trip navigation owner', () => {
  assert.match(redesign, /\[data-overview-control-center\] a\[href\^="#"\]/);
  assert.match(redesign, /\[data-overview-control-center\] a\[data-view\]/);
  assert.doesNotMatch(overview, /history\.pushState|location\.hash\s*=|travelmate:viewchange/);
});

test('Overview V2 listens for canonical trip updates instead of polling', () => {
  assert.match(overview, /travelmate:local-trips-updated/);
  assert.match(overview, /travelmate:places-updated/);
  assert.match(overview, /travelmate:planner-rendered/);
  assert.doesNotMatch(overview, /setInterval/);
});

test('deleted custom Overview budget-card ownership is not left behind', () => {
  const readable = read('assets/readable-glass.css');
  const redesignCss = read('assets/trip-redesign.css');
  assert.doesNotMatch(readable, /data-trip-kind="custom"[^\n]*trip-overview-summary \.budget-card/);
  assert.doesNotMatch(readable, /data-trip-kind="custom"[^\n]*\.budget-card \.currency-insight\.compact/);
  assert.doesNotMatch(readable, /trip-home-actions a:last-child\{grid-column:1\/-1\}/);
  assert.doesNotMatch(redesignCss, /trip-overview-summary \.budget-card/);
});

test('Overview V2 styling is feature-scoped and responsive', () => {
  const css = read('assets/overview-control-center.css');
  assert.match(css, /body\[data-trip-view="overview"\] \.overview-control-grid/);
  assert.match(css, /grid-template-columns:repeat\(3/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.doesNotMatch(css, /!important/);
});
