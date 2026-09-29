'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets', 'cloud-sync.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  let brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

function bootBoundary() {
  const context = {};
  vm.runInNewContext(
    functionSource('cloneTrip') + '\n' +
    functionSource('stripTransientSyncState') + '\n' +
    functionSource('tripForCloud') + '\n' +
    functionSource('fromRow') + '\n' +
    'api = { tripForCloud, fromRow };',
    context
  );
  return context.api;
}

test('outbound cloud payload strips only local sync/delete control state', () => {
  const api = bootBoundary();
  const trip = {
    id: 'trip-1',
    ownerId: 'owner-1',
    city: 'Prague',
    syncStatus: 'pending',
    syncMutationId: 'mutation-1',
    syncConflict: { serverRevision: 7 },
    deletePending: true,
    deleteMutationId: 'delete-1',
    activities: [{ id: 'a1', title: 'Museum' }],
    savedPlaces: [{ id: 'p1', name: 'Cafe' }],
    expenses: [{ id: 'e1', amount: 20, currency: 'CZK' }],
    budgetUnlimited: true,
    budgetCategories: [{ id: 'food', name: 'אוכל', amount: 100 }],
    memories: [{ id: 'm1', note: 'Great day' }]
  };

  const payload = api.tripForCloud(trip);

  for (const key of ['syncStatus', 'syncMutationId', 'syncConflict', 'deletePending', 'deleteMutationId']) {
    assert.equal(Object.hasOwn(payload, key), false, key + ' must stay device-local');
  }
  assert.equal(JSON.stringify(payload.activities), JSON.stringify(trip.activities));
  assert.equal(JSON.stringify(payload.savedPlaces), JSON.stringify(trip.savedPlaces));
  assert.equal(JSON.stringify(payload.expenses), JSON.stringify(trip.expenses));
  assert.equal(payload.budgetUnlimited, true);
  assert.equal(JSON.stringify(payload.budgetCategories), JSON.stringify(trip.budgetCategories));
  assert.equal(JSON.stringify(payload.memories), JSON.stringify(trip.memories));
  assert.equal(trip.deletePending, true, 'sanitizing must not mutate the live local trip');
});

test('inbound cloud hydration ignores legacy polluted transient metadata', () => {
  const api = bootBoundary();
  const row = {
    id: 'trip-1',
    user_id: 'owner-1',
    country: 'Czechia',
    city: 'Prague',
    start_date: '2026-08-26',
    end_date: '2026-09-04',
    budget: 1500,
    trip_type: 'סולו',
    days: 10,
    updated_at: '2026-09-29T12:00:00.000Z',
    revision: 8,
    deleted_at: null,
    payload: {
      syncStatus: 'conflict',
      syncMutationId: 'old-write',
      syncConflict: { serverRevision: 99 },
      deletePending: true,
      deleteMutationId: 'old-delete',
      activities: [{ id: 'a1' }],
      savedPlaces: [{ id: 'p1' }],
      expenses: [{ id: 'e1', amount: 5 }],
      budgetUnlimited: true
    }
  };

  const trip = api.fromRow(row);

  assert.equal(trip.syncStatus, 'synced');
  assert.equal(trip.cloudRevision, 8);
  assert.equal(trip.deletePending, undefined);
  assert.equal(trip.deleteMutationId, undefined);
  assert.equal(trip.syncMutationId, undefined);
  assert.equal(trip.syncConflict, undefined);
  assert.equal(trip.city, 'Prague');
  assert.equal(trip.budget, 1500);
  assert.deepEqual(trip.activities, [{ id: 'a1' }]);
  assert.deepEqual(trip.savedPlaces, [{ id: 'p1' }]);
  assert.deepEqual(trip.expenses, [{ id: 'e1', amount: 5 }]);
  assert.equal(trip.budgetUnlimited, true);
});

test('canonical row columns override stale copies inside payload', () => {
  const api = bootBoundary();
  const trip = api.fromRow({
    id: 'canonical-id',
    user_id: 'owner-2',
    country: 'Japan',
    city: 'Tokyo',
    start_date: '2027-01-01',
    end_date: '2027-01-05',
    budget: 900,
    trip_type: 'זוגי',
    days: 5,
    updated_at: '2026-09-29T13:00:00.000Z',
    revision: 3,
    deleted_at: null,
    payload: { id: 'stale-id', city: 'Old City', budget: 1, days: 99, cloudRevision: 2 }
  });
  assert.equal(trip.id, 'canonical-id');
  assert.equal(trip.city, 'Tokyo');
  assert.equal(trip.budget, 900);
  assert.equal(trip.days, 5);
  assert.equal(trip.cloudRevision, 3);
});
