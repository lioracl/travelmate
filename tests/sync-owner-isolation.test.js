const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function runtime(client, trips) {
  const storage = new Map([
    ['travelmate-active-user', 'user-1'],
    ['travelmate-trips', JSON.stringify(trips || [])]
  ]);
  const context = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    window: {
      crypto: { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      __travelMateSupabaseClient: client,
      dispatchEvent() {},
      addEventListener() {}
    },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  return { context, storage };
}

test('deleting one owner trip does not suppress a shared trip with the same id', async () => {
  const own = { id: 'same-id', ownerId: 'user-1', country: 'A', city: 'Own', start: '2026-01-01', end: '2026-01-02', days: 1, cloudRevision: 1 };
  const shared = { id: 'same-id', ownerId: 'owner-2', country: 'B', city: 'Shared', start: '2026-02-01', end: '2026-02-02', days: 1, cloudRevision: 4 };
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc(name, params) {
      calls.push({ name, params });
      if (name === 'delete_travel_trip') return Promise.resolve({ error: null, data: [{ result_status: 'deleted', result_revision: 2, result_updated_at: '2026-09-21T12:00:00.000Z', result_deleted_at: '2026-09-21T12:00:00.000Z' }] });
      if (name === 'save_travel_trip') return Promise.resolve({ error: null, data: [{ result_status: 'saved', result_revision: 5, result_updated_at: '2026-09-21T12:01:00.000Z', result_deleted_at: null }] });
      throw new Error('Unexpected RPC: ' + name);
    }
  };
  const { context } = runtime(client, [own, shared]);
  await context.window.TravelMateCloud.deleteTrip(own);
  const result = await context.window.TravelMateCloud.saveTrip(shared, 'user-1');
  assert.equal(result.saved, true);
  const save = calls.find((call) => call.name === 'save_travel_trip');
  assert.ok(save);
  assert.equal(save.params.p_owner_id, 'owner-2');
});

test('debounced saves for equal trip ids stay isolated by owner', async () => {
  const first = { id: 'same-id', ownerId: 'user-1', country: 'A', city: 'Own', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const second = { id: 'same-id', ownerId: 'owner-2', country: 'B', city: 'Shared', start: '2026-02-01', end: '2026-02-02', days: 1 };
  const owners = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc(name, params) {
      if (name !== 'save_travel_trip') throw new Error('Unexpected RPC: ' + name);
      owners.push(params.p_owner_id);
      return Promise.resolve({ error: null, data: [{ result_status: 'saved', result_revision: 1, result_updated_at: '2026-09-21T12:02:00.000Z', result_deleted_at: null }] });
    }
  };
  const { context } = runtime(client, [first, second]);
  context.window.TravelMateCloud.queueTripSave(first, 2);
  context.window.TravelMateCloud.queueTripSave(second, 2);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(owners.sort(), ['owner-2', 'user-1']);
});


test('an in-flight save from user A does not block user B with the same trip id', async () => {
  const tripA = { id: 'same-id', ownerId: 'user-A', country: 'A', city: 'A edit', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const tripB = { id: 'same-id', ownerId: 'user-B', country: 'B', city: 'B edit', start: '2026-02-01', end: '2026-02-02', days: 1 };
  const storage = new Map([
    ['travelmate-active-user', 'user-A'],
    ['travelmate-trips', JSON.stringify([tripA])],
    ['travelmate-trips-user:user-A', JSON.stringify([tripA])],
    ['travelmate-trips-user:user-B', JSON.stringify([tripB])]
  ]);
  let currentUser = 'user-A';
  let resolveA;
  let resolveB;
  let callsA = 0;
  let callsB = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: currentUser } } } }) },
    rpc(name, params) {
      assert.equal(name, 'save_travel_trip');
      if (params.p_owner_id === 'user-A') {
        callsA += 1;
        return new Promise((resolve) => { resolveA = resolve; });
      }
      if (params.p_owner_id === 'user-B') {
        callsB += 1;
        return new Promise((resolve) => { resolveB = resolve; });
      }
      throw new Error('Unexpected owner');
    }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    window: {
      crypto: { randomUUID: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      __travelMateSupabaseClient: client,
      dispatchEvent() {},
      addEventListener() {}
    },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);

  const saveA = context.window.TravelMateCloud.saveTrip(tripA, 'user-A');
  await new Promise(setImmediate);
  assert.equal(callsA, 1);

  storage.set('travelmate-trips-user:user-A', storage.get('travelmate-trips'));
  currentUser = 'user-B';
  storage.set('travelmate-active-user', 'user-B');
  storage.set('travelmate-trips', JSON.stringify([tripB]));

  const saveB = context.window.TravelMateCloud.saveTrip(tripB, 'user-B');
  await new Promise(setImmediate);
  assert.equal(callsB, 1, 'user B should start without waiting for user A');

  resolveB({ error: null, data: [{ result_status: 'saved', result_revision: 1, result_updated_at: '2026-09-21T13:30:00.000Z', result_deleted_at: null }] });
  await saveB;

  resolveA({ error: null, data: [{ result_status: 'saved', result_revision: 1, result_updated_at: '2026-09-21T13:31:00.000Z', result_deleted_at: null }] });
  await assert.rejects(saveA, (error) => error && error.code === 'AUTH_CONTEXT_CHANGED');

  const current = JSON.parse(storage.get('travelmate-trips'));
  assert.equal(current.length, 1);
  assert.equal(current[0].ownerId, 'user-B');
  assert.equal(current[0].city, 'B edit');
});
