const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function sourceSlice(file, start, end) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `Missing start marker in ${file}`);
  assert.notEqual(to, -1, `Missing end marker in ${file}`);
  return source.slice(from, to);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('Navo duplicate prevention uses response identity without collapsing distinct responses', () => {
  const context = {};
  vm.runInNewContext(sourceSlice('assets/ai-assistant.js', '  function appendAiNote', '\n\n  function persistTripWithNote'), context);
  const trip = { id: 'synthetic-trip', aiNotes: [] };
  assert.equal(context.appendAiNote(trip, 'Same title', 'Same answer', { responseId: 'response-1', tripId: trip.id }), true);
  assert.equal(context.appendAiNote(trip, 'Same title', 'Same answer', { responseId: 'response-1', tripId: trip.id }), false);
  assert.equal(context.appendAiNote(trip, 'Same title', 'Same answer', { responseId: 'response-2', tripId: trip.id }), true);
  assert.equal(trip.aiNotes.length, 2);
  assert.ok(trip.aiNotes.every((note) => note.tripId === trip.id));
});

test('Navo save metadata binds response identity to its trip and survives JSON hydration', () => {
  const context = {};
  vm.runInNewContext(sourceSlice('assets/trip-intelligence.js', '  function noteMetadata', '\n  function saveResponse'), context);
  const metadata = context.noteMetadata({ tripId: 'trip-A', destination: 'Prague', country: 'Czechia' }, { title: 'Recommendation', subtitle: 'Solo', type: 'navo-recommendation', generatedAt: '2026-09-13T10:00:00.000Z' }, 'response-A');
  const hydrated = JSON.parse(JSON.stringify(metadata));
  assert.equal(hydrated.tripId, 'trip-A');
  assert.equal(hydrated.responseId, 'response-A');
  assert.equal(hydrated.title, 'Recommendation');
});

test('a delayed Trip Intelligence response stays with its originating state', async () => {
  const pending = deferred();
  const first = { key: 'EXISTING_TRIP:first', context: { tripId: 'first' }, requestId: 0, busy: false };
  const second = { key: 'EXISTING_TRIP:second', context: { tripId: 'second' }, requestId: 0, busy: false };
  const context = {
    state: first,
    ui: { stale: {}, content: {}, save: {} },
    window: { TravelMateNavo: { request: () => pending.promise, friendlyError: String } },
    fingerprint: (value) => JSON.stringify(value),
    promptFor: (value) => `prompt:${value.tripId}`,
    recommendationFor: (value, answer) => ({ title: value.tripId, body: answer }),
    newResponseId: () => 'response-first',
    renderState() { context.rendered = true; },
    updateBannerState() {},
    escapeHtml: String
  };
  vm.runInNewContext(sourceSlice('assets/trip-intelligence.js', '  async function generate()', '\n  async function continueAnswer'), context);
  const request = context.generate();
  context.state = second;
  pending.resolve({ answer: 'first response', data: {} });
  await request;
  assert.equal(first.recommendation.body, 'first response');
  assert.equal(first.recommendation.title, 'first');
  assert.equal(second.recommendation, undefined);
  assert.equal(context.rendered, undefined);
});

test('a delayed Trip Intelligence response is discarded when its own trip context changes', async () => {
  const pending = deferred();
  const active = { key: 'NEW_TRIP:synthetic', context: { tripId: 'draft', city: 'A' }, requestId: 0, busy: false };
  const context = {
    state: active,
    ui: { stale: {}, content: {}, save: {} },
    window: { TravelMateNavo: { request: () => pending.promise, friendlyError: String } },
    fingerprint: (value) => JSON.stringify(value),
    promptFor: (value) => `prompt:${value.city}`,
    recommendationFor: (value, answer) => ({ title: value.city, body: answer }),
    newResponseId: () => 'response-stale',
    renderState() { context.rendered = true; },
    updateBannerState() {},
    escapeHtml: String
  };
  vm.runInNewContext(sourceSlice('assets/trip-intelligence.js', '  async function generate()', '\n  async function continueAnswer'), context);
  const request = context.generate();
  active.context = { tripId: 'draft', city: 'B' };
  pending.resolve({ answer: 'stale response', data: {} });
  await request;
  assert.equal(active.recommendation, null);
  assert.equal(context.rendered, true);
});

