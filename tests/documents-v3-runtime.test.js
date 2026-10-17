'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/document-vault.js', 'utf8');
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
}
function node() {
  const attrs = {};
  const classes = new Set();
  return { hidden: false, value: '', textContent: '', dataset: {}, style: {}, children: [],
    set innerHTML(value) { this.children = []; this.html = value; }, get innerHTML() { return this.html || ''; },
    appendChild(child) { this.children.push(child); }, setAttribute(k, v) { attrs[k] = v; }, attrs,
    focus() { this.focused = true; }, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } } };
}
function fixture() {
  const nodes = new Map();
  const get = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const filters = ['all', 'flights', 'personal', 'mate'].map(group => ({ ...node(), dataset: { documentFilter: group } }));
  const archive = { ...node(), querySelectorAll: () => [node()] };
  const section = { querySelector: get, querySelectorAll: selector => selector === '[data-document-filter]' ? filters : [] };
  const vaultLibrary = { ...node(), querySelector: get };
  const ctx = { window: {}, navigator: { onLine: true }, document: { querySelector: () => null },
    currentUser: { id: 'A' }, documentSessionEpoch: 1, documentRenderVersion: 0, hasDocumentSession: true,
    documentLoadState: 'ready', documentSearchQuery: '', activeDocumentFilter: 'all', tripId: 'trip',
    categoryTargets: {}, vaultLibrary, section, vault: { ...node(), querySelector: get },
    categoryList: node(), searchControls: node(), searchInput: node(), searchClear: node(), searchResults: node(),
    libraryState: { ...node(), querySelector: get }, passphraseInput: node(),
    authPanel: node(), sessionPanel: node(), unlockPanel: node(), uploadSection: node(), summary: node(),
    vaultPickButtons: [], form: { ...node(), reset() {} }, uploadButton: node(), uploadInProgress: false,
    status: get('[data-vault-status]'), databaseErrorMessage: () => 'synthetic error',
    setTimeout(fn) { ctx.deferredSessionLoad = fn; }, storageErrorMessage: () => 'synthetic error',
    flushPendingCleanup: async () => {},
    createCategoryDocument(record) { return { ...node(), _documentRecord: record }; },
    groupForCategory: category => category === 'flights' ? 'flights' : 'personal',
    formatSize: value => String(value), mateArchive: () => archive
  };
  for (const group of ['flights', 'personal']) ctx.categoryTargets[group] = { row: node(), button: node(), files: node() };
  vm.createContext(ctx);
  vm.runInContext(between('function setStatus(', 'var authPanel =') + '\n' +
    between('function normalizeDocumentSearch(', 'function groupForCategory(') + '\n' +
    between('function updateDocumentLibraryState(', "searchInput.addEventListener('input'") + '\n' +
    between('function updateDocumentFilterCounts(', 'if (categoryNavigation)') + '\n' +
    between('function ownsStoragePath(', 'async function requireDocumentAccess(') + '\n' +
    between('function clearRemoteDocumentMetadata(', "authForm.addEventListener('submit'") + '\n' +
    between('async function renderDocuments(', 'function createCategoryDocument('), ctx);
  vm.runInContext(between("vaultLibrary.querySelector('[data-vault-retry]').addEventListener", "window.addEventListener('offline'"), ctx);
  const add = (group, file_name, note = '') => {
    const row = { ...node(), _documentRecord: { file_name, note } };
    ctx.categoryTargets[group].files.children.push(row); return row;
  };
  const query = value => { ctx.documentSearchQuery = value; ctx.searchInput.value = value; ctx.applyDocumentFilter(); };
  return { ctx, nodes, add, query, archive, get };
}

test('metadata search composes category and all-word Hebrew/mixed text without reading contents', () => {
  const { ctx, add, query, archive } = fixture();
  const flight = add('flights', 'טיסה Flight.PDF', 'תל אביב 2026');
  const personal = add('personal', 'Flight notes.txt', 'תל אביב');
  Object.defineProperty(flight._documentRecord, 'contents', { get() { throw new Error('content access forbidden'); } });
  query('  FLIGHT   אביב ');
  assert.equal(flight.hidden, false); assert.equal(personal.hidden, false);
  ctx.activeDocumentFilter = 'flights'; ctx.applyDocumentFilter();
  assert.equal(ctx.categoryTargets.personal.row.hidden, true);
  assert.match(ctx.searchResults.textContent, /^1 /);
  query('Flight ירושלים'); assert.equal(flight.hidden, true);
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'no-results');
  ctx.activeDocumentFilter = 'mate'; ctx.applyDocumentFilter();
  assert.equal(archive.hidden, false); assert.equal(ctx.searchControls.hidden, true);
});

