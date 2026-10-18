'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourceRoot = process.env.TRAVELMATE_PLAN_SOURCE_ROOT || root;
const flush = () => new Promise(resolve => setImmediate(resolve));
const copy = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class DetailEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
}
// Separate native EventTargets: document events never accidentally reach window.
class Target extends EventTarget {
  constructor() { super(); this.handlers = new Map(); }
  addEventListener(name, fn, options) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    super.addEventListener(name, fn, options);
  }
  removeEventListener(name, fn, options) {
    this.handlers.get(name)?.delete(fn);
    super.removeEventListener(name, fn, options);
  }
  listenerCount(name) { return this.handlers.get(name)?.size || 0; }
}
class Element extends Target {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.dataset = {}; this.style = {};
    this.children = []; this.attributes = new Map(); this.controls = new Map();
    this.elements = {}; this.value = ''; this.hidden = false; this.textContent = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : force;
        if (on) classes.add(name); else classes.delete(name);
        return on;
      }
    };
  }
  set innerHTML(html) {
    this.html = html;
    for (const match of html.matchAll(/<(input|select)[^>]*name="([^"]+)"[^>]*>/g)) {
      const node = new Element(match[1]);
      node.value = /value="([^"]*)"/.exec(match[0])?.[1] || '';
      this.elements[match[2]] = node;
    }
  }
  get innerHTML() { return this.html || ''; }
  get options() { return this.children; }
  querySelector(selector) {
    // Model only controls actually present in the real planner's HTML strings.
    if (this.controls.has(selector)) return this.controls.get(selector);
    const attr = /^\[([^\]=]+)\]$/.exec(selector)?.[1];
    if (attr && this.innerHTML.includes(attr)) {
      const control = new Element(); this.controls.set(selector, control); return control;
    }
    return null;
  }
  querySelectorAll() { return []; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  insertBefore(node, before) {
    node.parentNode = this;
    const index = this.children.indexOf(before);
    if (index < 0) this.children.push(node); else this.children.splice(index, 0, node);
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) { return selector === '[data-view]' && this.dataset.view ? this : null; }
  matches() { return false; }
  focus() {}
  scrollIntoView() {}
  reset() {}
}

