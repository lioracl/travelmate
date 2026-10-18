'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'assets', name), 'utf8');
const replaySource = process.env.REPLAY_SOURCE_FILE
  ? fs.readFileSync(process.env.REPLAY_SOURCE_FILE, 'utf8') : read('trip-replay.js');

// Only DOM rendering is emulated. Window and document are distinct native
// EventTargets; the unmodified canonical emitter chooses the actual target.
class Element extends EventTarget {
  constructor(tag = 'div') {
    super(); this.tagName = tag; this.children = []; this.dataset = {};
    this.attributes = {}; this.hidden = false; this._text = ''; this.textWrites = 0;
  }
  set textContent(value) { this._text = String(value); this.children = []; this.textWrites++; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(html) {
    this.children = []; this._text = '';
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1)._text += token; continue; }
      const tag = token.match(/^<([\w-]+)/)[1], node = new Element(tag);
      for (const attr of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
        if (attr.index > 1) node.setAttribute(attr[1], attr[2] || '');
      }
      stack.at(-1).appendChild(node);
      if (!/^(?:input|img|link|br)$/.test(tag)) stack.push(node);
    }
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'hidden') this.hidden = true;
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  getAttribute(key) { return this.attributes[key]; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  insertBefore(node, before) { node.parentNode = this; this.children.splice(this.children.indexOf(before), 0, node); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  querySelectorAll(selector) {
    const matches = node => {
      if (selector.startsWith('[data-')) {
        const key = selector.slice(6, -1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return Object.hasOwn(node.dataset, key);
      }
      if (selector.startsWith('.')) return (node.className || '').split(' ').includes(selector.slice(1));
      return node.tagName === selector;
    };
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function sampleTrip() {
  return { id: 'same', ownerId: 'collaborative-owner', city: 'Synthetic', activities: [],
    savedPlaces: [{ id: 'p1', name: 'Saved idea', done: false }], expenses: [],
    memories: [{ date: '2026-10-01', note: 'PRIVATE_SYNTHETIC_NOTE' }] };
}
function harness({ contract = true, current = sampleTrip() } = {}) {
  const window = new EventTarget(), document = new EventTarget(), section = new Element('section');
  const head = new Element('head'), timers = [], writes = [], maps = [];
  const persisted = new Map([['travelmate-trips', JSON.stringify([current])], ['travelmate-active-user', 'account-A']]);
  const storage = { getItem: key => persisted.get(key) ?? null,
    setItem: (...args) => writes.push(['setItem', ...args]), removeItem: (...args) => writes.push(['removeItem', ...args]),
    clear: () => writes.push(['clear']) };
  document.readyState = 'complete'; document.head = head;
  document.getElementById = id => id === 'memories' ? section : null;
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => selector.includes('maplibre-gl') ? head.children.find(n => n.rel === 'stylesheet') || null : section.querySelector(selector);
  const context = vm.createContext({ window, document, localStorage: storage, sessionStorage: storage,
    location: { search: '?id=same', pathname: '/trip/custom/' }, navigator: { onLine: true },
    URLSearchParams, CustomEvent, Event, EventTarget, Date, Intl, console,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch() { throw new Error('No network permitted in Replay lifecycle tests'); } });
  function loadContract() { vm.runInContext(read('event-contracts.js'), context); }
  if (contract) loadContract();
  for (const name of ['trip-store.js', 'trip-context.js', 'trip-analytics.js']) vm.runInContext(read(name), context);
  function loadReplay() { vm.runInContext(replaySource, context); }
  function flushTimers() { while (timers.length) timers.shift()(); }
  function canonical(value) { persisted.set('travelmate-trips', JSON.stringify(value ? [value] : [])); }
  function emit(detail = { tripId: 'same' }) { window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated, detail); }
  function account(userId = 'account-B', next = null) {
    canonical(next); persisted.set('travelmate-active-user', userId || '');
    window.dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { userId, trips: next ? [next] : [] } }));
  }
  function mapLibrary() {
    class MapStub {
      constructor() { this.callbacks = {}; this.sources = []; this.removed = false; this.resizes = 0; maps.push(this); }
      addControl() {} on(name, fn) { this.callbacks[name] = fn; } addSource(...args) { this.sources.push(args); }
      addLayer() {} fitBounds() {} remove() { this.removed = true; } resize() { this.resizes++; }
    }
    class Bounds { extend() {} }
    class Marker { setLngLat() { return this; } addTo() {} }
    return { Map: MapStub, NavigationControl: class {}, AttributionControl: class {}, LngLatBounds: Bounds, Marker };
  }
  loadReplay(); flushTimers();
  return { window, document, section, head, writes, maps, current, persisted, context,
    canonical, emit, account, loadReplay, loadContract, flushTimers, mapLibrary,
    card: () => section.querySelector('[data-trip-replay]'),
    node: selector => section.querySelector(selector) };
}
function completedTrip() {
  const current = sampleTrip();
  current.savedPlaces = [
    { id: 'p1', name: 'Fresh canonical visit', date: '2026-10-01', done: true, lat: 50.08, lon: 14.42 },
    { id: 'p2', name: 'Second visit', date: '2026-10-01', done: true, lat: 50.09, lon: 14.43 },
    { id: 'p3', name: 'Planned only', date: '2026-10-01', done: false },
    { id: 'p4', name: 'Unscheduled only', done: true }
  ];
  return current;
}

