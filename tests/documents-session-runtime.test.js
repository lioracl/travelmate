'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/document-vault.js', 'utf8');
function between(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const calls = { uploads: [], inserts: [], removes: [], statuses: [], renders: 0, journals: [], abandoned: [], deletes: [] };
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
      rpc: async (name, args) => {
        if (name === 'begin_document_upload') {
          if (args.p_expected_owner !== ctx.currentUser.id) return { error: new Error('DOCUMENT_SESSION_CHANGED') };
          const upload_id = '00000000-0000-4000-8000-' + String(calls.journals.length).padStart(12,'0');
          const row = { upload_id, user_id: ctx.currentUser.id, storage_path: ctx.currentUser.id + '/__lifecycle_v1/' + upload_id + '.vault', state: 'pending' };
          calls.journals.push(row); return { data: [row] };
        }
        calls.abandoned.push(args.p_upload_id);
        const row = calls.journals.find(j => j.upload_id === args.p_upload_id);
        if (row && !calls.inserts.some(d => d.storage_path === row.storage_path)) row.state = 'cleanup_requested';
        return {};
      },
      storage: { from: () => ({ upload: async path => { calls.uploads.push(path); return {}; }, remove: async paths => { calls.removes.push(...paths); return {}; } }) },
      from: () => ({ insert: async row => { calls.inserts.push(row); return {}; },
        select() { return this; }, eq() { return this; }, limit: async () => ({ data: [], error: null }),
        delete() { calls.deletes.push(ctx.currentUser.id); return this; }, then(resolve) { resolve({ data: [], error: null }); } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(between('function ownsStoragePath(', 'function clearRemoteDocumentMetadata(') + '\n' + between('async function saveFiles(', 'function downloadBlob(') + '\n' + between('async function deleteDocument(', 'function requestDocumentUpload('), ctx);
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
  assert.equal(calls.journals[0].user_id, 'A');
  assert.equal(calls.journals[0].state, 'cleanup_requested');
});
test('foreign journal response fails closed without constructing or deleting its path', async () => {
  const { ctx, calls } = fixture();
  ctx.client.rpc = async () => ({ data: [{ upload_id: 'synthetic', storage_path: 'B/__lifecycle_v1/synthetic.vault' }] });
  await ctx.saveFiles([file]); assert.equal(calls.uploads.length, 0); assert.equal(calls.removes.length, 0);
});
test('lost metadata success response never causes client deletion of a referenced blob', async () => {
  const { ctx, calls } = fixture();
  ctx.client.from = () => ({ insert: async row => { calls.inserts.push(row); throw new Error('lost reply'); } });
  await ctx.saveFiles([file]); assert.equal(calls.removes.length, 0); assert.equal(calls.journals[0].state, 'pending');
});
test('sign-out after upload cannot mutate metadata or the signed-out UI', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.client.storage.from = () => ({ upload: async path => { calls.uploads.push(path); return wait.promise; }, remove: async paths => { calls.removes.push(...paths); return {}; } });
  const pending = ctx.saveFiles([file]); await new Promise(r => setImmediate(r));
  ctx.currentUser = null; ctx.documentSessionEpoch++; const statusCount = calls.statuses.length;
  wait.resolve({}); await pending;
  assert.equal(calls.inserts.length, 0); assert.equal(calls.removes.length, 0);
  assert.equal(calls.statuses.length, statusCount);
  assert.equal(calls.journals[0].user_id, 'A'); assert.equal(calls.journals[0].state, 'pending');
  assert.equal(calls.abandoned.length, 0);
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
test('switch during metadata deletion cannot initiate any storage cleanup in B', async () => {
  const { ctx, calls } = fixture(), wait = deferred();
  ctx.client.from = () => ({ delete() { return this; }, eq() { return this; }, then(resolve) { wait.promise.then(resolve); } });
  const pending = ctx.deleteDocument({ id: 'id', user_id: 'A', storage_path: 'A/trip/file' });
  await new Promise(r => setImmediate(r)); ctx.currentUser = { id: 'B' }; ctx.documentSessionEpoch++;
  wait.resolve({}); await pending;
  assert.equal(calls.removes.length, 0); assert.equal(calls.journals.length, 0);
});
test('metadata deletion delegates durable retry to server without browser storage calls', async () => {
  const { ctx, calls } = fixture();
  ctx.client.storage.from = () => ({ remove: async () => { throw new Error('must never execute'); } });
  await ctx.deleteDocument({ id: 'id', user_id: 'A', storage_path: 'A/trip/file' });
  assert.deepEqual(calls.deletes, ['A']); assert.equal(calls.removes.length, 0);
  assert.match(calls.statuses.at(-1)[0], /בשרת/);
});
test('metadata error records abandonment and leaves grace-period cleanup to server', async () => {
  const { ctx, calls } = fixture();
  ctx.client.from = () => ({ insert: async () => ({ error: new Error('metadata denied') }), select() { return this; }, eq() { return this; }, limit: async () => ({ data: [] }) });
  await ctx.saveFiles([file]); assert.equal(calls.removes.length, 0);
  assert.equal(calls.journals[0].state, 'cleanup_requested'); assert.equal(ctx.uploadButton.disabled, false);
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
test('lost abandon request cannot erase the server journal or disable retry', async () => {
  const { ctx, calls } = fixture(), rpc = ctx.client.rpc;
  ctx.client.rpc = (name,args) => name === 'abandon_document_upload' ? Promise.reject(new Error('offline')) : rpc(name,args);
  ctx.client.from = () => ({ insert: async () => { throw new Error('offline'); } });
  await ctx.saveFiles([file]); assert.equal(calls.journals.length, 1);
  assert.equal(calls.journals[0].state, 'pending'); assert.equal(ctx.uploadButton.disabled, false);
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