function harness({ view = 'overview', user = 'member-a', initialTrip, ready, app = true, today = false } = {}) {
  const trip = initialTrip === null ? null : Object.assign({
    id: 'plan-trip', ownerId: 'collaborative-owner', city: 'Test City', country: 'Test',
    start: '2026-10-18', end: '2026-10-19', days: 2,
    activities: [], savedPlaces: [], dayNotes: {}, budget: 123
  }, initialTrip);
  const values = new Map([['travelmate-active-user', user], ['travelmate-trips', JSON.stringify(trip ? [trip] : [])]]);
  const writes = [], errors = [], loaded = [], fields = [], timers = new Map();
  let timerId = 0;
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, String(value)); writes.push({ key, value: String(value) }); },
    removeItem: key => values.delete(key)
  };
  const window = new Target(), document = new Target();
  const container = new Element(), plan = new Element('section'); plan.appendChild(container);
  document.body = new Element('body'); document.body.dataset = { design: 'v3', tripView: view };
  document.readyState = 'complete'; document.scripts = [];
  document.currentScript = { src: 'https://example.test/assets/app.js?v=test' };
  document.createElement = tag => new Element(tag);
  document.querySelector = selector => selector === '[data-generated-days]' ? container : selector === '#plan' ? plan : null;
  document.querySelectorAll = () => [];
  document.getElementById = id => id === 'plan' ? plan : null;
  document.documentElement = new Element('html');
  const location = {
    href: 'https://example.test/trip/custom/index.html?id=plan-trip&view=' + view,
    pathname: '/trip/custom/index.html', protocol: 'https:', search: '?id=plan-trip&view=' + view,
    reload() {}, replace() {}
  };
  Object.assign(window, { document, localStorage, location, travelMateTripReady: ready || Promise.resolve(),
    matchMedia: () => ({ matches: false }), TravelMateHistory: {}, confirm: () => true });
  if (today) window.TravelMateToday = { localDateKey: () => '2026-10-18', phase: () => ({ name: 'active' }) };
  const context = vm.createContext({ window, document, localStorage, location, URL, URLSearchParams,
    Event, CustomEvent: DetailEvent, Promise, Intl, Date,
    navigator: { onLine: false }, history: { state: null },
    console: { error: (...args) => errors.push(args.map(String).join(' ')), log() {} },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => 1,
    MutationObserver: class { observe() {} disconnect() {} }, confirm: () => true
  });
  function run(name) { vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'assets', name), 'utf8'), context, { filename: name }); }
  document.head = new Element('head');
  document.head.appendChild = node => {
    if (node.tagName === 'SCRIPT') {
      const name = new URL(node.src).pathname.split('/').pop();
      document.scripts.push(node); loaded.push(name);
      // Full production app/planner/store/events execute. Unrelated resource loads
      // finish without execution; no browser, network or backend is involved.
      if (name === 'auto-planner.js') run(name);
    }
    queueMicrotask(() => node.onload?.());
    return node;
  };
  run('trip-store.js'); run('event-contracts.js');
  // Spy on calls while retaining the canonical store implementation unchanged.
  const canonical = window.TravelMateTripStore;
  window.TravelMateTripStore = Object.assign({}, canonical, { saveTripFields(...args) {
    fields.push(copy(args.slice(1))); return canonical.saveTripFields(...args);
  } });
  if (app) run('app.js'); else run('auto-planner.js');
  function navigate(next) {
    const previousView = document.body.dataset.tripView;
    document.body.dataset.tripView = next;
    window.TravelMateEvents.emit(window.TravelMateEvents.names.viewChange, { view: next, previousView });
  }
  function speculative(type) {
    const link = new Element('a'); link.dataset.view = 'plan';
    const event = new Event(type); Object.defineProperty(event, 'target', { value: link });
    document.dispatchEvent(event);
  }
  function account(next) {
    values.set('travelmate-active-user', next);
    window.dispatchEvent(new DetailEvent('travelmate:account-context-changed', { detail: { trips: canonical.getTrips() } }));
  }
  return { window, document, container, plan, values, writes, errors, loaded, fields, timers, location,
    canonical, navigate, speculative, account, run,
    current: () => copy(canonical.getTrip('plan-trip')),
    replace: value => values.set('travelmate-trips', JSON.stringify(value ? [value] : [])),
    toolbars: () => plan.children.filter(node => node.className === 'planner-toolbar'),
    composers: () => plan.children.filter(node => node.className === 'planner-composer') };
}
function assertIdle(h) {
  assert.equal(h.writes.length, 0, 'speculative/stale startup must not write storage');
  assert.equal(h.current()?.planInitialized, undefined);
  assert.equal(h.container.dataset.enhanced, undefined);
  assert.equal(h.toolbars().length, 0);
  assert.equal(h.composers().length, 0);
  assert.equal(h.plan.children.length, 1, 'no secondary planner chrome mounts before activation');
  assert.deepEqual(h.errors, []);
}
function assertMounted(h) {
  assert.equal(h.container.dataset.enhanced, 'true');
  assert.equal(h.toolbars().length, 1);
  assert.equal(h.composers().length, 1);
  assert.deepEqual(h.errors, []);
}

