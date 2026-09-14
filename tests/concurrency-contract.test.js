const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260913190000_trip_revision_and_tombstones.sql');

function revisionServer(initial) {
  let row = initial ? structuredClone(initial) : null;
  return {
    read: () => row && structuredClone(row),
    save({ expectedRevision, expectedUpdatedAt, mutationId, payload }) {
      if (!row) {
        if ((expectedRevision || 0) !== 0 || expectedUpdatedAt) return { status: 'conflict' };
        row = { revision: 1, updatedAt: 'server-1', deletedAt: null, lastMutationId: mutationId, payload: structuredClone(payload) };
        return { status: 'saved', revision: 1, updatedAt: row.updatedAt };
      }
      if (row.lastMutationId === mutationId) return { status: row.deletedAt ? 'deleted' : 'saved', revision: row.revision, updatedAt: row.updatedAt };
      if (row.deletedAt) return { status: 'deleted', revision: row.revision };
      const matches = expectedRevision != null ? expectedRevision === row.revision : expectedUpdatedAt === row.updatedAt;
      if (!matches) return { status: 'conflict', revision: row.revision, updatedAt: row.updatedAt };
      row.revision += 1;
      row.updatedAt = `server-${row.revision}`;
      row.lastMutationId = mutationId;
      row.payload = structuredClone(payload);
      return { status: 'saved', revision: row.revision, updatedAt: row.updatedAt };
    },
    delete({ expectedRevision, mutationId }) {
      if (!row) return { status: 'not_found' };
      if (row.lastMutationId === mutationId && row.deletedAt) return { status: 'deleted', revision: row.revision };
      if (row.deletedAt) return { status: 'deleted', revision: row.revision };
      if (expectedRevision !== row.revision) return { status: 'conflict', revision: row.revision };
      row.revision += 1;
      row.updatedAt = `server-${row.revision}`;
      row.deletedAt = row.updatedAt;
      row.lastMutationId = mutationId;
      return { status: 'deleted', revision: row.revision };
    }
  };
}

test('same-field concurrent edits reject the stale second writer', () => {
  const server = revisionServer({ revision: 10, updatedAt: 'server-10', deletedAt: null, payload: { city: 'Base' } });
  assert.equal(server.save({ expectedRevision: 10, mutationId: 'A', payload: { city: 'A' } }).status, 'saved');
  const stale = server.save({ expectedRevision: 10, mutationId: 'B', payload: { city: 'B' } });
  assert.equal(stale.status, 'conflict');
  assert.equal(server.read().payload.city, 'A');
  assert.equal(server.read().revision, 11);
});

test('unrelated-field concurrent edits surface a conflict instead of silently dropping a field', () => {
  const server = revisionServer({ revision: 10, updatedAt: 'server-10', deletedAt: null, payload: { city: 'Base', budget: 100 } });
  server.save({ expectedRevision: 10, mutationId: 'A', payload: { city: 'Changed', budget: 100 } });
  const stale = server.save({ expectedRevision: 10, mutationId: 'B', payload: { city: 'Base', budget: 200 } });
  assert.equal(stale.status, 'conflict');
  assert.deepEqual(server.read().payload, { city: 'Changed', budget: 100 });
});

test('an offline stale device cannot overwrite the newer server revision', () => {
  const server = revisionServer({ revision: 4, updatedAt: 'server-4', deletedAt: null, payload: { note: 'base' } });
  server.save({ expectedRevision: 4, mutationId: 'online-device', payload: { note: 'new online' } });
  const offline = server.save({ expectedRevision: 4, mutationId: 'offline-device', payload: { note: 'old offline' } });
  assert.equal(offline.status, 'conflict');
  assert.equal(server.read().payload.note, 'new online');
});

test('retrying an ambiguously acknowledged mutation is idempotent', () => {
  const server = revisionServer({ revision: 10, updatedAt: 'server-10', deletedAt: null, payload: { city: 'Base' } });
  const first = server.save({ expectedRevision: 10, mutationId: 'same-mutation', payload: { city: 'Accepted' } });
  const retry = server.save({ expectedRevision: 10, mutationId: 'same-mutation', payload: { city: 'Accepted' } });
  assert.equal(first.status, 'saved');
  assert.equal(retry.status, 'saved');
  assert.equal(retry.revision, 11);
  assert.equal(server.read().revision, 11);
});

test('retrying an old mutation after an intervening write reports conflict without reverting state', () => {
  const server = revisionServer({ revision: 10, updatedAt: 'server-10', deletedAt: null, payload: { city: 'Base' } });
  assert.equal(server.save({ expectedRevision: 10, mutationId: 'mutation-A', payload: { city: 'A' } }).status, 'saved');
  assert.equal(server.save({ expectedRevision: 11, mutationId: 'mutation-B', payload: { city: 'B' } }).status, 'saved');
  const retry = server.save({ expectedRevision: 10, mutationId: 'mutation-A', payload: { city: 'A' } });
  assert.equal(retry.status, 'conflict');
  assert.equal(server.read().revision, 12);
  assert.equal(server.read().payload.city, 'B');
});