test('Unicode normalization, literal punctuation and markup remain metadata text', () => {
  const { ctx } = fixture();
  assert.equal(ctx.documentMatchesSearch({ file_name: 'Ｆｌｉｇｈｔ.PDF', note: '<b>עברית</b>' }, 'flight עברית'), true);
  assert.equal(ctx.documentMatchesSearch({ file_name: 'file[1].txt', note: '' }, '[1]'), true);
  assert.equal(ctx.documentMatchesSearch({ file_name: 'notes', note: '' }, '.*'), false);
  assert.equal(ctx.documentMatchesSearch({ file_name: null, note: undefined }, '  '), true);
});

test('loading, signed-out, successful-empty, locked, ready, no-results and error differ', () => {
  const { ctx, add, query, get } = fixture();
  ctx.documentLoadState = 'loading'; ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'loading');
  assert.equal(ctx.vaultLibrary.attrs['aria-busy'], 'true');
  assert.equal(ctx.categoryList.hidden, true);
  ctx.documentLoadState = 'ready'; ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'empty');
  assert.equal(get('[data-vault-lock-state]').hidden, false);
  add('personal', 'synthetic.txt'); ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'locked');
  ctx.passphraseInput.value = 'synthetic-passphrase'; ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'ready');
  query('missing'); assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'no-results');
  ctx.documentLoadState = 'error'; ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'error');
  assert.equal(get('[data-vault-retry]').hidden, false);
  ctx.currentUser = null; ctx.documentLoadState = 'signed-out'; ctx.applyDocumentFilter();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'signed-out');
  assert.equal(ctx.searchResults.textContent, ''); assert.equal(ctx.searchControls.hidden, true);
});

test('offline reports cloud connectivity honestly while metadata can remain searchable', () => {
  const { ctx, add, query, get } = fixture(); add('personal', 'synthetic.txt');
  ctx.navigator.onLine = false; query('synthetic');
  assert.equal(get('[data-vault-offline]').hidden, false);
  assert.equal(ctx.searchControls.hidden, false); assert.match(ctx.searchResults.textContent, /^1 /);
});

test('account change and sign-out synchronously clear query, rows, result count and preview', async () => {
  const { ctx, add, query } = fixture(); let closed = 0;
  ctx.document.querySelector = () => ({ _closePreview() { closed++; } });
  add('personal', 'A-private-name.txt'); query('private');
  await ctx.applySession({ user: { id: 'B', email: 'synthetic@example.invalid' } });
  assert.equal(ctx.documentSearchQuery, ''); assert.equal(ctx.searchInput.value, '');
  assert.equal(ctx.categoryTargets.personal.files.children.length, 0); assert.equal(ctx.searchResults.textContent, '');
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'loading'); assert.equal(closed, 1);
  add('personal', 'B-private-name.txt'); query('B-private');
  await ctx.applySession(null);
  assert.equal(ctx.documentSearchQuery, ''); assert.equal(ctx.searchInput.value, '');
  assert.equal(ctx.searchResults.textContent, ''); assert.equal(ctx.uploadSection.hidden, true);
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'signed-out');
});

test('same-account token refresh preserves the active in-memory search', async () => {
  const { ctx, add, query } = fixture(); add('personal', 'synthetic.txt'); query('synthetic');
  await ctx.applySession({ user: { id: 'A' } }); assert.equal(ctx.documentSearchQuery, 'synthetic');
});

function responseFixture() {
  const fixtureValue = fixture(), { ctx } = fixtureValue; const pending = [];
  ctx.client = { from() { const filters = []; return {
    select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    order() { return new Promise((resolve, reject) => pending.push({ resolve, reject, filters })); }
  }; } };
  return { ...fixtureValue, pending };
}
function record(name = 'synthetic.txt', user = 'A') { return { id: name, file_name: name, user_id: user, storage_path: user + '/trip/file', category: 'personal', file_size: 1 }; }

test('late A response after A to B to A cannot restore old metadata or search results', async () => {
  const { ctx, pending } = responseFixture();
  const old = ctx.renderDocuments();
  await ctx.applySession({ user: { id: 'B' } }); await ctx.applySession({ user: { id: 'A' } });
  pending[0].resolve({ data: [record('old-private.txt')] }); await old;
  assert.equal(ctx.categoryTargets.personal.files.children.length, 0);
  assert.equal(ctx.searchResults.textContent, ''); assert.equal(ctx.window.TravelMateDocumentHealth, undefined);
});

