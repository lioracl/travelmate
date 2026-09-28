const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/cloud-sync.js'), 'utf8');
const start = source.indexOf('  function tripIdentity');
const end = source.indexOf('\n  function activateUserStorage', start);

function merge(left, right) {
  const context = { Date, Math, Map, Array };
  vm.runInNewContext(source.slice(start, end), context);
  return context.mergeTripLists([[left], [right]], 'owner-1')[0];
}

test('documents the current whole-payload last-write-wins conflict limitation', () => {
  const deviceA = { id: 'trip', ownerId: 'owner-1', city: 'City edited on A', budget: 100, updatedAt: '2026-09-13T10:00:00.000Z' };
  const deviceB = { id: 'trip', ownerId: 'owner-1', city: 'Original city', budget: 200, updatedAt: '2026-09-13T10:01:00.000Z' };
  const winner = merge(deviceA, deviceB);
  assert.equal(winner.budget, 200);
  assert.equal(winner.city, 'Original city', 'Device A field edit is lost because payloads are not field-merged');
});

test('documents that client clock skew can choose an older real-world edit', () => {
  const newerRealEdit = { id: 'trip', ownerId: 'owner-1', city: 'Actually newer', updatedAt: '2026-09-13T10:00:00.000Z' };
  const olderEditWithFastClock = { id: 'trip', ownerId: 'owner-1', city: 'Actually older', updatedAt: '2026-09-13T11:00:00.000Z' };
  assert.equal(merge(newerRealEdit, olderEditWithFastClock).city, 'Actually older');
});

test('server revision outranks a faster client clock for synchronized copies', () => {
  const fastClockOldRevision = { id: 'trip', ownerId: 'owner-1', city: 'Old revision', cloudRevision: 8, syncStatus: 'synced', updatedAt: '2026-09-13T12:00:00.000Z' };
  const slowerClockNewRevision = { id: 'trip', ownerId: 'owner-1', city: 'New revision', cloudRevision: 9, syncStatus: 'synced', updatedAt: '2026-09-13T10:00:00.000Z' };
  assert.equal(merge(fastClockOldRevision, slowerClockNewRevision).city, 'New revision');
});

test('an unsynced local copy is preserved until server revision arbitration', () => {
  const localEdit = { id: 'trip', ownerId: 'owner-1', city: 'Local edit', cloudRevision: 8, syncStatus: 'failed', syncMutationId: 'mutation-local', updatedAt: '2026-09-13T09:00:00.000Z' };
  const newerCloudSnapshot = { id: 'trip', ownerId: 'owner-1', city: 'Cloud edit', cloudRevision: 9, syncStatus: 'synced', updatedAt: '2026-09-13T11:00:00.000Z' };
  const winner = merge(localEdit, newerCloudSnapshot);
  assert.equal(winner.city, 'Local edit');
  assert.equal(winner.syncStatus, 'failed');
});