test('a persistent deletion revision rejects a stale device save', () => {
  const server = revisionServer({ revision: 8, updatedAt: 'server-8', deletedAt: null, payload: { city: 'Delete me' } });
  assert.equal(server.delete({ expectedRevision: 8, mutationId: 'delete-1' }).status, 'deleted');
  const stale = server.save({ expectedRevision: 8, mutationId: 'stale-save', payload: { city: 'Resurrected' } });
  assert.equal(stale.status, 'deleted');
  assert.equal(server.read().deletedAt, 'server-9');
});

test('legacy records without revision metadata can use an exact server timestamp once', () => {
  const server = revisionServer({ revision: 1, updatedAt: 'legacy-server-time', deletedAt: null, payload: { city: 'Legacy' } });
  const saved = server.save({ expectedRevision: null, expectedUpdatedAt: 'legacy-server-time', mutationId: 'migration-save', payload: { city: 'Migrated' } });
  assert.equal(saved.status, 'saved');
  assert.equal(saved.revision, 2);
  assert.equal(server.read().payload.city, 'Migrated');
});

test('migration defines atomic revision, idempotency, tombstone, MFA and safe direct-write boundaries', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /revision bigint not null default 1/);
  assert.match(sql, /deleted_at timestamptz/);
  assert.match(sql, /last_mutation_id uuid/);
  assert.match(sql, /for update;/i);
  assert.match(sql, /p_expected_revision <> current_trip\.revision/);
  assert.match(sql, /current_trip\.last_mutation_id = p_mutation_id/);
  assert.match(sql, /public\.mfa_satisfied_if_enrolled\(\)/);
  assert.match(sql, /public\.can_edit_trip\(p_owner_id, p_trip_id\)/);
  assert.match(sql, /actor_id <> p_owner_id/);
  assert.match(sql, /deleted_at is null and public\.is_trip_member/);
  assert.match(sql, /revoke all on table public\.travel_trips from authenticated/);
  assert.match(sql, /function public\.list_travel_trip_tombstones\(\)/);
  assert.match(sql, /grant execute on function public\.list_travel_trip_tombstones\(\) to authenticated/);
  assert.match(sql, /revoke all on function public\.add_trip_owner_member\(\) from public, anon, authenticated/);
});

test('client timeout releases the queue and retries with the same mutation id', async () => {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', '[]']]);
  const mutations = [];
  let calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc(name, params) {
      assert.equal(name, 'save_travel_trip');
      calls += 1;
      mutations.push(params.p_mutation_id);
      if (calls === 1) return new Promise(() => {});
      return Promise.resolve({ error: null, data: [{ result_status: 'saved', result_revision: 1, result_updated_at: '2026-09-13T12:00:00.000Z', result_deleted_at: null }] });
    }
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { TRAVELMATE_CLOUD_WRITE_TIMEOUT_MS: 5, crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' }, __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  const source = fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8').replace('  window.TravelMateCloud = {', '  window.__phase16SaveChains = saveChains;\n  window.TravelMateCloud = {');
  vm.runInNewContext(source, context);
  await assert.rejects(context.window.TravelMateCloud.saveTrip({ id: 'timeout-trip', ownerId: 'user-1', country: 'Test', city: 'Timeout', start: '2026-01-01', end: '2026-01-02', days: 1 }), (error) => error && error.code === 'TRIP_WRITE_TIMEOUT');
  await new Promise(setImmediate);
  assert.equal(context.window.__phase16SaveChains.size, 0);
  const failed = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(failed.syncStatus, 'unknown');
  await context.window.TravelMateCloud.saveTrip(failed, 'user-1', true);
  assert.equal(mutations[1], mutations[0]);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].syncStatus, 'synced');
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].cloudRevision, 1);
});

test('client sends the legacy cloud timestamp when a hydrated trip lacks a revision', async () => {
  const legacy = { id: 'legacy-trip', ownerId: 'user-1', country: 'Test', city: 'Legacy', start: '2026-01-01', end: '2026-01-02', days: 1, cloudUpdatedAt: '2026-09-12T10:00:00.000Z' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([legacy])]]);
  let rpcParams;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc(name, params) { rpcParams = params; return Promise.resolve({ error: null, data: [{ result_status: 'saved', result_revision: 2, result_updated_at: '2026-09-13T12:00:00.000Z' }] }); }
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { crypto: { randomUUID: () => '22222222-2222-4222-8222-222222222222' }, __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  await context.window.TravelMateCloud.saveTrip(legacy);
  assert.equal(rpcParams.p_expected_revision, null);
  assert.equal(rpcParams.p_expected_updated_at, legacy.cloudUpdatedAt);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].cloudRevision, 2);
});

