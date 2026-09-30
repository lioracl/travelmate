'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('custom trip exposes exactly five primary navigation areas', () => {
  const html = read('trip/custom/index.html');
  const match = html.match(/<nav aria-label="אזורי הטיול">([\s\S]*?)<\/nav>/);
  assert.ok(match, 'primary trip navigation must exist');
  const views = Array.from(match[1].matchAll(/data-view="([^"]+)"/g), (item) => item[1]);
  assert.deepEqual(views, ['overview', 'plan', 'places', 'budget', 'documents']);
});

test('Places hub groups discovery, transport, getaways and destination info', () => {
  const html = read('trip/custom/index.html');
  const match = html.match(/<nav class="places-hub-nav"[\s\S]*?<\/nav>/);
  assert.ok(match, 'Places hub must exist');
  const views = Array.from(match[0].matchAll(/data-view="([^"]+)"/g), (item) => item[1]);
  assert.deepEqual(views, ['places', 'transport', 'getaways', 'destination-info']);
});

test('secondary tools stay grouped under More rather than primary tabs', () => {
  const html = read('trip/custom/index.html');
  assert.match(html, /class="trip-sidebar-more"/);
  assert.match(html, /data-view="group"/);
  assert.match(html, /data-view="memories"/);
  assert.match(html, /data-smart-hub-open/);
  assert.match(html, /data-security-open/);
  assert.match(html, /\.\.\/\.\.\/index\.html#trip-archive/);
  assert.match(html, /data-about-open/);
  const primary = html.match(/<nav aria-label="אזורי הטיול">([\s\S]*?)<\/nav>/)[1];
  assert.doesNotMatch(primary, /transport|getaways|group|memories|about|security|archive|smart-hub/);
});

test('secondary menu lazy-loads Settings and Smart Hub and routes to the home archive', () => {
  const app = read('assets/app.js');
  const home = read('assets/home.js');
  const hub = read('assets/smart-hub.js');
  assert.match(app, /\[data-lazy-account\],\[data-smart-hub-open\]/);
  assert.match(app, /loadFeature\(smartHub\?'assistant':'account'\)/);
  assert.match(hub, /window\.TravelMateSmartHub = \{ open:/);
  assert.match(home, /location\.hash === '#trip-archive'/);
});

test('Smart Hub still exposes all 20 grouped tools through the secondary launcher', () => {
  const hub = read('assets/smart-hub.js');
  const toolIds = Array.from(hub.matchAll(/\['([a-z]+)','fa-[^']+','/g), (match) => match[1]);
  assert.equal(toolIds.length, 20);
  assert.equal(new Set(toolIds).size, 20);
});

test('feature modules no longer append secondary features into primary sidebar navigation', () => {
  for (const relative of ['assets/travel-services.js', 'assets/transport-planner.js', 'assets/collaboration.js', 'assets/trip-experience.js']) {
    const source = read(relative);
    assert.doesNotMatch(source, /querySelector\(['"]\.sidebar nav['"]\)[\s\S]{0,700}(?:appendChild|insertAdjacentHTML)/,
      relative + ' must not own primary navigation');
  }
});

test('trip-redesign is the single active-state owner for trip navigation', () => {
  const app = read('assets/app.js');
  const redesign = read('assets/trip-redesign.js');
  assert.doesNotMatch(app, /syncLegacySidebar|scheduleLegacySidebar/);
  assert.match(redesign, /function syncTripPages\(\)/);
  assert.match(redesign, /document\.body\.dataset\.tripPrimaryView/);
});

test('legacy direct subview URLs remain recognized and mapped to Places', () => {
  const redesign = read('assets/trip-redesign.js');
  const app = read('assets/app.js');
  assert.match(redesign, /placesViews = \{ places: true, transport: true, getaways: true, 'destination-info': true \}/);
  assert.match(redesign, /linkView === 'places' && isPlacesView\(currentView\)/);
  assert.match(app, /transport:\{styles:/);
  assert.match(app, /getaways:\{styles:/);
  assert.match(app, /view==='car-rental'\?'transport':view/);
});

test('Places hub is responsive and does not introduce another override stylesheet', () => {
  const css = read('assets/trip-redesign.css');
  assert.match(css, /Primary trip navigation \+ Places hub/);
  assert.match(css, /\.places-hub-nav/);
  assert.match(css, /grid-template-columns:repeat\(4/);
  assert.match(css, /@media\(max-width:1000px\)/);
});