test('trip cloud writes are serialized and an older completion cannot replace newer local data', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  const writes = [];
  const events = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from(table) {
      assert.equal(table, 'travel_trips');
      return { upsert(row) { const gate = deferred(); writes.push({ row, gate }); return gate.promise; } };
    }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent: (event) => events.push(event), addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const firstTrip = { id: 'synthetic-trip', ownerId: 'user-1', country: 'Test', city: 'old', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const firstSave = context.window.TravelMateCloud.saveTrip(firstTrip);
  const secondTrip = Object.assign({}, firstTrip, { city: 'new' });
  const secondSave = context.window.TravelMateCloud.saveTrip(secondTrip);
  await new Promise(setImmediate);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city, 'new');
  writes[0].gate.resolve({ error: null });
  await new Promise(setImmediate);
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city, 'new');
  writes[1].gate.resolve({ error: null });
  await Promise.all([firstSave, secondSave]);
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.city, 'new');
  assert.equal(stored.syncStatus, 'synced');
  assert.ok(events.some((event) => event.type === 'travelmate:trip-sync-state' && event.detail.status === 'pending'));
  assert.ok(events.some((event) => event.type === 'travelmate:trip-sync-state' && event.detail.status === 'synced'));
});

test('a failed cloud write keeps the synthetic local trip and marks it retryable', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert: async () => ({ error: new Error('offline') }) }; }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  await assert.rejects(context.window.TravelMateCloud.saveTrip({ id: 'offline-trip', ownerId: 'user-1', country: 'Test', city: 'Offline', start: '2026-01-01', end: '2026-01-02', days: 1 }));
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.city, 'Offline');
  assert.equal(stored.syncStatus, 'failed');
  assert.equal(stored.cloudUpdatedAt, undefined);
});

test('hydration does not overwrite a newer offline edit that has an older cloud timestamp', async () => {
  const localTrip = { id: 'offline-edit', ownerId: 'user-1', country: 'Test', city: 'new local city', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-03T00:00:00.000Z', cloudUpdatedAt: '2026-01-01T00:00:00.000Z', syncStatus: 'failed' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([localTrip])]]);
  const cloudRow = { user_id: 'user-1', id: 'offline-edit', country: 'Test', city: 'old cloud city', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'סולו', days: 1, payload: { city: 'old cloud city', updatedAt: '2026-01-02T00:00:00.000Z' }, updated_at: '2026-01-02T00:00:00.000Z' };
  let uploaded;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        limit: async () => ({ error: null, data: [cloudRow] }),
        upsert: async (row) => { uploaded = row; return { error: null }; }
      };
      return query;
    }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const hydrated = await context.window.TravelMateCloud.getTrip('offline-edit', 'user-1');
  assert.equal(hydrated.city, 'new local city');
  assert.equal(uploaded.city, 'new local city');
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city, 'new local city');
});

test('Trip Intelligence response IDs remain distinct even when the clock does not advance', () => {
  const context = { responseSequence: 0, Date: { now: () => 1234 }, window: { crypto: null } };
  vm.runInNewContext(sourceSlice('assets/trip-intelligence.js', '  function newResponseId()', '\n  function bindContext'), context);
  const first = context.newResponseId();
  const second = context.newResponseId();
  assert.notEqual(first, second);
});