test('canonical non-bubbling placesUpdated refreshes mounted Replay exactly once from current storage', () => {
  const h = harness(), summary = h.node('[data-trip-replay-summary]');
  assert.notEqual(h.document, h.window);
  let documentEvents = 0, windowEvents = 0;
  h.document.addEventListener('travelmate:places-updated', event => { documentEvents++; assert.equal(event.bubbles, false); });
  h.window.addEventListener('travelmate:places-updated', () => windowEvents++);
  const before = summary.textWrites;
  h.canonical(completedTrip()); const bytes = h.persisted.get('travelmate-trips');
  h.emit({ tripId: ' same ', placeId: 'p1', action: 'updated' });
  assert.equal(summary.textWrites, before + 1, 'canonical saved-place event must render exactly once');
  assert.match(h.node('[data-trip-replay-timeline]').textContent, /Fresh canonical visit/);
  assert.doesNotMatch(h.node('[data-trip-replay-timeline]').textContent, /Planned only|Unscheduled only/);
  assert.equal(documentEvents, 1); assert.equal(windowEvents, 0);
  assert.equal(h.persisted.get('travelmate-trips'), bytes); assert.deepEqual(h.writes, []);
  assert.equal(h.head.children.length, 0, 'render must not load a map');
});
test('unrelated trip events do not refresh; unscoped legacy events read the current trip', () => {
  const h = harness(), summary = h.node('[data-trip-replay-summary]'), before = summary.textWrites;
  h.canonical(completedTrip()); h.emit({ tripId: 'another-trip' });
  assert.equal(summary.textWrites, before);
  h.emit({}); assert.equal(summary.textWrites, before + 1);
  assert.match(h.node('[data-trip-replay-timeline]').textContent, /Fresh canonical visit/);
  assert.deepEqual(h.writes, []);
});
test('repeated script entry and view entry keep one card and one event refresh', () => {
  const h = harness(); h.loadReplay(); h.loadReplay(); h.flushTimers();
  for (const view of ['memories', 'summary', 'memories']) h.window.dispatchEvent(new CustomEvent('travelmate:feature-ready', { detail: { view } }));
  assert.equal(h.section.querySelectorAll('[data-trip-replay]').length, 1);
  const summary = h.node('[data-trip-replay-summary]'), before = summary.textWrites;
  h.canonical(completedTrip()); h.emit();
  assert.equal(summary.textWrites, before + 1); assert.deepEqual(h.writes, []);
});
test('document fallback works when canonical event contracts load after Replay', () => {
  const h = harness({ contract: false }); h.loadContract();
  const summary = h.node('[data-trip-replay-summary]'), before = summary.textWrites;
  h.canonical(completedTrip()); h.emit();
  assert.equal(summary.textWrites, before + 1); assert.deepEqual(h.writes, []);
});
test('canonical on/name API remains the selected subscription', () => {
  const h = harness({ contract: false });
  // The preceding fallback case covers real delivery; this fresh context
  // verifies canonical name selection without weakening delivery assertions.
  const subscriptions = [], window = new EventTarget(), document = new EventTarget();
  document.readyState = 'loading'; document.getElementById = () => null;
  window.TravelMateEvents = { names: { placesUpdated: 'canonical-places-name' }, on: (name, fn) => { subscriptions.push([name, fn]); return () => {}; } };
  vm.runInNewContext(replaySource, { window, document, setTimeout() {} });
  assert.deepEqual(subscriptions.map(([name]) => name), ['canonical-places-name']);
  assert.deepEqual(h.writes, []);
});
for (const userId of [null, 'account-B']) test(`account ${userId || 'sign-out'} removes private Replay and blocks stale render triggers`, () => {
  const h = harness({ current: completedTrip() });
  assert.match(h.section.textContent, /PRIVATE_SYNTHETIC_NOTE/);
  h.account(userId);
  assert.equal(h.card(), null, 'account change must discard the old card');
  // Simulate stale old-account data arriving while app.js is navigating away.
  h.canonical(completedTrip()); h.emit();
  h.document.dispatchEvent(new CustomEvent('travelmate:planner-rendered'));
  h.window.dispatchEvent(new CustomEvent('travelmate:feature-ready', { detail: { view: 'memories' } }));
  h.window.TravelMateTripReplay.render(); h.loadReplay(); h.flushTimers();
  assert.equal(h.card(), null); assert.doesNotMatch(h.section.textContent, /PRIVATE_SYNTHETIC_NOTE/);
  assert.deepEqual(h.writes, []);
});
test('collaborative owner is not used as account identity', () => {
  const h = harness({ current: completedTrip() });
  assert.match(h.section.textContent, /Fresh canonical visit/);
  const next = completedTrip(); next.memories = [{ date: '2026-10-01', note: 'PRIVATE_ACCOUNT_B' }];
  h.account('account-B', next); h.emit();
  assert.equal(h.card(), null, 'same collaborative owner does not authorize old page after account switch');
  assert.deepEqual(h.writes, []);
});
test('account switch invalidates pending map library fulfillment without constructing a map', async () => {
  const h = harness({ current: completedTrip() });
  const button = h.node('[data-trip-summary-map-toggle]');
  const pending = button.onclick();
  const script = h.head.children.find(node => node.tagName === 'script');
  assert.ok(script); assert.equal(h.maps.length, 0);
  h.account('account-B', completedTrip());
  h.window.maplibregl = h.mapLibrary(); script.onload(); await pending;
  assert.equal(h.maps.length, 0, 'old-account pending result must not create a map');
  assert.equal(h.card(), null); assert.deepEqual(h.writes, []);
});
test('account switch invalidates pending map rejection and removes an existing map', async () => {
  const pendingHarness = harness({ current: completedTrip() });
  const status = pendingHarness.node('[data-trip-summary-map-status]');
  const pending = pendingHarness.node('[data-trip-summary-map-toggle]').onclick();
  const before = status.textWrites;
  pendingHarness.account(); pendingHarness.head.children.find(node => node.tagName === 'script').onerror(); await pending;
  assert.equal(status.textWrites, before, 'old rejection cannot repaint detached content');
  const h = harness({ current: completedTrip() }); h.window.maplibregl = h.mapLibrary();
  await h.node('[data-trip-summary-map-toggle]').onclick();
  assert.equal(h.maps.length, 1); const map = h.maps[0];
  h.account(); map.callbacks.load();
  assert.equal(map.removed, true); assert.equal(map.sources.length, 0); assert.equal(h.card(), null);
  assert.deepEqual(h.writes, []); assert.deepEqual(pendingHarness.writes, []);
});
test('queued map resize is harmless after account cleanup', async () => {
  const h = harness({ current: completedTrip() }); h.window.maplibregl = h.mapLibrary();
  const button = h.node('[data-trip-summary-map-toggle]');
  await button.onclick(); await button.onclick(); await button.onclick();
  h.account(); assert.doesNotThrow(() => h.flushTimers());
  assert.equal(h.maps[0].resizes, 0); assert.deepEqual(h.writes, []);
});
test('a newer canonical route invalidates an older pending map request', async () => {
  const h = harness({ current: completedTrip() });
  const pending = h.node('[data-trip-summary-map-toggle]').onclick();
  h.canonical(sampleTrip()); h.emit();
  h.window.maplibregl = h.mapLibrary(); h.head.children.find(node => node.tagName === 'script').onload(); await pending;
  assert.equal(h.maps.length, 0); assert.equal(h.node('[data-trip-summary-map-shell]').hidden, true);
  assert.deepEqual(h.writes, []);
});
