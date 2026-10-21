const { test, expect } = require('@playwright/test');
// Actual trip HTML/app/lazy vault, DOM and WebCrypto. Only cloud/auth/storage are
// synthetic. Keep routed boundaries active on reload; PWA tests remain separate.
test.use({ serviceWorkers: 'block' });
function cloudBoundary() {
  const active = () => localStorage.getItem('travelmate-active-user');
  const trips = () => JSON.parse(localStorage.getItem('travelmate-trips') || '[]');
  const q = window.documentsQA = { user: active() ? { id: active(), email: 'synthetic@example.invalid' } : null, callbacks: [], rows: [], uploads: [], inserts: [], reads: [], encrypted: 0, holds: {}, waiters: {}, entered: {}, accessDenied: false };
  async function gate(stage) { if (q.holds[stage]) { q.entered[stage] = true; await new Promise(r => (q.waiters[stage] ||= []).push(r)); } }
  q.release = stage => { q.holds[stage] = false; (q.waiters[stage] || []).splice(0).forEach(r => r()); };
  const read = File.prototype.arrayBuffer;
  File.prototype.arrayBuffer = async function () { q.reads.push(this.name); await gate('read'); const bytes = await read.call(this); q.completedReads = (q.completedReads || 0) + 1; return bytes; };
  const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  crypto.subtle.encrypt = async (...args) => { q.encrypted++; await gate('encrypt'); return encrypt(...args); };
  const client = {
    auth: { getSession: async () => ({ data: { session: q.user ? { user: q.user } : null } }), onAuthStateChange: fn => { q.callbacks.push(fn); return { data: { subscription: { unsubscribe() {} } } }; }, signOut: async () => { q.switch(null); return {}; } },
    storage: { from: () => ({
      upload: async (path, blob) => { q.uploads.push({ path, size: blob.size }); await gate('upload'); return {}; },
      remove: async () => ({}), download: async () => { throw Error('Unexpected download in picker/lock fixture'); }
    }) },
    from: () => { const filters = []; const query = {
      select() { return query; }, eq(k, v) { filters.push([k, v]); return query; }, order() { return query; }, limit() { return query; },
      async insert(row) { await gate('metadata'); q.inserts.push(row); q.rows.push({ ...row, id: String(q.rows.length + 1), created_at: '2026-10-21T00:00:00Z' }); return {}; },
      then(resolve, reject) { return Promise.resolve({ data: q.rows.filter(row => filters.every(([k, v]) => row[k] === v)) }).then(resolve, reject); }
    }; return query; }
  };
  q.switch = id => { q.user = id ? { id, email: id.toLowerCase() + '@example.invalid' } : null; if (id) localStorage.setItem('travelmate-active-user', id); else localStorage.removeItem('travelmate-active-user'); q.callbacks.forEach(fn => fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', q.user ? { user: q.user } : null)); };
  window.TravelMateCloud = {
    getClient: async () => client, getSession: async () => q.user ? { user: q.user } : null,
    getPrivateStorageSession: async () => { if (q.accessDenied) throw Error('MFA_REQUIRED'); return { client, session: q.user ? { user: q.user } : null }; },
    getLocalTrips: trips, getTrip: async id => trips().find(t => t.id === id), upsertLocalTrip: trip => { const list = trips(), i = list.findIndex(t => t.id === trip.id && t.ownerId === trip.ownerId); if (i < 0) list.push(trip); else list[i] = trip; localStorage.setItem('travelmate-trips', JSON.stringify(list)); },
    queueTripSave: () => {}, onAuthChange: async () => () => {}, listTripChangeEvents: async () => [], getTripChangeReadState: async () => null, listTripMembers: async () => [], subscribeToTripChangeEvents: async () => () => {}
  };
  q.cloud = window.TravelMateCloud;
}
async function ready(page, signedOut = false) {
  await expect.poll(() => page.evaluate(() => Boolean(window.documentsQA && documentsQA.cloud === window.TravelMateCloud && documentsQA.callbacks.length))).toBe(true);
  await expect(page.locator('[data-document-vault]')).toHaveCount(1);
  await expect.poll(() => page.locator('[data-vault-form]').evaluate(f => f.hidden)).toBe(signedOut);
}
async function boot(page, { signedOut = false, view = 'documents', holdVault = false } = {}) {
  const evidence = { choosers: 0, errors: [], vaultRequests: 0 };
  page.on('filechooser', () => evidence.choosers++); page.on('pageerror', e => evidence.errors.push(e.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
  await page.addInitScript(({ signedOut }) => {
    if (!localStorage.getItem('documents-qa-seeded')) {
      localStorage.setItem('documents-qa-seeded', '1'); if (!signedOut) localStorage.setItem('travelmate-active-user', 'A');
      localStorage.setItem('travelmate-trips', JSON.stringify([{ id: 'synthetic-documents', ownerId: 'A', city: 'Synthetic', country: 'Czechia', start: '2026-10-21', end: '2026-10-23', days: 3, budget: 100, planInitialized: true, activities: [], savedPlaces: [], expenses: [] }]));
    }
    window.documentsPickerClicks = 0;
    const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') documentsPickerClicks++; return click.call(this); };
  }, { signedOut });
  await page.route('**/assets/supabase-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'window.TRAVELMATE_SUPABASE={url:"https://example.invalid",publishableKey:"synthetic-only",documentBucket:"travel-documents"};' }));
  await page.route('**/assets/cloud-sync.js*', r => r.fulfill({ contentType: 'text/javascript', body: '(' + cloudBoundary.toString() + ')();' }));
  await page.route('**/assets/document-vault.js*', async route => { evidence.vaultRequests++; if (holdVault) await new Promise(r => { evidence.releaseVault = r; }); await route.continue(); });
  await page.goto('/trip/custom/index.html?id=synthetic-documents&view=' + view, { waitUntil: 'domcontentloaded' });
  if (view === 'documents' && !holdVault) await ready(page, signedOut);
  return evidence;
}
async function navigate(page, view) {
  await page.locator('[data-mobile-menu]').click();
  await page.locator('.sidebar nav [data-view="' + view + '"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', view);
  if (view === 'documents') await ready(page);
}
const file = { name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic document') };
async function select(page) { await page.locator('[data-vault-form] [name="files"]').setInputFiles(file); }
async function idle(page) { await expect(page.locator('.vault-upload-button')).toBeEnabled(); }
for (const width of [390, 430]) test.describe(width + ' RTL Documents picker and lock', () => {
  test.use({ viewport: { width, height: 844 } });
  test('cold and warm repeated header/category activation has one owner', async ({ page }) => {
    const e = await boot(page); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    for (const selector of ['[data-vault-pick]', '[data-document-group="personal"] > button', '[data-vault-pick]']) {
      const before = await page.evaluate(() => documentsPickerClicks), chooser = page.waitForEvent('filechooser');
      await page.locator(selector).click(); await chooser;
      expect(await page.evaluate(() => documentsPickerClicks)).toBe(before + 1);
    }
    await navigate(page, 'budget'); await navigate(page, 'documents'); await navigate(page, 'budget'); await navigate(page, 'documents');
    const before = e.choosers, chooser = page.waitForEvent('filechooser'); await page.locator('[data-vault-pick]').click(); await chooser;
    expect(e.choosers).toBe(before + 1); expect(e.vaultRequests).toBe(1); await expect(page.locator('[data-document-vault]')).toHaveCount(1); expect(e.errors).toEqual([]);
  });
  test('signed-out header/category cannot bypass auth; forced selection cannot upload', async ({ page }) => {
    const e = await boot(page, { signedOut: true });
    await page.locator('[data-vault-pick]').click(); await expect(page.locator('[data-vault-auth-form] [name="email"]')).toBeFocused();
    await page.locator('[data-document-group="personal"] > button').click(); await select(page);
    expect(await page.evaluate(() => documentsPickerClicks)).toBe(0); expect(e.choosers).toBe(0);
    expect(await page.evaluate(() => documentsQA.reads.length)).toBe(0); expect(await page.evaluate(() => documentsQA.uploads.length)).toBe(0);
  });
  test('locked and private-storage-denied selection preserve existing guards', async ({ page }) => {
    await boot(page); await select(page); expect(await page.evaluate(() => documentsQA.reads.length)).toBe(0);
    await page.locator('[data-vault-passphrase]').fill('synthetic-original-passphrase');
    await page.evaluate(() => { documentsQA.accessDenied = true; }); await select(page); await idle(page);
    expect(await page.evaluate(() => documentsQA.reads.length)).toBe(1); expect(await page.evaluate(() => documentsQA.uploads.length)).toBe(0);
  });
  for (const stage of ['read', 'encrypt', 'upload', 'metadata']) for (const next of ['', 'synthetic-new-passphrase']) test('preserve ' + (next ? 'changed key' : 'clear/lock') + ' during ' + stage, async ({ page }) => {
    await boot(page); await page.locator('[data-vault-passphrase]').fill('synthetic-original-passphrase');
    await page.evaluate(stage => { documentsQA.holds[stage] = true; }, stage); await select(page);
    await expect.poll(() => page.evaluate(stage => Boolean(documentsQA.entered[stage]), stage)).toBe(true);
    await page.locator('[data-vault-passphrase]').fill(next); await page.evaluate(stage => documentsQA.release(stage), stage); await idle(page);
    await expect(page.locator('[data-vault-passphrase]')).toHaveValue(next);
    expect(await page.evaluate(() => documentsQA.uploads.length)).toBe(1); expect(await page.evaluate(() => documentsQA.inserts.length)).toBe(1);
    expect(await page.locator('[data-vault-form] [name="files"]').evaluate(input => input.files.length)).toBe(0);
    if (!next) { await page.locator('[data-open-document]').first().click(); await expect(page.locator('[data-vault-preview]')).toHaveCount(0); }
  });
  test('same-document auth ABA retires pending operation without restoring key', async ({ page }) => {
    await boot(page); await page.locator('[data-vault-passphrase]').fill('synthetic-original-passphrase');
    await page.evaluate(() => { documentsQA.holds.read = true; }); await select(page);
    await expect.poll(() => page.evaluate(() => Boolean(documentsQA.entered.read))).toBe(true);
    await page.evaluate(() => { documentsQA.switch('B'); documentsQA.switch('A'); });
    await page.locator('[data-vault-passphrase]').fill('synthetic-returned-A'); await page.evaluate(() => documentsQA.release('read')); await idle(page);
    await expect.poll(() => page.evaluate(() => documentsQA.completedReads || 0)).toBe(1);
    await expect(page.locator('[data-vault-passphrase]')).toHaveValue('synthetic-returned-A');
    expect(await page.evaluate(() => documentsQA.uploads.length)).toBe(0); expect(await page.evaluate(() => documentsQA.inserts.length)).toBe(0);
  });
  test('early lazy-load click remains unqueued, then initialized owner opens once', async ({ page }) => {
    const e = await boot(page, { holdVault: true }); await expect.poll(() => typeof e.releaseVault).toBe('function');
    await page.locator('[data-vault-pick]').click(); expect(await page.evaluate(() => documentsPickerClicks)).toBe(0);
    e.releaseVault(); await ready(page); expect(await page.evaluate(() => documentsPickerClicks)).toBe(0);
    const chooser = page.waitForEvent('filechooser'); await page.locator('[data-vault-pick]').click(); await chooser; expect(await page.evaluate(() => documentsPickerClicks)).toBe(1);
  });
  test('pending selection remains single-flight across navigation and empty cancel', async ({ page }) => {
    await boot(page); await page.locator('[data-vault-passphrase]').fill('synthetic-original-passphrase');
    await page.locator('[data-vault-form] [name="files"]').setInputFiles([]); expect(await page.evaluate(() => documentsQA.reads.length)).toBe(0);
    await page.evaluate(() => { documentsQA.holds.read = true; }); await select(page); await select(page);
    await expect.poll(() => page.evaluate(() => documentsQA.reads.length)).toBe(1);
    await navigate(page, 'budget'); await page.evaluate(() => documentsQA.release('read'));
    await expect.poll(() => page.evaluate(() => documentsQA.inserts.length)).toBe(1);
    await navigate(page, 'documents'); await idle(page); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('synthetic-original-passphrase');
    expect(await page.evaluate(() => documentsQA.uploads.length)).toBe(1);
    await expect(page.locator('[data-document-id]')).toHaveCount(1);
  });
});