test('a debounced queue snapshots nested trip data before later live-trip mutations', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  const writes = [];
  const writeSeen = deferred();
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert: async (row) => { writes.push(row); writeSeen.resolve(); return { error: null }; } }; }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const trip = { id: 'snapshot-trip', ownerId: 'user-1', country: 'Test', city: 'Before', start: '2026-01-01', end: '2026-01-02', days: 1, activities: [{ id: 'one', title: 'Before' }] };
  context.window.TravelMateCloud.queueTripSave(trip, 0);
  trip.city = 'After';
  trip.activities[0].title = 'After';
  trip.activities.push({ id: 'two', title: 'After' });
  await writeSeen.promise;
  assert.equal(writes[0].city, 'Before');
  assert.equal(writes[0].payload.activities.length, 1);
  assert.equal(writes[0].payload.activities[0].title, 'Before');
});

test('different trips save concurrently and a failure does not block the next same-trip save', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  const writes = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert(row) { const gate = deferred(); writes.push({ row, gate }); return gate.promise; } }; }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {}
  };
  const source = fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8').replace('  window.TravelMateCloud = {', '  window.__phase15SaveChains = saveChains;\n  window.TravelMateCloud = {');
  vm.runInNewContext(source, context);
  const base = { ownerId: 'user-1', country: 'Test', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const firstA = context.window.TravelMateCloud.saveTrip(Object.assign({ id: 'A', city: 'A1' }, base));
  const firstB = context.window.TravelMateCloud.saveTrip(Object.assign({ id: 'B', city: 'B1' }, base));
  const secondA = context.window.TravelMateCloud.saveTrip(Object.assign({ id: 'A', city: 'A2' }, base));
  await new Promise(setImmediate);
  assert.equal(writes.length, 2);
  const a1 = writes.find((write) => write.row.city === 'A1');
  const b1 = writes.find((write) => write.row.city === 'B1');
  a1.gate.resolve({ error: new Error('first A failed') });
  b1.gate.resolve({ error: null });
  await assert.rejects(firstA);
  await firstB;
  await new Promise(setImmediate);
  assert.equal(writes.length, 3);
  assert.equal(writes[2].row.city, 'A2');
  writes[2].gate.resolve({ error: null });
  await secondA;
  await new Promise(setImmediate);
  assert.equal(context.window.__phase15SaveChains.size, 0);
});

test('offline edit survives a fresh runtime and synchronizes once on reconnect', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  function localStorageMock() {
    return { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  }
  const offlineClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert: async () => ({ error: new Error('offline') }) }; }
  };
  const firstRuntime = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: localStorageMock(), window: { __travelMateSupabaseClient: offlineClient, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), firstRuntime);
  await assert.rejects(firstRuntime.window.TravelMateCloud.saveTrip({ id: 'restart-trip', ownerId: 'user-1', country: 'Test', city: 'Offline edit', start: '2026-01-01', end: '2026-01-02', days: 1 }));
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].syncStatus, 'failed');

  let onlineHandler;
  let uploadCount = 0;
  const uploadGate = deferred();
  const onlineClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      const query = {
        select() { return query; },
        order: async () => ({ error: null, data: [] }),
        upsert: (row) => { uploadCount += 1; assert.equal(row.city, 'Offline edit'); return uploadGate.promise; }
      };
      return query;
    }
  };
  const secondRuntime = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: localStorageMock(), window: { __travelMateSupabaseClient: onlineClient, dispatchEvent() {}, addEventListener(type, handler) { if (type === 'online') onlineHandler = handler; } }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), secondRuntime);
  assert.equal(typeof onlineHandler, 'function');
  onlineHandler();
  for (let index = 0; index < 3; index += 1) await new Promise(setImmediate);
  assert.equal(uploadCount, 1);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].syncStatus, 'pending');
  uploadGate.resolve({ error: null });
  for (let index = 0; index < 3; index += 1) await new Promise(setImmediate);
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(uploadCount, 1);
  assert.equal(stored.city, 'Offline edit');
  assert.equal(stored.syncStatus, 'synced');
});

