'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const sourceRoot = process.env.DOCUMENTS_SOURCE_ROOT || process.cwd();
const sources = Object.fromEntries(['app', 'document-vault'].map(n => [n, fs.readFileSync(path.join(sourceRoot, 'assets', n + '.js'), 'utf8')]));
const pause = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 2000; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 1)); } assert.fail('Synthetic operation did not reach expected stage'); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function fixture({ signedOut = false, app = true } = {}) {
  const all = {}, events = {}, calls = { picks: 0, reads: 0, uploads: [], inserts: [], encrypted: 0, resets: 0, navigation: [], errors: [] };
  class Element {
    constructor(name = '') { this.name = name; this.dataset = {}; this.style = {}; this.attributes = {}; this.children = []; this.listeners = {}; this.value = ''; this.hidden = false; this.disabled = false; this.textContent = ''; this.innerHTML = ''; this.classList = { add() {}, remove() {}, contains: () => false, toggle() {} }; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    async emit(name, extra = {}) { const e = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra }; for (const fn of this.listeners[name] || []) await fn(e); }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k] || null; }
    removeAttribute(k) { delete this.attributes[k]; }
    toggleAttribute(k, v) { if (v) this.attributes[k] = ''; else delete this.attributes[k]; }
    appendChild(n) { this.children.push(n); n.parentNode = this; return n; }
    insertAdjacentElement(_, n) { if (n.dataset.documentVault !== undefined) all.vault = n; return n; }
    querySelector(s) { return all[s] || null; }
    querySelectorAll() { return []; }
    closest(s) { if (this === header && s === '[data-vault-pick]') return this; if (this === category && s === '.doc-row') return row; return null; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
    contains() { return false; }
    matches() { return false; }
    click() { if (this === input) calls.picks++; }
    reset() { calls.resets++; input.value = ''; input.files = []; note.value = ''; }
  }
  const node = s => all[s] = new Element(s);
  const section = new Element('documents'), header = new Element('header'), row = new Element('category-row'), category = new Element('category');
  row.dataset.documentGroup = 'personal';
  const title = new Element('strong'); title.textContent = 'personal';
  row.querySelector = s => s === 'strong' ? title : s === ':scope > button' ? category : null;
  const auth = node('[data-vault-auth]'), authForm = node('[data-vault-auth-form]'), form = node('[data-vault-form]'), input = new Element('files'), note = new Element('note');
  const pass = node('[data-vault-passphrase]'), button = node('.vault-upload-button'), email = new Element('email');
  input.files = []; authForm.elements = { email, password: new Element('password') }; form.elements = { files: input, note, category: { value: 'personal', options: [{ value: 'personal' }] } };
  ['[data-vault-status]', '[data-vault-session]', '[data-vault-unlock]', '[data-vault-upload-section]', '[data-vault-drop]', '[data-vault-summary]', '[data-vault-count]', '[data-vault-size]', '[data-vault-storage]', '[data-vault-email]', '[data-auth-signup]', '[data-auth-resend]', '[data-vault-signout]', '[data-vault-toggle-passphrase]', '[data-document-category-list]', '.section-head'].forEach(node);
  section.querySelector = s => s === '[data-document-vault]' ? all.vault || null : all[s] || null;
  section.querySelectorAll = s => s === '[data-vault-pick]' ? [header] : s === '[data-document-category-list] > .doc-row' ? [row] : s === '.doc-row button' ? [category] : [];
  const document = { readyState: 'loading', baseURI: 'http://127.0.0.1:4173/trip/custom/index.html?id=synthetic', scripts: [], currentScript: { src: 'http://127.0.0.1:4173/assets/app.js' }, body: new Element('body'), head: new Element('head'), documentElement: new Element('html'), activeElement: null,
    getElementById: id => id === 'documents' ? section : null, createElement: name => new Element(name),
    querySelector: s => s === '[data-vault-form] input[type="file"]' ? input : null,
    querySelectorAll: () => [], addEventListener: (n, fn) => (events[n] ||= []).push(fn) };
  document.body.dataset.tripId = 'synthetic';
  const store = new Map(), localStorage = { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const gates = {}, q = { user: signedOut ? null : { id: 'A', email: 'a@example.invalid' }, rows: [], auth: null, accessDenied: false };
  async function gate(name) { if (gates[name]) { gates[name].entered = true; await gates[name].promise; } }
  const client = { auth: { getSession: async () => ({ data: { session: q.user ? { user: q.user } : null } }), onAuthStateChange: fn => { q.auth = fn; }, signOut: async () => { q.switch(null); return {}; } },
    storage: { from: () => ({ upload: async (p, b) => { calls.uploads.push({ path: p, size: b.size }); await gate('upload'); return {}; }, remove: async () => ({}) }) },
    from: () => { const filters = []; const query = { select() { return query; }, eq(k, v) { filters.push([k, v]); return query; }, order() { return query; }, limit() { return query; }, async insert(r) { await gate('metadata'); calls.inserts.push(r); q.rows.push({ ...r, id: String(q.rows.length + 1), created_at: "2026-10-21T00:00:00Z" }); return {}; }, then(resolve, reject) { return Promise.resolve({ data: q.rows.filter(r => filters.every(([k, v]) => r[k] === v)) }).then(resolve, reject); } }; return query; } };
  const subtle = { importKey: (...a) => crypto.webcrypto.subtle.importKey(...a), deriveKey: (...a) => crypto.webcrypto.subtle.deriveKey(...a), encrypt: async (...a) => { calls.encrypted++; await gate('encrypt'); return crypto.webcrypto.subtle.encrypt(...a); } };
  const windowEvents = {};
  const ctx = { document, location: { pathname: '/trip/custom/index.html', search: '?id=synthetic', href: document.baseURI, protocol: 'http:', origin: 'http://127.0.0.1:4173', hostname: '127.0.0.1', reload: () => calls.navigation.push('reload'), replace: u => calls.navigation.push(u) }, localStorage, sessionStorage: localStorage, navigator: { onLine: true }, crypto: { subtle, getRandomValues: a => crypto.webcrypto.getRandomValues(a), randomUUID: crypto.randomUUID }, URL, URLSearchParams, TextEncoder, Uint8Array, ArrayBuffer, Blob, File, Intl, Date, console: { log() {}, warn() {}, error: (...a) => calls.errors.push(a.map(String).join(' ')) },
    setTimeout: (fn, ms) => ms === 0 ? setTimeout(fn, 0) : 0, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener() {} }), getComputedStyle: () => ({}),
    addEventListener: (n, fn) => (windowEvents[n] ||= []).push(fn), dispatchEvent: e => { for (const fn of windowEvents[e.type] || []) fn(e); }, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } };
  ctx.window = ctx; ctx.TRAVELMATE_SUPABASE = { url: 'https://example.invalid', publishableKey: 'synthetic-only' };
  ctx.TravelMateCloud = { getClient: async () => client, getPrivateStorageSession: async () => { if (q.accessDenied) throw Error('MFA_REQUIRED'); return { client, session: q.user ? { user: q.user } : null }; } };
  q.switch = id => { q.user = id ? { id, email: id.toLowerCase() + '@example.invalid' } : null; q.auth(id ? 'SIGNED_IN' : 'SIGNED_OUT', q.user ? { user: q.user } : null); };
  vm.createContext(ctx);
  if (app) vm.runInContext(sources.app, ctx, { filename: 'assets/app.js' });
  const before = (events.DOMContentLoaded || []).length;
  vm.runInContext(sources['document-vault'], ctx, { filename: 'assets/document-vault.js' });
  // Run the full vault's own registered initializer. Other app lifecycle is covered in browser tests.
  await events.DOMContentLoaded[before]();
  pass.value = signedOut ? '' : 'synthetic-original-passphrase';
  await pause();
  return { ctx, q, calls, pass, input, form, button, header, category, all, hold: name => gates[name] = deferred(), gate: name => gates[name], async click(target) { await target.emit('click'); for (const fn of events.click || []) fn({ target, preventDefault() {}, stopPropagation() {} }); },
    async select() { input.files = [{ name: 'synthetic.txt', size: 3, type: 'text/plain', async arrayBuffer() { calls.reads++; await gate('read'); return new Uint8Array([1, 2, 3]).buffer; } }]; input.value = 'selected'; await input.emit('change'); },
    async done() { await until(() => !button.disabled); await pause(); } };
}
test('full-module fixture control initializes actual vault and app listener registrations', async () => { const f = await fixture(); assert.ok(f.ctx.TravelMateDocuments); assert.equal(f.pass.value, 'synthetic-original-passphrase'); });

