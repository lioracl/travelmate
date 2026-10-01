'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => process.env.ACCOUNT_LIFECYCLE_SOURCE_REV
  ? execFileSync('git', ['show', process.env.ACCOUNT_LIFECYCLE_SOURCE_REV + ':assets/' + name], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'assets', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function storage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function experience(trip, user = 'A') {
  const localStorage = storage(); localStorage.setItem('travelmate-active-user', user);
  const events = {};
  const window = { addEventListener: (name, fn) => { events[name] = fn; }, dispatchEvent() {} };
  let source = read('trip-experience.js');
  source = source.replace(/  init\(\);\s*\}\)\(\);\s*$/, `
    renderCurrency = renderExpenseList = renderMemories = renderSummary = renderBudgetCharts = renderBudgetColumns = renderAlbumActions = function () {};
    window.harness = { state: state, refresh: refreshFromCanonicalTrip, read: readExperienceJson, save: saveTripData };
  })();`);
  vm.runInNewContext(source, { window, localStorage, location: { pathname: '/trip/custom/', search: '?id=same' }, URLSearchParams, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null }, CustomEvent: function () {}, console });
  Object.assign(window.harness.state, { trip, expenses: trip.expenses || [], memories: trip.memories || [], albumUrl: trip.photoAlbumUrl || '' });
  return { ...window.harness, localStorage, event: (name, detail) => events[name]({ detail }) };
}
test('sign-out clears Budget and Memories even when the current trip has no replacement', () => {
  const h = experience({ id: 'same', ownerId: 'A', expenses: [{ id: 1 }], memories: [{ note: 'private A' }], photoAlbumUrl: 'https://photos.google.com/A' });
  h.localStorage.removeItem('travelmate-active-user');
  h.event('travelmate:account-context-changed', { userId: null, trips: [] });
  assert.deepEqual(plain(h.state.expenses), []);
  assert.deepEqual(plain(h.state.memories), []);
  assert.equal(h.state.albumUrl, '');
});
test('switch to an account without the open trip clears the previous experience', () => {
  const h = experience({ id: 'same', ownerId: 'A', expenses: [{ id: 1 }], memories: [{ note: 'private A' }] });
  h.localStorage.setItem('travelmate-active-user', 'B');
  h.event('travelmate:account-context-changed', { userId: 'B', trips: [] });
  assert.deepEqual(plain(h.state.memories), []);
  assert.deepEqual(plain(h.state.expenses), []);
});
test('canonical empty album and category list override older owned fallback data', () => {
  const h = experience({ id: 'same', ownerId: 'A' });
  h.localStorage.setItem('travelmate-experience:A:same:album-url', JSON.stringify('https://photos.google.com/old'));
  h.localStorage.setItem('travelmate-experience:A:same:budget-categories', JSON.stringify([{ id: 'old', name: 'old' }]));
  h.refresh({ userId: 'A', trip: { id: 'same', ownerId: 'A', photoAlbumUrl: '', budgetCategories: [], memories: [], expenses: [] } });
  assert.equal(h.state.albumUrl, '');
  assert.deepEqual(plain(h.state.budgetCategories), []);
});
test('legacy migration requires an exact canonical field match and stays per field', () => {
  const trip = { id: 'same', ownerId: 'A', expenses: [{ id: 1 }], memories: [] };
  const h = experience(trip);
  h.localStorage.setItem('travelmate-trips-user:A', JSON.stringify([trip]));
  h.localStorage.setItem('travelmate-experience:same:expenses', JSON.stringify(trip.expenses));
  h.localStorage.setItem('travelmate-experience:same:memories', JSON.stringify([{ note: 'unknown owner' }]));
  assert.deepEqual(plain(h.read('expenses', [])), trip.expenses);
  assert.deepEqual(plain(h.read('memories', [])), []);
  assert.equal(h.localStorage.getItem('travelmate-experience:A:same:memories'), null);
});
function aiHarness() {
  const source = read('ai-assistant.js');
  const start = source.indexOf('  async function getSession()');
  const end = source.indexOf('  function friendlyError', start);
  const localStorage = storage(); localStorage.setItem('travelmate-active-user', 'A');
  let resolve;
  const service = { getSession: () => new Promise(r => { resolve = r; }) };
  const sandbox = { state: { session: { user: { id: 'A' } }, lifecycleGeneration: 0 }, activeCloud: () => service, localStorage, Date, Error };
  vm.createContext(sandbox); vm.runInContext(source.slice(start, end), sandbox);
  return { sandbox, localStorage, service, resolve: value => resolve(value) };
}
test('a late Mate session read cannot overwrite the newer account session', async () => {
  const h = aiHarness(); const pending = h.sandbox.getSession();
  h.localStorage.setItem('travelmate-active-user', 'B');
  h.sandbox.state.lifecycleGeneration++;
  h.sandbox.state.session = { user: { id: 'B' } };
  h.resolve({ user: { id: 'A' } }); await pending;
  assert.equal(h.sandbox.state.session.user.id, 'B');
});
function cloudHarness() {
  const localStorage = storage(); localStorage.setItem('travelmate-active-user', 'A');
  for (const user of ['A', 'B']) localStorage.setItem('travelmate-trips-user:' + user, JSON.stringify([{ id: 'same', ownerId: user, city: user, syncStatus: 'synced', updatedAt: '2026-01-01' }]));
  localStorage.setItem('travelmate-trips', localStorage.getItem('travelmate-trips-user:A'));
  const callbacks = []; let user = 'A';
  const client = { auth: { getSession: async () => ({ data: { session: user ? { user: { id: user } } : null } }), onAuthStateChange: fn => { callbacks.push(fn); return {}; } } };
  const window = { __travelMateSupabaseClient: client, addEventListener() {}, dispatchEvent() {} };
  vm.runInNewContext(read('cloud-sync.js'), { window, localStorage, sessionStorage: storage(), document: {}, setTimeout, clearTimeout, CustomEvent: function () {}, console });
  return { api: window.TravelMateCloud, client, localStorage, emit(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') { user = next; callbacks.forEach(fn => fn(event, next ? { user: { id: next } } : null)); } };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test('late cloud session reads cannot reactivate a previous account', async () => {
  const h = cloudHarness(); await h.api.onAuthChange(() => {});
  let resolve; h.client.auth.getSession = () => new Promise(r => { resolve = r; });
  const pending = h.api.getSession(); await tick(); h.emit('B'); await tick();
  resolve({ data: { session: { user: { id: 'A' } } } });
  await assert.rejects(pending, /AUTH_CONTEXT_CHANGED/);
  assert.equal(h.localStorage.getItem('travelmate-active-user'), 'B');
});
test('auth storage switches synchronously and stale deferred callbacks are skipped', async () => {
  const h = cloudHarness(); const delivered = []; await h.api.onAuthChange((event, session) => delivered.push(session.user.id));
  h.emit('B'); assert.equal(h.localStorage.getItem('travelmate-active-user'), 'B');
  h.emit('A'); await tick();
  assert.deepEqual(delivered, ['A']);
});
test('an A to B to A switch invalidates an earlier A trip read', async () => {
  const h = cloudHarness(); await h.api.onAuthChange(() => {});
  let resolve;
  h.client.from = () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return new Promise(r => { resolve = r; }); } });
  const pending = h.api.getTrip('same', 'A'); await tick();
  h.emit('B'); await tick(); h.emit('A'); await tick();
  resolve({ data: [{ user_id: 'A', id: 'same', city: 'stale answer', payload: {}, updated_at: '2026-10-01', start_date: '2026-01-01', end_date: '2026-01-02' }] });
  await assert.rejects(pending, /AUTH_CONTEXT_CHANGED/);
  assert.equal(h.api.getLocalTrips()[0].city, 'A');
});
test('an A to B to A switch invalidates save acknowledgements', async () => {
  const h = cloudHarness(); await h.api.onAuthChange(() => {}); let resolve;
  h.client.rpc = () => new Promise(r => { resolve = r; });
  const pending = h.api.saveTrip({ id: 'same', ownerId: 'A', city: 'A edit' }); await tick();
  h.emit('B'); await tick(); h.emit('A'); await tick();
  resolve({ data: [{ result_status: 'saved', result_revision: 5, result_updated_at: '2026-10-01' }] });
  await assert.rejects(pending, /AUTH_CONTEXT_CHANGED/);
  assert.notEqual(h.api.getLocalTrips()[0].cloudRevision, 5);
});
test('a private-storage MFA completion cannot reactivate a previous session', async () => {
  const h = cloudHarness(); await h.api.onAuthChange(() => {}); let resolve;
  h.client.auth.mfa = { getAuthenticatorAssuranceLevel: () => new Promise(r => { resolve = r; }) };
  const pending = h.api.getPrivateStorageSession(); await tick(); h.emit('B'); await tick();
  resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
  await assert.rejects(pending, /AUTH_CONTEXT_CHANGED/);
  assert.equal(h.localStorage.getItem('travelmate-active-user'), 'B');
});
test('a late Mate token refresh cannot overwrite the newer account', async () => {
  const h = aiHarness(); let resolveRefresh;
  h.service.getSession = async () => ({ user: { id: 'A' }, expires_at: 1 });
  h.service.getClient = async () => ({ auth: { refreshSession: () => new Promise(r => { resolveRefresh = r; }) } });
  const pending = h.sandbox.getSession(); await tick();
  h.localStorage.setItem('travelmate-active-user', 'B'); h.sandbox.state.lifecycleGeneration++; h.sandbox.state.session = { user: { id: 'B' } };
  resolveRefresh({ data: { session: { user: { id: 'A' } } } }); await pending;
  assert.equal(h.sandbox.state.session.user.id, 'B');
});
test('Realtime callbacks from the earlier A session stay stale after A to B to A', async () => {
  const h = cloudHarness(); await h.api.onAuthChange(() => {});
  const handlers = [];
  h.client.channel = () => ({ on(kind, filter, fn) { handlers.push(fn); return this; }, subscribe: async () => {} });
  h.client.removeChannel = () => {};
  let received = 0; await h.api.subscribeToSharedTrip('A', 'same', { onTripUpdate: () => received++ });
  h.emit('B'); await tick(); h.emit('A'); await tick();
  handlers[0]({ new: { user_id: 'A', id: 'same', city: 'old Realtime', payload: {}, updated_at: '2026-10-01' } });
  assert.equal(received, 0);
  assert.equal(h.api.getLocalTrips()[0].city, 'A');
});