test('an older Realtime update cannot overwrite a newer local revision', async () => {
  const localTrip = { id: 'shared-trip', ownerId: 'owner-1', country: 'Test', city: 'new local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-03T00:00:00.000Z', cloudUpdatedAt: '2026-01-01T00:00:00.000Z', syncStatus: 'pending' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([localTrip])]]);
  let tripUpdateHandler;
  const channel = {
    on(event, filter, handler) { if (filter.table === 'travel_trips') tripUpdateHandler = handler; return channel; },
    subscribe: async () => {}
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    channel: () => channel,
    removeChannel() {}
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  let callbackCount = 0;
  await context.window.TravelMateCloud.subscribeToSharedTrip('owner-1', 'shared-trip', { onTripUpdate() { callbackCount += 1; } });
  tripUpdateHandler({ new: { user_id: 'owner-1', id: 'shared-trip', country: 'Test', city: 'old remote', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'סולו', days: 1, payload: { city: 'old remote', updatedAt: '2026-01-02T00:00:00.000Z' }, updated_at: '2026-01-02T00:00:00.000Z', updated_by: 'other-user' } });
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city, 'new local');
  assert.equal(callbackCount, 0);
});

test('full sync is coalesced, saves separate trips in parallel, and preserves an edit made during sync', async () => {
  const base = { ownerId: 'user-1', country: 'Test', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z', syncStatus: 'failed' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([Object.assign({ id: 'A', city: 'A old' }, base), Object.assign({ id: 'B', city: 'B old' }, base)])]]);
  const writes = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      const query = {
        select() { return query; },
        order: async () => ({ error: null, data: [] }),
        upsert(row) { const gate = deferred(); writes.push({ row, gate }); return gate.promise; }
      };
      return query;
    }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {}
  };
  const source = fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8').replace('  window.TravelMateCloud = {', '  window.__phase15FullSyncPromises = fullSyncPromises;\n  window.TravelMateCloud = {');
  vm.runInNewContext(source, context);
  const firstSync = context.window.TravelMateCloud.syncLocalTrips();
  const coalescedSync = context.window.TravelMateCloud.syncLocalTrips();
  assert.equal(firstSync, coalescedSync);
  await new Promise(setImmediate);
  assert.equal(writes.length, 2, 'A and B should write concurrently and only once each');
  const writeA = writes.find((write) => write.row.id === 'A');
  const writeB = writes.find((write) => write.row.id === 'B');
  writeA.gate.resolve({ error: null });
  await new Promise(setImmediate);
  context.window.TravelMateCloud.upsertLocalTrip(Object.assign({}, base, { id: 'A', city: 'A edited during sync', updatedAt: '2099-01-01T00:00:00.000Z', syncStatus: 'pending' }));
  writeB.gate.resolve({ error: null });
  await firstSync;
  const storedA = JSON.parse(storage.get('travelmate-trips')).find((trip) => trip.id === 'A');
  assert.equal(storedA.city, 'A edited during sync');
  assert.equal(writes.length, 2);
  await new Promise(setImmediate);
  assert.equal(context.window.__phase15FullSyncPromises.size, 0);
});

test('getTrip rechecks local state after a delayed cloud read', async () => {
  const oldLocal = { id: 'read-race', ownerId: 'user-1', country: 'Test', city: 'local before query', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z', cloudUpdatedAt: '2026-01-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([oldLocal])]]);
  const readGate = deferred();
  let uploaded;
  const cloudRow = { user_id: 'user-1', id: 'read-race', country: 'Test', city: 'cloud middle', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'סולו', days: 1, payload: { city: 'cloud middle', updatedAt: '2026-01-02T00:00:00.000Z' }, updated_at: '2026-01-02T00:00:00.000Z' };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit: () => readGate.promise, upsert: async (row) => { uploaded = row; return { error: null }; } };
      return query;
    }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const loading = context.window.TravelMateCloud.getTrip('read-race', 'user-1');
  await new Promise(setImmediate);
  context.window.TravelMateCloud.upsertLocalTrip(Object.assign({}, oldLocal, { city: 'local after query', updatedAt: '2026-01-03T00:00:00.000Z', syncStatus: 'pending' }));
  readGate.resolve({ error: null, data: [cloudRow] });
  const result = await loading;
  assert.equal(result.city, 'local after query');
  assert.equal(uploaded.city, 'local after query');
});