test('header picker has one activation owner with app and vault loaded', async () => {
  const f = await fixture(); await f.click(f.header); assert.equal(f.calls.picks, 1);
});
test('header cannot bypass signed-out vault authentication', async () => {
  const f = await fixture({ signedOut: true }); await f.click(f.header); assert.equal(f.calls.picks, 0); assert.equal(f.ctx.document.activeElement, f.all['[data-vault-auth-form]'].elements.email);
});
test('category and repeated header activation each invoke one picker', async () => {
  const f = await fixture(); for (const target of [f.category, f.header, f.category, f.header]) { const before = f.calls.picks; await f.click(target); assert.equal(f.calls.picks - before, 1); }
});
test('signed-out category and forced selection preserve authentication gate', async () => {
  const f = await fixture({ signedOut: true }); await f.click(f.category); await f.select(); assert.equal(f.calls.picks, 0); assert.equal(f.calls.reads, 0); assert.equal(f.calls.uploads.length, 0);
});
test('locked signed-in entry preserves existing chooser and save-time passphrase gate', async () => {
  const f = await fixture(); f.pass.value = ''; await f.click(f.category); assert.equal(f.calls.picks, 1); await f.select(); assert.equal(f.calls.reads, 0); assert.equal(f.calls.uploads.length, 0); assert.equal(f.pass.value, '');
});
test('private storage gate rejection still prevents encryption and upload', async () => {
  const f = await fixture(); f.q.accessDenied = true; await f.select(); await f.done(); assert.equal(f.calls.reads, 1); assert.equal(f.calls.encrypted, 0); assert.equal(f.calls.uploads.length, 0);
});
for (const stage of ['read', 'encrypt', 'upload', 'metadata']) for (const next of ['', 'synthetic-new-passphrase']) {
  test('newer passphrase ' + (next ? 'replacement' : 'clear/lock') + ' survives pending ' + stage, async () => {
    const f = await fixture(), wait = f.hold(stage); await f.select(); await until(() => f.gate(stage).entered);
    f.pass.value = next; await f.pass.emit('input'); wait.resolve(); await f.done();
    assert.equal(f.pass.value, next); assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.inserts.length, 1); assert.equal(f.calls.inserts[0].user_id, 'A');
    assert.equal(f.calls.resets, 2, 'existing successful upload form reset remains'); assert.equal(f.input.value, '');
  });
}
test('newer unlock after a clear remains selected when an older upload finishes', async () => {
  const f = await fixture(), wait = f.hold('upload'); await f.select(); await until(() => f.gate('upload').entered);
  f.pass.value = ''; await f.pass.emit('input'); f.pass.value = 'synthetic-latest-unlock'; await f.pass.emit('input'); wait.resolve(); await f.done();
  assert.equal(f.pass.value, 'synthetic-latest-unlock'); assert.equal(f.calls.inserts.length, 1);
});
test('unchanged passphrase is retained and already-authorized upload still completes', async () => {
  const f = await fixture(); await f.select(); await f.done(); assert.equal(f.pass.value, 'synthetic-original-passphrase'); assert.equal(f.calls.uploads.length, 1); assert.equal(f.calls.inserts.length, 1); assert.equal(f.calls.inserts[0].encrypted, true); assert.equal(f.calls.uploads[0].size, 19);
});
for (const stage of ['read', 'encrypt', 'upload', 'metadata']) test('account ABA during ' + stage + ' cannot restore old passphrase or reset current form', async () => {
  const f = await fixture(), wait = f.hold(stage); await f.select(); await until(() => f.gate(stage).entered);
  f.q.switch('B'); f.q.switch('A'); f.pass.value = 'synthetic-returned-A'; const resetCount = f.calls.resets; wait.resolve();
  await new Promise(r => setTimeout(r, 80));
  assert.equal(f.pass.value, 'synthetic-returned-A'); assert.equal(f.calls.resets, resetCount);
  assert.equal(f.calls.uploads.length, ['upload', 'metadata'].includes(stage) ? 1 : 0);
  assert.equal(f.calls.inserts.length, stage === 'metadata' ? 1 : 0);
});
test('empty selection cancels without changing passphrase or starting work', async () => {
  const f = await fixture(); await f.input.emit('change'); await f.form.emit('submit'); assert.equal(f.calls.reads, 0); assert.equal(f.calls.uploads.length, 0); assert.equal(f.pass.value, 'synthetic-original-passphrase');
});
test('repeated selection while pending remains single-flight and preserves existing completion reset', async () => {
  const f = await fixture(), wait = f.hold('read'); await f.select(); await until(() => f.gate('read').entered); await f.select(); assert.equal(f.calls.reads, 1); wait.resolve(); await f.done(); assert.equal(f.calls.uploads.length, 1); assert.equal(f.input.files.length, 0);
});