for (const type of ['pointerenter', 'touchstart']) {
  test('Plan ' + type + ' from Overview does not execute planner or write trip data', async () => {
    const h = harness(); await flush(); h.speculative(type); await flush();
    assertIdle(h);
    assert.equal(h.loaded.includes('auto-planner.js'), false);
    h.navigate('plan'); await flush(); assertMounted(h);
    assert.equal(h.writes.length, 1); assert.equal(h.current().activities.length, 2);
  });
}
test('explicit entry and repeated navigation initialize exactly once using canonical owned fields', async () => {
  const h = harness(); await flush(); assertIdle(h);
  assert.notEqual(h.window, h.document);
  h.navigate('plan'); h.navigate('plan'); await flush(); assertMounted(h);
  assert.equal(h.current().planInitialized, true); assert.equal(h.writes.length, 1);
  assert.equal(h.current().ownerId, 'collaborative-owner');
  assert.equal(h.fields[0][2].userId, 'member-a');
  assert.deepEqual(h.fields[0][1], ['activities', 'dayNotes', 'savedPlaces', 'planInitialized']);
  const listeners = h.container.listenerCount('click');
  for (let i = 0; i < 3; i++) { h.navigate('overview'); h.navigate('plan'); }
  await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
  assert.equal(h.container.listenerCount('click'), listeners);
  assert.equal(h.loaded.filter(name => name === 'auto-planner.js').length, 1);
  assert.equal(h.window.TravelMatePlanner.openDay('2026-10-18'), true);
  assert.equal(h.window.TravelMatePlanner.openDay('2030-01-01'), false);
});
test('loading the planner API while Overview is active never initializes it', async () => {
  const h = harness({ app: false }); await flush(); assertIdle(h);
  h.navigate('plan'); await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
});
test('readiness after leaving Plan cannot mount or write; re-entry can retry', async () => {
  const ready = deferred(), h = harness({ ready: ready.promise });
  h.navigate('plan'); await flush(); h.navigate('overview'); ready.resolve(); await flush();
  assertIdle(h); h.navigate('plan'); await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
});
test('leave/re-entry before readiness starts a fresh single-flight activation', async () => {
  const ready = deferred(), h = harness({ ready: ready.promise });
  h.navigate('plan'); await flush(); h.navigate('overview'); h.navigate('plan'); h.navigate('plan');
  ready.resolve(); await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
});
for (const users of [['member-b'], ['member-b', 'member-a']]) {
  test('account transition ' + users.join(' then ') + ' invalidates pending startup', async () => {
    const ready = deferred(), h = harness({ ready: ready.promise });
    h.navigate('plan'); await flush(); users.forEach(h.account); ready.resolve(); await flush();
    assertIdle(h); h.navigate('overview'); h.navigate('plan'); await flush(); assertMounted(h);
    assert.equal(h.writes.length, 1);
  });
}
test('canonical activities and unrelated data added while waiting survive initialization', async () => {
  const ready = deferred(), h = harness({ ready: ready.promise });
  h.navigate('plan'); await flush();
  const latest = h.current();
  latest.activities = [{ id: 'arrived', title: 'Added while waiting', date: latest.start, time: '12:00' }];
  latest.savedPlaces = [{ id: 'saved', name: 'Keep me' }]; latest.budget = 999; latest.dayNotes = { [latest.start]: 'Keep note' };
  h.replace(latest); ready.resolve(); await flush(); assertMounted(h);
  assert.deepEqual(h.current(), Object.assign(latest, { planInitialized: true }));
  assert.equal(h.writes.length, 1);
});
test('a trip hydrated during readiness is initialized on explicit direct Plan startup', async () => {
  const ready = deferred(), h = harness({ initialTrip: null, view: 'plan', ready: ready.promise });
  await flush(); assertIdle(h);
  h.replace({ id: 'plan-trip', ownerId: 'another-owner', city: 'Test', start: '2026-10-18', days: 1 });
  ready.resolve(); await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
});
test('canonical owner replacement invalidates pending initialization without confusing member and owner', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise });
  await flush(); h.replace(Object.assign(h.current(), { ownerId: 'replacement-owner' }));
  ready.resolve(); await flush(); assertIdle(h);
  h.navigate('overview'); h.navigate('plan'); await flush(); assertMounted(h);
});
test('missing trip does not consume enhancement marker and can retry after canonical data arrives', async () => {
  const h = harness({ view: 'plan', initialTrip: null }); await flush(); assertIdle(h);
  h.replace({ id: 'plan-trip', city: 'Test', start: '2026-10-18', days: 1 });
  h.navigate('overview'); h.navigate('plan'); await flush(); assertMounted(h);
});
test('direct Plan deep link honors existing initialized data and performs no save', async () => {
  const h = harness({ view: 'plan', initialTrip: { planInitialized: true, activities: [] } });
  delete h.document.body.dataset.tripView; await flush(); assertMounted(h);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.current().activities, []);
});
test('URL trip identity change during readiness cannot initialize the replacement trip', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise }); await flush();
  h.location.search = '?id=different-trip&view=plan'; ready.resolve(); await flush(); assertIdle(h);
});

