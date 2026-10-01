'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadCloud(initialUser, snapshots) {
  const store = new Map();
  store.set('travelmate-active-user', initialUser || '');
  store.set('travelmate-trips', JSON.stringify(snapshots[initialUser] || []));
  Object.keys(snapshots).forEach(user => store.set('travelmate-trips-user:' + user, JSON.stringify(snapshots[user] || [])));
  const listeners = [];
  const writes = [];
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    key(index) { return Array.from(store.keys())[index] || null; },
    get length() { return store.size; }
  };
  const window = {
    __travelMateSupabaseClient: {
      auth: {
        onAuthStateChange(callback) { listeners.push(callback); return { data: { subscription: { unsubscribe() {} } } }; },
        updateUser: async update => { writes.push(update); return { data: { user: { user_metadata: update.data } }, error: null }; },
        signOut: async () => ({ error: null })
      }
    },
    dispatchEvent() {},
    addEventListener() {}
  };
  const sandbox = {
    window,
    document: { createElement() { return { set src(v) {}, set integrity(v) {}, set crossOrigin(v) {}, remove() {}, }; }, head: { appendChild() {} } },
    localStorage,
    sessionStorage: { removeItem() {} },
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    console,
    Promise,
    Date,
    Math,
    JSON,
    String,
    Number,
    Object,
    Array,
    Map,
    Set
  };
  vm.runInNewContext(fs.readFileSync('assets/cloud-sync.js', 'utf8'), sandbox);
  return {
    api: window.TravelMateCloud,
    switchTo(userId) { listeners.forEach(callback => callback('SIGNED_IN', { user: { id: userId } })); },
    store,
    writes
  };
}

test('account switch replaces canonical local trip set and never mixes A into B', async () => {
  const a = { id: 'trip-a', ownerId: 'user-a', city: 'Prague' };
  const b = { id: 'trip-b', ownerId: 'user-b', city: 'Tokyo' };
  const harness = loadCloud('user-a', { 'user-a': [a], 'user-b': [b] });
  await harness.api.onAuthChange(() => {});
  harness.switchTo('user-b');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(harness.api.getLocalTrips(), [b]);
  assert.equal(harness.api.getLocalTrips().some(trip => trip.ownerId === 'user-a'), false);
});

test('queued save from account A is invalidated before it can execute after switch to B', async () => {
  const a = { id: 'trip-a', ownerId: 'user-a', city: 'Prague', updatedAt: new Date().toISOString() };
  const harness = loadCloud('user-a', { 'user-a': [a], 'user-b': [] });
  await harness.api.onAuthChange(() => {});
  harness.api.queueTripSave(a, 20);
  harness.switchTo('user-b');
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(harness.writes.length, 0);
  assert.deepEqual(harness.api.getLocalTrips(), []);
});

test('lifecycle implementation has explicit stale-response guards for Mate and owner-partitioned experience storage', () => {
  const ai = fs.readFileSync('assets/ai-assistant.js', 'utf8');
  const experience = fs.readFileSync('assets/trip-experience.js', 'utf8');
  assert.match(ai, /lifecycleGeneration/);
  assert.match(ai, /requestIsCurrent/);
  assert.match(ai, /requestGeneration !== state\.lifecycleGeneration/);
  assert.match(ai, /travelmate:ai-account-context-changed/);
  assert.match(experience, /activeOwnerId/);
  assert.match(experience, /travelmate-experience-migrated:/);
  assert.match(experience, /travelmate:canonical-trip-replaced/);
  assert.match(experience, /travelmate:account-context-changed/);
});