test('latest same-account metadata request wins and rejects foreign owner/traversal rows', async () => {
  const { ctx, pending } = responseFixture();
  const old = ctx.renderDocuments(), latest = ctx.renderDocuments();
  pending[1].resolve({ data: [record('latest.txt'), record('foreign.txt', 'B'), { ...record('bad.txt'), storage_path: 'A/../B/private' }] });
  await latest; pending[0].resolve({ data: [record('old.txt')] }); await old;
  const rows = ctx.categoryTargets.personal.files.children;
  assert.equal(rows.length, 1); assert.equal(rows[0]._documentRecord.file_name, 'latest.txt');
  assert.deepEqual(pending[1].filters, [['user_id', 'A'], ['trip_id', 'trip']]);
});

test('transport rejection and database error clear stale rows and never become successful-empty', async () => {
  for (const rejected of [true, false]) {
    const { ctx, pending, add, query } = responseFixture(); add('personal', 'old.txt'); query('old');
    const load = ctx.renderDocuments();
    if (rejected) pending[0].reject(new Error('synthetic offline'));
    else pending[0].resolve({ error: { message: 'synthetic denied' } });
    await load;
    assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'error');
    assert.equal(ctx.categoryTargets.personal.files.children.length, 0);
    assert.equal(ctx.documentSearchQuery, ''); assert.equal(ctx.searchResults.textContent, '');
    assert.equal(ctx.window.TravelMateDocumentHealth, undefined);
  }
});

test('only an authenticated successful empty response advertises empty', async () => {
  const { ctx, pending } = responseFixture(); const load = ctx.renderDocuments();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'loading');
  pending[0].resolve({ data: [] }); await load;
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'empty');
  assert.equal(ctx.window.TravelMateDocumentHealth.loaded, true);
});

test('explicit retry clears metadata error immediately and successful load leaves no stale status', async () => {
  const { ctx, pending, get } = responseFixture();
  const failed = ctx.renderDocuments(); pending[0].resolve({ error: { message: 'synthetic denied' } }); await failed;
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'error');
  assert.equal(ctx.status.textContent, 'synthetic error'); assert.equal(ctx.status.classList.contains('error'), true);
  get('[data-vault-retry]').listeners.click();
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'loading');
  assert.equal(ctx.status.textContent, ''); assert.equal(ctx.status.classList.contains('error'), false);
  pending[1].resolve({ data: [] }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(ctx.vaultLibrary.dataset.vaultLibraryState, 'empty');
  assert.equal(ctx.status.textContent, ''); assert.equal(ctx.status.classList.contains('error'), false);
});

test('general successful metadata render preserves an unrelated operation message', async () => {
  const { ctx, pending } = responseFixture();
  ctx.setStatus('synthetic upload outcome');
  const loading = ctx.renderDocuments(); pending[0].resolve({ data: [record()] }); await loading;
  assert.equal(ctx.status.textContent, 'synthetic upload outcome');
  assert.equal(ctx.status.classList.contains('error'), false);
});

test('initial auth transport error becomes error; a stale auth error cannot override a newer session', async () => {
  for (const stale of [false, true]) {
    let rejectSession;
    const pending = new Promise((resolve, reject) => { rejectSession = reject; });
    const ctx = { window: { addEventListener() {} }, currentUser: null,
      documentLoadState: 'loading', flushPendingCleanup() {},
      applyDocumentFilter() { ctx.renderedState = ctx.documentLoadState; }, setStatus() {},
      applySession(session) { ctx.currentUser = session.user; ctx.documentLoadState = 'ready'; },
      client: { auth: { onAuthStateChange(fn) { ctx.auth = fn; }, getSession: () => pending } }
    };
    vm.createContext(ctx);
    const start = source.indexOf('var authEventVersion = 0;');
    const code = source.slice(start, source.indexOf('\n  }', start));
    const result = vm.runInContext('(async function () {' + code + '})()', ctx);
    if (stale) ctx.auth('SIGNED_IN', { user: { id: 'B' } });
    rejectSession(new Error('synthetic network failure')); await result;
    assert.equal(ctx.documentLoadState, stale ? 'ready' : 'error');
    if (stale) assert.equal(ctx.currentUser.id, 'B');
  }
});
