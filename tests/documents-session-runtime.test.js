'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/document-vault.js', 'utf8');
function between(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const calls = { uploads: [], inserts: [], removes: [], statuses: [], renders: 0 };
  const store = new Map();
  const ctx = {
    currentUser: { id: 'A' }, documentSessionEpoch: 1, uploadInProgress: false,
    MAX_FILE_SIZE: 25 * 1024 * 1024, tripId: 'trip', bucket: 'travel-documents',
    passphraseInput: { value: 'synthetic-passphrase' }, uploadButton: { disabled: false },
    input: { value: 'selected' }, form: { elements: { category: { value: 'personal' }, note: { value: '' } }, reset() {} },
    setStatus: (...args) => calls.statuses.push(args), console: { error() {} }, confirm: () => true,
    readSelectedFile: async () => new ArrayBuffer(1),
    encryptBytes: async () => ({ blob: { size: 17 }, salt: [], iv: [] }),
    sanitizeFileName: x => x, secureObjectId: () => 'uuid', bytesToBase64: () => '',
    storageErrorMessage: e => e.message, databaseErrorMessage: e => e.message,
    renderDocuments: async () => { calls.renders++; },
    requirePrivateStorageAccess: async () => ({ session: { user: ctx.currentUser } }),
    localStorage: { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
    client: {
      storage: { from: () => ({ upload: async path => { calls.uploads.push(path); return {}; }, remove: async paths => { calls.removes.push(...paths); return {}; } }) },
      from: () => ({ insert: async row => { calls.inserts.push(row); return {}; },
        select() { return this; }, eq() { return this; }, limit: async () => ({ data: [], error: null }),
        delete() { return this; }, then(resolve) { resolve({ data: [], error: null }); } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(between('function pendingCleanupKey(', 'function clearRemoteDocumentMetadata(') + '\n' + between('async function saveFiles(', 'function downloadBlob(') + '\n' + between('async function deleteDocument(', 'function requestDocumentUpload('), ctx);
  return { ctx, calls, store };
}
const file = { name: 'synthetic.txt', size: 1, type: 'text/plain' };
test('switch during file preparation cannot upload into the next account', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.readSelectedFile = () => wait.promise;
  const pending = ctx.saveFiles([file]);
  ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++; wait.resolve(new ArrayBuffer(1));
  await pending;
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.inserts.length, 0);
});
test('switch during encryption cannot start an upload', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.encryptBytes = () => wait.promise;
  const pending = ctx.saveFiles([file]);
  await new Promise(r => setImmediate(r));
  ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++;
  wait.resolve({ blob: { size: 17 }, salt: [], iv: [] }); await pending;
  assert.equal(calls.uploads.length, 0);
});
test('rejected metadata request retains owner-scoped cleanup', async () => {
  const { ctx, calls } = fixture();
  ctx.client.from = () => ({ insert: async () => { throw new Error('network'); }, select() { return this; }, eq() { return this; }, limit: async () => ({ error: new Error('offline') }) });
  await ctx.saveFiles([file]);
  assert.equal(calls.uploads.length, 1);
  assert.equal(ctx.readPendingCleanup('A').length, 1);
  assert.equal(ctx.readPendingCleanup('B').length, 0);
});
test('cleanup refuses another owner path and preserves additions during an in-flight remove', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.writePendingCleanup('A', ['A/trip/old', 'B/trip/private']);
  ctx.client.storage.from = () => ({ remove: async paths => { calls.removes.push(...paths); await wait.promise; return {}; } });
  const pending = ctx.flushPendingCleanup(); await new Promise(r => setImmediate(r));
  ctx.queuePendingCleanup('A', 'A/trip/new'); wait.resolve(); await pending;
  assert.deepEqual(calls.removes, ['A/trip/old']);
  assert.deepEqual(Array.from(ctx.readPendingCleanup('A')), ['A/trip/new']);
});
test('cleanup never removes a path still referenced by document metadata', async () => {
  const { ctx, calls } = fixture();
  ctx.queuePendingCleanup('A', 'A/trip/managed');
  ctx.client.from = () => ({ select() { return this; }, eq() { return this; }, limit: async () => ({ data: [{ id: 'existing' }] }) });
  await ctx.flushPendingCleanup(); assert.equal(calls.removes.length, 0);
});
test('sign-out after upload cannot mutate metadata or the signed-out UI', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.client.storage.from = () => ({ upload: async path => { calls.uploads.push(path); return wait.promise; }, remove: async paths => { calls.removes.push(...paths); return {}; } });
  const pending = ctx.saveFiles([file]); await new Promise(r => setImmediate(r));
  ctx.currentUser = null; ctx.documentSessionEpoch++; const statusCount = calls.statuses.length;
  wait.resolve({}); await pending;
  assert.equal(calls.inserts.length, 0); assert.equal(calls.removes.length, 0);
  assert.equal(calls.statuses.length, statusCount);
  assert.equal(ctx.readPendingCleanup('A').length, 1);
});
test('switch during metadata persistence preserves the managed file and next-account UI', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.client.from = () => ({ insert: async row => { calls.inserts.push(row); return wait.promise; } });
  const pending = ctx.saveFiles([file]); await new Promise(r => setImmediate(r));
  ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++; ctx.passphraseInput.value = 'B-passphrase';
  const statusCount = calls.statuses.length; wait.resolve({}); await pending;
  assert.equal(calls.inserts[0].user_id, 'A'); assert.equal(calls.removes.length, 0);
  assert.equal(ctx.passphraseInput.value, 'B-passphrase'); assert.equal(calls.statuses.length, statusCount);
});
test('switch during metadata deletion queues cleanup for the initiating owner only', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.client.from = () => ({ delete() { return this; }, eq() { return this; }, then(resolve) { wait.promise.then(resolve); } });
  const pending = ctx.deleteDocument({ id: 'id', user_id: 'A', storage_path: 'A/trip/file' });
  await new Promise(r => setImmediate(r)); ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++;
  wait.resolve({}); await pending;
  assert.equal(calls.removes.length, 0); assert.equal(ctx.readPendingCleanup('A').length, 1);
  assert.equal(ctx.readPendingCleanup('B').length, 0);
});
test('failed storage deletion remains queued and reconnect retry removes it', async () => {
  const { ctx, calls } = fixture(); let offline = true;
  ctx.client.storage.from = () => ({ remove: async paths => { calls.removes.push(...paths); if (offline) throw new Error('offline'); return {}; } });
  await ctx.deleteDocument({ id: 'id', user_id: 'A', storage_path: 'A/trip/file' });
  assert.equal(ctx.readPendingCleanup('A').length, 1);
  offline = false; await ctx.flushPendingCleanup(); assert.equal(ctx.readPendingCleanup('A').length, 0);
});
test('metadata error rolls back only an unreferenced uploaded blob', async () => {
  const { ctx, calls } = fixture();
  ctx.client.from = () => ({ insert: async () => ({ error: new Error('metadata denied') }), select() { return this; }, eq() { return this; }, limit: async () => ({ data: [] }) });
  await ctx.saveFiles([file]); assert.ok(calls.removes.length > 0);
  assert.equal(ctx.readPendingCleanup('A').length, 0); assert.equal(ctx.uploadButton.disabled, false);
});
test('capacity failure creates no metadata and leaves upload retry available', async () => {
  const { ctx, calls } = fixture();
  ctx.client.storage.from = () => ({ upload: async () => ({ error: new Error('quota exceeded') }), remove: async () => ({}) });
  await ctx.saveFiles([file]); assert.equal(calls.inserts.length, 0);
  assert.equal(ctx.uploadButton.disabled, false); assert.equal(ctx.input.value, 'selected');
});
test('plaintext size reserves the authentication tag inside the existing bucket limit', async () => {
  const { ctx, calls } = fixture();
  await ctx.saveFiles([{ ...file, size: ctx.MAX_FILE_SIZE }]); assert.equal(calls.uploads.length, 0);
  await ctx.saveFiles([{ ...file, size: ctx.MAX_FILE_SIZE - 16 }]); assert.equal(calls.uploads.length, 1);
});
test('duplicate submit while file preparation is pending cannot duplicate an upload', async () => {
  const { ctx, calls } = fixture(), wait = deferred(); ctx.readSelectedFile = () => wait.promise;
  const pending = ctx.saveFiles([file]); await ctx.saveFiles([file]); wait.resolve(new ArrayBuffer(1)); await pending;
  assert.equal(calls.uploads.length, 1);
});
test('access resolved for another account cannot rebind the initiating operation', async () => {
  const { ctx, calls } = fixture(); ctx.requirePrivateStorageAccess = async () => ({ session: { user: { id: 'B' } } });
  await ctx.saveFiles([file]); assert.equal(calls.uploads.length, 0); assert.equal(ctx.currentUser.id, 'A');
});
test('cleanup transport completion after switch only changes the original owner queue', async () => {
  const { ctx } = fixture(), wait = deferred();
  ctx.queuePendingCleanup('A', 'A/trip/file'); ctx.queuePendingCleanup('B', 'B/trip/private');
  ctx.client.storage.from = () => ({ remove: () => wait.promise });
  const pending = ctx.flushPendingCleanup(); await new Promise(r => setImmediate(r));
  ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++; wait.resolve({}); await pending;
  assert.equal(ctx.readPendingCleanup('A').length, 1); assert.equal(ctx.readPendingCleanup('B').length, 1);
});
test('foreign metadata records and traversal paths never reach delete', async () => {
  const { ctx, calls } = fixture();
  for (const record of [{ id: 'other', user_id: 'B', storage_path: 'B/trip/file' }, { id: 'bad', user_id: 'A', storage_path: 'A/../B/file' }]) await ctx.deleteDocument(record);
  assert.equal(calls.removes.length, 0); assert.equal(calls.statuses.length, 0);
});
test('late download completion cannot preview or download an earlier account document', async () => {
  const { ctx } = fixture(), wait = deferred(); let opened = 0;
  ctx.client.storage.from = () => ({ download: () => wait.promise });
  ctx.base64ToBytes = () => []; ctx.decryptBlob = async () => ({});
  ctx.downloadBlob = () => { opened++; }; ctx.showDocumentPreview = async () => { opened++; };
  const pending = ctx.openDocument({ user_id: 'A', storage_path: 'A/trip/file' }, false);
  await new Promise(r => setImmediate(r)); ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++;
  wait.resolve({ data: {} }); await pending; assert.equal(opened, 0);
});
test('late initial session lookup cannot override a newer auth event', async () => {
  const wait = deferred(), sessions = [];
  const ctx = { client: { auth: { onAuthStateChange: fn => { ctx.callback = fn; }, getSession: () => wait.promise } }, window: { addEventListener() {} }, applySession: async session => { sessions.push(session.user.id); } };
  vm.createContext(ctx);
  const start = source.indexOf('var authEventVersion = 0;');
  const code = source.slice(start, source.indexOf('\n  }', start));
  const pending = vm.runInContext('(async function () {' + code + '})()', ctx);
  ctx.callback('SIGNED_IN', { user: { id: 'B' } }); wait.resolve({ data: { session: { user: { id: 'A' } } } }); await pending;
  assert.deepEqual(sessions, ['B']);
});