test('deleting a trip cancels its pending save so it cannot be recreated', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  let upserts = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      const query = {
        upsert: async () => { upserts += 1; return { error: null }; },
        delete() { return query; }, eq() { return query; }, select() { return query; }, maybeSingle: async () => ({ error: null, data: { id: 'delete-trip' } })
      };
      return query;
    }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const trip = { id: 'delete-trip', ownerId: 'user-1', country: 'Test', city: 'Delete', start: '2026-01-01', end: '2026-01-02', days: 1 };
  context.window.TravelMateCloud.queueTripSave(trip, 20);
  await context.window.TravelMateCloud.deleteTrip(trip);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(upserts, 0);
  assert.equal(context.window.TravelMateCloud.getLocalTrips().some((item) => item.id === trip.id), false);
});

test('an ownerless first save and its post-session successor share one serialization chain', async () => {
  const storage = new Map([['travelmate-trips', '[]']]);
  const writes = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert(row) { const gate = deferred(); writes.push({ row, gate }); return gate.promise; } }; }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const first = context.window.TravelMateCloud.saveTrip({ id: 'ownerless', country: 'Test', city: 'First', start: '2026-01-01', end: '2026-01-02', days: 1 });
  await new Promise(setImmediate);
  const second = context.window.TravelMateCloud.saveTrip({ id: 'ownerless', ownerId: 'user-1', country: 'Test', city: 'Second', start: '2026-01-01', end: '2026-01-02', days: 1 });
  await new Promise(setImmediate);
  assert.equal(writes.length, 1);
  writes[0].gate.resolve({ error: null });
  await new Promise(setImmediate);
  assert.equal(writes.length, 2);
  writes[1].gate.resolve({ error: null });
  await Promise.all([first, second]);
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.ownerId, 'user-1');
  assert.equal(stored.city, 'Second');
  assert.equal(stored.syncStatus, 'synced');
});

test('a single ownerless save adopts the authenticated owner and reaches synced state', async () => {
  const storage = new Map([['travelmate-trips', '[]']]);
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { return { upsert: async () => ({ error: null }) }; }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  await context.window.TravelMateCloud.saveTrip({ id: 'single-ownerless', country: 'Test', city: 'Owner assigned', start: '2026-01-01', end: '2026-01-02', days: 1 });
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.ownerId, 'user-1');
  assert.equal(stored.syncStatus, 'synced');
});