test('new readiness on re-entry is not blocked by an unresolved obsolete attempt', async () => {
  const oldReady = deferred(), newReady = deferred(), h = harness({ view: 'plan', ready: oldReady.promise });
  await flush(); h.navigate('overview'); h.window.travelMateTripReady = newReady.promise;
  h.navigate('plan'); newReady.resolve(); await flush(); assertMounted(h);
  assert.equal(h.writes.length, 1); oldReady.resolve(); await flush();
  assertMounted(h); assert.equal(h.writes.length, 1);
});
test('rejected readiness leaves the marker free and explicit re-entry retries', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise, app: false }); await flush();
  ready.reject(new Error('synthetic hydration failure')); await flush();
  assert.match(h.errors.shift(), /synthetic hydration failure/); assertIdle(h);
  h.window.travelMateTripReady = Promise.resolve(); h.navigate('overview'); h.navigate('plan');
  await flush(); assertMounted(h); assert.equal(h.writes.length, 1);
});
test('a changed canonical store context invalidates pending work', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise }); await flush();
  h.window.TravelMateTripStore = Object.assign({}, h.window.TravelMateTripStore);
  ready.resolve(); await flush(); assertIdle(h);
  h.navigate('overview'); h.navigate('plan'); await flush(); assertMounted(h);
});
test('active-user storage events invalidate an A to B to A pending attempt', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise }); await flush();
  for (const user of ['member-b', 'member-a']) {
    h.values.set('travelmate-active-user', user);
    const event = new Event('storage'); Object.defineProperty(event, 'key', { value: 'travelmate-active-user' });
    h.window.dispatchEvent(event);
  }
  ready.resolve(); await flush(); assertIdle(h);
});
function submitActivity(h, title) {
  const form = h.composers()[0];
  for (const [name, value] of Object.entries({ date: '2026-10-18', time: '14:00', title,
    category: 'Test', duration: '60', scheduleMode: 'flexible', travelMode: 'auto' })) form.elements[name].value = value;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}
test('offline composer saves still merge canonical changes through saveTripFields', async () => {
  const h = harness({ view: 'plan' }); await flush(); assertMounted(h);
  const latest = h.current(); latest.budget = 777;
  latest.activities.push({ id: 'external', date: '2026-10-18', time: '11:00', title: 'External addition' });
  h.replace(latest); submitActivity(h, 'Offline addition');
  assert.equal(h.current().budget, 777);
  assert.equal(h.current().activities.length, 4);
  assert.ok(h.current().activities.some(item => item.id === 'external'));
  assert.ok(h.current().activities.some(item => item.title === 'Offline addition'));
  assert.equal(h.writes.length, 2); assert.deepEqual(h.errors, []);
});
test('already mounted closures cannot save after account A to B to A', async () => {
  const h = harness({ view: 'plan' }); await flush(); assertMounted(h);
  const original = h.current(); h.account('member-b'); h.account('member-a');
  submitActivity(h, 'Stale edit');
  assert.deepEqual(h.current(), original); assert.equal(h.writes.length, 1);
  assert.equal(h.toolbars().length, 1); assert.deepEqual(h.errors, []);
});
test('secondary past-day enhancements wait for the primary planner prerequisites', async () => {
  const ready = deferred(), h = harness({ view: 'plan', ready: ready.promise, today: true });
  await flush(); assertIdle(h); h.navigate('overview'); ready.resolve(); await flush(); assertIdle(h);
});