test('client records a server revision conflict without marking the stale payload synced', async () => {
  const trip = { id: 'conflict-trip', ownerId: 'user-1', country: 'Test', city: 'Stale', start: '2026-01-01', end: '2026-01-02', days: 1, cloudRevision: 10 };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc: async () => ({ error: null, data: [{ result_status: 'conflict', result_revision: 11, result_updated_at: '2026-09-13T12:00:00.000Z' }] })
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { crypto: { randomUUID: () => '33333333-3333-4333-8333-333333333333' }, __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  await assert.rejects(context.window.TravelMateCloud.saveTrip(trip), (error) => error && error.code === 'TRIP_CONFLICT');
  const stored = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(stored.syncStatus, 'conflict');
  assert.equal(stored.cloudRevision, 11);
  assert.notEqual(stored.syncStatus, 'synced');
});

test('an ambiguous delete survives restart and retries with the same mutation id', async () => {
  const trip = { id: 'delete-retry', ownerId: 'user-1', country: 'Test', city: 'Delete', start: '2026-01-01', end: '2026-01-02', days: 1, cloudRevision: 5 };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  const firstMutations = [];
  const firstClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc(name, params) { assert.equal(name, 'delete_travel_trip'); firstMutations.push(params.p_mutation_id); return new Promise(() => {}); }
  };
  const localStorageMock = () => ({ getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) });
  const firstContext = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: localStorageMock(), window: { TRAVELMATE_CLOUD_WRITE_TIMEOUT_MS: 5, crypto: { randomUUID: () => '44444444-4444-4444-8444-444444444444' }, __travelMateSupabaseClient: firstClient, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), firstContext);
  await assert.rejects(firstContext.window.TravelMateCloud.deleteTrip(trip), (error) => error && error.code === 'TRIP_WRITE_TIMEOUT');
  await new Promise(setImmediate);
  const persisted = JSON.parse(storage.get('travelmate-trips'))[0];
  assert.equal(persisted.deletePending, true);
  assert.equal(persisted.syncStatus, 'unknown');

  let onlineHandler;
  const secondMutations = [];
  const secondClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { const query = { select() { return query; }, order: async () => ({ error: null, data: [] }) }; return query; },
    rpc(name, params) {
      if (name === 'list_travel_trip_tombstones') return Promise.resolve({ error: null, data: [] });
      assert.equal(name, 'delete_travel_trip');
      secondMutations.push(params.p_mutation_id);
      return Promise.resolve({ error: null, data: [{ result_status: 'deleted', result_revision: 6, result_updated_at: '2026-09-13T12:00:00.000Z', result_deleted_at: '2026-09-13T12:00:00.000Z' }] });
    }
  };
  const secondContext = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: localStorageMock(), window: { crypto: { randomUUID: () => '55555555-5555-4555-8555-555555555555' }, __travelMateSupabaseClient: secondClient, dispatchEvent() {}, addEventListener(type, handler) { if (type === 'online') onlineHandler = handler; } }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), secondContext);
  onlineHandler();
  for (let index = 0; index < 5; index += 1) await new Promise(setImmediate);
  assert.equal(secondMutations[0], firstMutations[0]);
  assert.equal(JSON.parse(storage.get('travelmate-trips')).length, 0);
});

test('full sync removes a stale local trip when the server reports a persistent tombstone', async () => {
  const stale = { id: 'server-deleted', ownerId: 'user-1', country: 'Test', city: 'Stale', start: '2026-01-01', end: '2026-01-02', days: 1, cloudRevision: 8, syncStatus: 'failed', syncMutationId: '66666666-6666-4666-8666-666666666666' };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([stale])]]);
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from() { const query = { select() { return query; }, order: async () => ({ error: null, data: [] }) }; return query; },
    rpc: async () => ({ error: null, data: [{ result_status: 'deleted', result_revision: 9, result_updated_at: '2026-09-13T12:00:00.000Z', result_deleted_at: '2026-09-13T12:00:00.000Z' }] })
  };
  const context = { console, setTimeout, clearTimeout, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }, localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} }, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  assert.equal((await context.window.TravelMateCloud.syncLocalTrips()).length, 0);
  assert.equal(JSON.parse(storage.get('travelmate-trips')).length, 0);
});

function clientContext(client, trips) {
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify(trips || [])]]);
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { crypto: { randomUUID: () => '77777777-7777-4777-8777-777777777777' }, __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/cloud-sync.js'), 'utf8'), context);
  return { context, storage };
}