test('full sync is isolated by active account and cannot merge user A data into user B storage', async () => {
  const tripA = { id: 'A-trip', ownerId: 'user-A', country: 'Test', city: 'A', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
  const storage = new Map([
    ['travelmate-active-user', 'user-A'],
    ['travelmate-trips', JSON.stringify([tripA])],
    ['travelmate-trips-user:user-A', JSON.stringify([tripA])]
  ]);
  let currentUser = 'user-A';
  const listA = deferred();
  const listB = deferred();
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    from() {
      const query = {
        select() { return query; },
        order() { return currentUser === 'user-A' ? listA.promise : listB.promise; }
      };
      return query;
    }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const syncA = context.window.TravelMateCloud.syncLocalTrips();
  await new Promise(setImmediate);

  currentUser = 'user-B';
  storage.set('travelmate-trips-user:user-B', '[]');
  storage.set('travelmate-active-user', 'user-B');
  storage.set('travelmate-trips', '[]');
  const syncB = context.window.TravelMateCloud.syncLocalTrips();
  assert.notEqual(syncA, syncB);
  await new Promise(setImmediate);
  listB.resolve({ error: null, data: [] });
  assert.equal((await syncB).length, 0);

  listA.resolve({ error: null, data: [] });
  await assert.rejects(syncA, (error) => error && error.code === 'AUTH_CONTEXT_CHANGED');
  assert.deepEqual(JSON.parse(storage.get('travelmate-trips')), []);
  assert.equal(storage.get('travelmate-active-user'), 'user-B');
});

test('getTrip discards a delayed user A response after switching to user B', async () => {
  const tripA = { id: 'account-read', ownerId: 'user-A', country: 'Test', city: 'A local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
  const tripB = { id: 'B-trip', ownerId: 'user-B', country: 'Test', city: 'B local', start: '2026-02-01', end: '2026-02-02', days: 1, updatedAt: '2026-02-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-A'], ['travelmate-trips', JSON.stringify([tripA])], ['travelmate-trips-user:user-A', JSON.stringify([tripA])]]);
  let currentUser = 'user-A';
  const readGate = deferred();
  const cloudRow = { user_id: 'user-A', id: 'account-read', country: 'Test', city: 'A cloud', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'solo', days: 1, payload: { city: 'A cloud', updatedAt: '2026-01-03T00:00:00.000Z' }, updated_at: '2026-01-03T00:00:00.000Z' };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    from() { const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit: () => readGate.promise }; return query; }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const loading = context.window.TravelMateCloud.getTrip('account-read', 'user-A');
  await new Promise(setImmediate);
  currentUser = 'user-B';
  storage.set('travelmate-trips-user:user-B', JSON.stringify([tripB]));
  storage.set('travelmate-active-user', 'user-B');
  storage.set('travelmate-trips', JSON.stringify([tripB]));
  readGate.resolve({ error: null, data: [cloudRow] });
  await assert.rejects(loading, (error) => error && error.code === 'AUTH_CONTEXT_CHANGED');
  assert.deepEqual(JSON.parse(storage.get('travelmate-trips')).map((trip) => trip.id), ['B-trip']);
});

test('a user A save acknowledgement cannot mutate user B local storage after an account switch', async () => {
  const tripA = { id: 'account-save', ownerId: 'user-A', country: 'Test', city: 'A edit', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const tripB = { id: 'B-trip', ownerId: 'user-B', country: 'Test', city: 'B local', start: '2026-02-01', end: '2026-02-02', days: 1 };
  const storage = new Map([['travelmate-active-user', 'user-A'], ['travelmate-trips', '[]']]);
  let currentUser = 'user-A';
  const writeGate = deferred();
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    from() { return { upsert: () => writeGate.promise }; }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const saving = context.window.TravelMateCloud.saveTrip(tripA);
  await new Promise(setImmediate);
  storage.set('travelmate-trips-user:user-A', storage.get('travelmate-trips'));
  currentUser = 'user-B';
  storage.set('travelmate-active-user', 'user-B');
  storage.set('travelmate-trips-user:user-B', JSON.stringify([tripB]));
  storage.set('travelmate-trips', JSON.stringify([tripB]));
  writeGate.resolve({ error: null });
  await assert.rejects(saving, (error) => error && error.code === 'AUTH_CONTEXT_CHANGED');
  const current = JSON.parse(storage.get('travelmate-trips'));
  assert.deepEqual(current.map((trip) => trip.id), ['B-trip']);
  assert.equal(current[0].city, 'B local');
});

test('a delayed getTrip response cannot resurrect a trip deleted while the read was pending', async () => {
  const trip = { id: 'deleted-read', ownerId: 'user-1', country: 'Test', city: 'Local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  const readGate = deferred();
  const cloudRow = { user_id: 'user-1', id: 'deleted-read', country: 'Test', city: 'Stale cloud', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'solo', days: 1, payload: { city: 'Stale cloud', updatedAt: '2026-01-03T00:00:00.000Z' }, updated_at: '2026-01-03T00:00:00.000Z' };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      let deleting = false;
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        limit: () => readGate.promise,
        delete() { deleting = true; return query; },
        maybeSingle: async () => ({ error: null, data: deleting ? { id: 'deleted-read' } : null })
      };
      return query;
    }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const loading = context.window.TravelMateCloud.getTrip(trip.id, trip.ownerId);
  await new Promise(setImmediate);
  await context.window.TravelMateCloud.deleteTrip(trip);
  readGate.resolve({ error: null, data: [cloudRow] });
  assert.equal(await loading, null);
  assert.equal(context.window.TravelMateCloud.getLocalTrips().length, 0);
});

