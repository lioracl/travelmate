'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

test('core TravelMate events have one normalization and dispatch owner', () => {
  const contracts = read('assets/event-contracts.js');
  for (const name of [
    'travelmate:viewchange',
    'travelmate:places-updated',
    'travelmate:activities-updated',
    'travelmate:ask-ai'
  ]) assert.ok(contracts.includes(name), 'missing event contract: ' + name);

  const offenders = fs.readdirSync(assets)
    .filter((name) => name.endsWith('.js') && name !== 'event-contracts.js')
    .filter((name) => /new CustomEvent\(['"]travelmate:(?:viewchange|places-updated|activities-updated|ask-ai)['"]/.test(read('assets/' + name)));
  assert.deepEqual(offenders, []);
});

test('event contracts load before app feature code on every entry point', () => {
  for (const relative of ['index.html', 'trip/custom/index.html', 'trip/italy-2028/index.html', 'trip/japan-2027/index.html']) {
    const html = read(relative);
    const store = html.indexOf('trip-store.js');
    const events = html.indexOf('event-contracts.js');
    const app = html.indexOf('app.js');
    assert.ok(events > store, relative + ' must load event contracts after Trip Store');
    assert.ok(app > events, relative + ' must load app.js after event contracts');
  }
});

test('loader does not eagerly load heavy structural feature families', () => {
  const app = read('assets/app.js');
  assert.doesNotMatch(app, /loadStructure|structureScripts|structureStyles|warmDeferredStructure/);
  assert.match(app, /ensureLazyNavigation/);
  assert.match(app, /TravelMateFeatures=Object\.freeze/);
  assert.match(app, /dynamicSectionViews=\{transport:true,getaways:true,group:true,memories:true\}/);

  const eager = app.slice(0, app.indexOf('var lastModalTrigger=null;'));
  assert.doesNotMatch(eager, /loadSequence\(\['travel-services\.js','transport-planner\.js'\]/);
  assert.doesNotMatch(eager, /loadSequence\(\['place-directions\.js','collaboration\.js'\]/);
});

test('lazy navigation can resolve feature sections before activation', () => {
  const redesign = read('assets/trip-redesign.js');
  assert.match(redesign, /featureLoader\.load\(view\)\.then/);
  assert.match(redesign, /travelmate:feature-ready/);
  assert.match(redesign, /TravelMateEvents\.emit\(window\.TravelMateEvents\.names\.viewChange/);
});

test('high-value event emitters use the canonical event API', () => {
  for (const relative of [
    'assets/app.js',
    'assets/auto-planner.js',
    'assets/lodging-manager.js',
    'assets/place-auto-fill.js',
    'assets/trip-redesign.js',
    'assets/ai-assistant.js',
    'assets/smart-hub.js',
    'assets/trip-experience.js',
    'assets/weather-widget.js'
  ]) {
    const source = read(relative);
    if (/travelmate:(?:viewchange|places-updated|activities-updated|ask-ai)/.test(source)) {
      assert.match(source, /TravelMateEvents|addEventListener/, relative + ' must use the event contract API for emitters');
    }
  }
});

test('lazy secondary features use the static More menu instead of mutating primary navigation', () => {
  const custom = read('trip/custom/index.html');
  const collaboration = read('assets/collaboration.js');
  const experience = read('assets/trip-experience.js');
  assert.match(custom, /trip-sidebar-more/);
  assert.match(custom, /data-view="group"/);
  assert.match(custom, /data-view="memories"/);
  assert.doesNotMatch(collaboration, /querySelector\('\.sidebar nav'\)/);
  assert.doesNotMatch(experience, /querySelector\('\.sidebar nav'\)/);
});

test('Nearby and Document Vault are feature-scoped on custom trips', () => {
  const app = read('assets/app.js');
  const custom = read('trip/custom/index.html');
  assert.match(app, /places:\{styles:\['nearby\.css','place-planner\.css'/);
  assert.match(app, /documents:\{styles:\['document-vault\.css'\],scripts:\['document-vault\.js'\]\}/);
  assert.doesNotMatch(custom, /<link[^>]+nearby\.css/);
  assert.doesNotMatch(custom, /<script[^>]+document-vault\.js/);
  const beforeDestination = app.slice(0, app.indexOf('function ensureDestination'));
  assert.doesNotMatch(beforeDestination, /\n\s*ensureNearby\(\);\n/);
});