test('only a PGRST202 diagnostic naming the requested missing RPC permits legacy fallback', async () => {
  let directWrites = 0;
  const trip = { id: 'fallback-trip', ownerId: 'user-1', country: 'Test', city: 'Fallback', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc: async () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.save_travel_trip(p_owner_id, p_trip_id) in the schema cache' } }),
    from() { directWrites += 1; return { upsert: async () => ({ error: null }) }; }
  };
  const { context } = clientContext(client, []);
  await context.window.TravelMateCloud.saveTrip(trip);
  assert.equal(directWrites, 1);
});

test('RPC permission, network, malformed, server and unrelated PGRST202 errors never use legacy writes', async () => {
  const errors = [
    { code: '42501', message: 'permission denied' },
    { code: 'PGRST202', message: 'Could not find the function public.unrelated_function() in the schema cache' },
    { code: 'PGRST204', message: 'malformed arguments' },
    { code: '08006', message: 'network failure' },
    { code: 'XX000', message: 'internal server error' },
    { status: 503, message: 'service unavailable' }
  ];
  for (const rpcError of errors) {
    let directWrites = 0;
    const trip = { id: `blocked-${rpcError.code || rpcError.status}`, ownerId: 'user-1', country: 'Test', city: 'Blocked', start: '2026-01-01', end: '2026-01-02', days: 1 };
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
      rpc: async () => ({ error: rpcError }),
      from() { directWrites += 1; throw new Error('legacy path must not run'); }
    };
    const { context } = clientContext(client, []);
    await assert.rejects(context.window.TravelMateCloud.saveTrip(trip));
    assert.equal(directWrites, 0);
  }
});

test('full sync discovers a tombstone and removes stale local data without attempting a save', async () => {
  const stale = { id: 'deleted-without-write', ownerId: 'user-1', country: 'Test', city: 'Stale', start: '2026-01-01', end: '2026-01-02', days: 1, cloudRevision: 4, syncStatus: 'synced' };
  let mutationCalls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from(table) {
      assert.equal(table, 'travel_trips');
      const query = { select() { return query; }, order: async () => ({ error: null, data: [] }) };
      return query;
    },
    rpc: async (name) => {
      if (name === 'list_travel_trip_tombstones') return { error: null, data: [{ owner_id: 'user-1', trip_id: stale.id, revision: 5, deleted_at: '2026-09-13T12:00:00.000Z' }] };
      mutationCalls += 1;
      return { error: null, data: [] };
    }
  };
  const { context, storage } = clientContext(client, [stale]);
  assert.equal((await context.window.TravelMateCloud.syncLocalTrips()).length, 0);
  assert.equal(JSON.parse(storage.get('travelmate-trips')).length, 0);
  assert.equal(mutationCalls, 0);
});

test('legacy transition sends the exact hydrated PostgreSQL timestamp without JavaScript normalization', async () => {
  const timestamp = '2026-09-13T12:34:56.123456+00:00';
  let sent;
  const trip = { id: 'microseconds', ownerId: 'user-1', country: 'Test', city: 'Legacy', start: '2026-01-01', end: '2026-01-02', days: 1, cloudUpdatedAt: timestamp };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    rpc: async (name, params) => { sent = params.p_expected_updated_at; return { error: null, data: [{ result_status: 'saved', result_revision: 2, result_updated_at: timestamp }] }; }
  };
  const { context } = clientContext(client, [trip]);
  await context.window.TravelMateCloud.saveTrip(trip);
  assert.equal(sent, timestamp);
});

test('historical direct-write client retains its local edit when migration revokes cloud mutation', async () => {
  const historicalSource = execFileSync('git', ['show', '594c17e:assets/cloud-sync.js'], { cwd: root, encoding: 'utf8' });
  const trip = { id: 'old-client', ownerId: 'user-1', country: 'Test', city: 'Local edit', start: '2026-01-01', end: '2026-01-02', days: 1 };
  const storage = new Map([['travelmate-active-user', 'user-1'], ['travelmate-trips', JSON.stringify([trip])]]);
  let writeCalls = 0;
  const query = {
    upsert: async () => { writeCalls += 1; return { error: { code: '42501', message: 'permission denied for table travel_trips' } }; }
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
    from: () => query
  };
  const context = {
    console, setTimeout, clearTimeout,
    CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; },
    localStorage: { getItem: (key) => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    window: { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} },
    document: {}
  };
  vm.runInNewContext(historicalSource, context);
  await assert.rejects(context.window.TravelMateCloud.saveTrip(trip), (error) => error && error.code === '42501');
  assert.equal(writeCalls, 1);
  assert.equal(JSON.parse(storage.get('travelmate-trips'))[0].city, 'Local edit');
});