test('a delayed full-sync response cannot resurrect a trip deleted while sync was pending', async () => {
  const trip = { id: 'deleted-sync', ownerId: 'user-1', country: 'Test', city: 'Local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  const listGate = deferred();
  const cloudRow = { user_id: 'user-1', id: 'deleted-sync', country: 'Test', city: 'Stale cloud', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'solo', days: 1, payload: { city: 'Stale cloud', updatedAt: '2026-01-03T00:00:00.000Z' }, updated_at: '2026-01-03T00:00:00.000Z' };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() {
      let deleting = false;
      const query = {
        select() { return query; }, order: () => listGate.promise,
        delete() { deleting = true; return query; }, eq() { return query; },
        maybeSingle: async () => ({ error: null, data: deleting ? { id: 'deleted-sync' } : null })
      };
      return query;
    }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const syncing = context.window.TravelMateCloud.syncLocalTrips();
  await new Promise(setImmediate);
  await context.window.TravelMateCloud.deleteTrip(trip);
  listGate.resolve({ error: null, data: [cloudRow] });
  assert.equal((await syncing).length, 0);
  assert.equal(context.window.TravelMateCloud.getLocalTrips().length, 0);
});

test('Realtime callbacks from user A are ignored after switching to user B', async () => {
  const tripB = { id: 'B-trip', ownerId: 'user-B', country: 'Test', city: 'B local', start: '2026-02-01', end: '2026-02-02', days: 1, updatedAt: '2026-02-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-A'], ['travelmate-trips', '[]']]);
  let currentUser = 'user-A';
  let tripUpdateHandler;
  const channel = { on(event, filter, handler) { if (filter.table === 'travel_trips') tripUpdateHandler = handler; return channel; }, subscribe: async () => {} };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    channel: () => channel,
    removeChannel() {}
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  let callbackCount = 0;
  await context.window.TravelMateCloud.subscribeToSharedTrip('owner-1', 'shared-trip', { onTripUpdate() { callbackCount += 1; } });
  currentUser = 'user-B';
  storage.set('travelmate-active-user', 'user-B');
  storage.set('travelmate-trips', JSON.stringify([tripB]));
  tripUpdateHandler({ new: { user_id: 'owner-1', id: 'shared-trip', country: 'Test', city: 'A remote', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'solo', days: 1, payload: { city: 'A remote', updatedAt: '2026-01-03T00:00:00.000Z' }, updated_at: '2026-01-03T00:00:00.000Z', updated_by: 'other-user' } });
  assert.equal(callbackCount, 0);
  assert.deepEqual(JSON.parse(storage.get('travelmate-trips')).map((trip) => trip.id), ['B-trip']);
});

test('a delayed Realtime update cannot resurrect a deleted trip', async () => {
  const trip = { id: 'deleted-realtime', ownerId: 'user-1', country: 'Test', city: 'Local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-01T00:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  let tripUpdateHandler;
  const channel = { on(event, filter, handler) { if (filter.table === 'travel_trips') tripUpdateHandler = handler; return channel; }, subscribe: async () => {} };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    channel: () => channel, removeChannel() {},
    from() { const query = { delete() { return query; }, eq() { return query; }, select() { return query; }, maybeSingle: async () => ({ error: null, data: { id: 'deleted-realtime' } }) }; return query; }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  let callbackCount = 0;
  await context.window.TravelMateCloud.subscribeToSharedTrip('user-1', trip.id, { onTripUpdate() { callbackCount += 1; } });
  await context.window.TravelMateCloud.deleteTrip(trip);
  tripUpdateHandler({ new: { user_id: 'user-1', id: trip.id, country: 'Test', city: 'Stale remote', start_date: '2026-01-01', end_date: '2026-01-02', budget: 0, trip_type: 'solo', days: 1, payload: { city: 'Stale remote', updatedAt: '2026-01-03T00:00:00.000Z' }, updated_at: '2026-01-03T00:00:00.000Z', updated_by: 'other-user' } });
  assert.equal(context.window.TravelMateCloud.getLocalTrips().length, 0);
  assert.equal(callbackCount, 0);
});

test('signed-out reconnect does not claim that a pending trip was synchronized', async () => {
  const pending = { id: 'local-only', country: 'Test', city: 'Local', start: '2026-01-01', end: '2026-01-02', days: 1, updatedAt: '2026-01-02T00:00:00.000Z', syncStatus: 'pending' };
  const storage = new Map([['travelmate-trips', JSON.stringify([pending])]]);
  const events = [];
  let onlineHandler;
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent(event) { events.push(event); }, addEventListener(type, handler) { if (type === 'online') onlineHandler = handler; } }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  onlineHandler();
  for (let index = 0; index < 3; index += 1) await new Promise(setImmediate);
  assert.equal(events.some((event) => event.type === 'travelmate:sync-restored'), false);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].syncStatus, 'pending');
});


test('sign out preserves unsynced trips in the signed-in user snapshot before clearing the active view', async () => {
  const trip = { id: 'pending-signout', ownerId: 'user-1', country: 'Test', city: 'Pending', start: '2026-01-01', end: '2026-01-02', days: 1, syncStatus: 'pending' };
  const storage = new Map([
    ['travelmate-active-user', 'user-1'],
    ['travelmate-trips', JSON.stringify([trip])]
  ]);
  const localStorageMock = {
    get length() { return storage.size; },
    key(index) { return Array.from(storage.keys())[index] || null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      signOut: async () => ({ error: null })
    }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: localStorageMock,
    sessionStorage: { removeItem() {} },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  await context.window.TravelMateCloud.signOut('local');
  assert.equal(storage.has('travelmate-active-user'), false);
  assert.deepEqual(JSON.parse(storage.get('travelmate-trips')), []);
  const snapshot = JSON.parse(storage.get('travelmate-trips-user:user-1'));
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].id, trip.id);
  assert.equal(snapshot[0].syncStatus, 'pending');
});

test('clear device data removes TravelMate local state and TravelMate caches but preserves unrelated cache entries', async () => {
  const storage = new Map([
    ['travelmate-active-user', 'user-1'],
    ['travelmate-trips', '[]'],
    ['travelmate-theme', 'dark'],
    ['unrelated-key', 'keep']
  ]);
  const removedSessionKeys = [];
  const deletedCaches = [];
  const localStorageMock = {
    get length() { return storage.size; },
    key(index) { return Array.from(storage.keys())[index] || null; },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: localStorageMock,
    sessionStorage: { removeItem(key) { removedSessionKeys.push(key); } },
    caches: {
      keys: async () => ['travelmate-smart-v145', 'travelmate-smart-v146', 'other-app-cache'],
      delete: async (name) => { deletedCaches.push(name); return true; }
    },
    window: { dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  const removed = await context.window.TravelMateCloud.clearDeviceData();
  assert.equal(removed, 3);
  assert.equal(storage.get('unrelated-key'), 'keep');
  assert.equal(Array.from(storage.keys()).some((key) => key.startsWith('travelmate-')), false);
  assert.deepEqual(removedSessionKeys, ['travelmate-pending-invite']);
  assert.deepEqual(deletedCaches.sort(), ['travelmate-smart-v145', 'travelmate-smart-v146']);
});
