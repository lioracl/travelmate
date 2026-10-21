const { test, expect } = require('@playwright/test');

// Full app/feature/TripStore and real browser IndexedDB. Only the cloud service
// boundary is replaced; all accounts, files, remote responses and FX are synthetic.
function cloudBoundary() {
  const trips = () => JSON.parse(localStorage.getItem('travelmate-trips') || '[]');
  const q = window.receiptQA = { uploads: [], removals: [], saves: [], offline: false, quota: localStorage.getItem('receipt-qa-quota') === '1', hold: false, waits: [], remote: trips()[0], failRemove: false, failQuery: false };
  const session = () => ({ user: { id: localStorage.getItem('travelmate-active-user') } });
  const client = {
    rpc: async () => { throw Error("Unexpected RPC in controlled cloud fixture"); },
    auth: { getSession: async () => ({ data: { session: session() } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({
      upload: async path => { q.uploads.push(path); if (q.hold) await new Promise(r => q.waits.push(r)); return q.offline ? { error: Error('MFA_REQUIRED') } : {}; },
      remove: async paths => { q.removals.push(...paths); return q.failRemove ? { error: Error('synthetic offline') } : {}; }
    }) },
    from: () => ({ select() { return this; }, eq() { return this; }, async limit() { return q.failQuery ? { error: Error('synthetic offline') } : { data: q.remote ? [{ id: q.remote.id, user_id: q.remote.ownerId, revision: q.remote.cloudRevision, updated_at: q.remote.cloudUpdatedAt, payload: q.remote }] : [] }; } })
  };
  window.TravelMateCloud = {
    getClient: async () => client, getSession: async () => session(), getPrivateStorageSession: async () => ({ client, session: session() }),
    getLocalTrips: trips, getTrip: async id => trips().find(t => t.id === id),
    upsertLocalTrip: trip => { if (q.quota) throw Error('synthetic quota'); const list = trips(), i = list.findIndex(t => t.id === trip.id && t.ownerId === trip.ownerId); if (i < 0) list.push(trip); else list[i] = trip; localStorage.setItem('travelmate-trips', JSON.stringify(list)); },
    queueTripSave: trip => q.saves.push(trip), onAuthChange: async () => () => {},
    listTripChangeEvents: async () => [], getTripChangeReadState: async () => null, listTripMembers: async () => [], subscribeToTripChangeEvents: async () => () => {}
  };
  q.release = () => { q.hold = false; q.waits.splice(0).forEach(r => r()); };
}
async function boot(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    if (!localStorage.getItem('receipt-qa-seeded')) {
      localStorage.setItem('receipt-qa-seeded', '1'); localStorage.setItem('travelmate-active-user', 'qa');
      localStorage.setItem('travelmate-trips', JSON.stringify([{ id: 'receipt-qa', ownerId: 'qa', city: 'Synthetic', country: 'Czechia', start: '2026-10-21', end: '2026-10-23', days: 3, budget: 100, planInitialized: true, activities: [], savedPlaces: [], expenses: [{ id: 7, amount: 10, currency: 'CZK', category: 'Food', date: '2026-10-21', note: 'synthetic old receipt', receiptPath: 'qa/receipts/receipt-qa/old' }] }]));
    }
  });
  await page.route('**/assets/supabase-config.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'window.TRAVELMATE_SUPABASE={documentBucket:"travel-documents"};' }));
  await page.route('**/assets/cloud-sync.js*', r => r.fulfill({ contentType: 'text/javascript', body: '(' + cloudBoundary.toString() + ')();' }));
  await page.goto('/trip/custom/index.html?id=receipt-qa&view=budget', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-receipt-form]')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}
const canonical = page => page.evaluate(() => TravelMateTripStore.getTrip('receipt-qa', 'qa'));
async function form(page, edit = true) {
  if (edit) {
    await page.locator('.expense-category-group > summary').first().click();
    await page.locator('[data-expense-id="7"] > summary').click();
    await page.locator('[data-expense-edit="7"]').click();
  }
  else await page.locator('[data-expense-toggle]').click();
  const f = page.locator('[data-receipt-form]'); await expect(f).toBeVisible();
  await f.locator('[name="amount"]').fill('42.5'); await f.locator('[name="note"]').fill('synthetic replacement');
  await f.locator('[name="category"]').selectOption({ index: 0 });
  await f.locator('[name="receiptFile"]').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic receipt') });
  return f;
}
async function submit(f) { await f.locator('button[type="submit"]').click(); await expect(f.locator('button[type="submit"]')).toBeEnabled(); }
async function idb(page, key) {
  return page.evaluate(key => new Promise((resolve, reject) => { const r = indexedDB.open('travelmate-private-receipts', 1); r.onsuccess = () => { const db = r.result, req = db.transaction('files').objectStore('files').get(key); req.onsuccess = () => { db.close(); resolve(req.result ? req.result.blob.size : null); }; req.onerror = reject; }; r.onerror = reject; }), key);
}
for (const width of [390, 430]) test.describe(width + ' RTL receipt persistence', () => {
  test.use({ viewport: { width, height: 844 } });
  test('quota preserves receipt and draft; retry saves once; remote reference defers cleanup', async ({ page }) => {
    await boot(page); const f = await form(page); await page.evaluate(() => { receiptQA.quota = true; }); await submit(f);
    await expect(f).toBeVisible(); await expect(f.locator('[name="amount"]')).toHaveValue('42.5');
    expect((await canonical(page)).expenses[0].receiptPath).toBe('qa/receipts/receipt-qa/old');
    expect(await page.evaluate(() => receiptQA.removals)).not.toContain('qa/receipts/receipt-qa/old');
    await page.evaluate(() => { receiptQA.quota = false; }); await submit(f); await expect(f).toBeHidden();
    const saved = await canonical(page); expect(saved.expenses).toHaveLength(1); expect(saved.expenses[0]).toMatchObject({ id: 7, amount: 42.5, currency: 'CZK' });
    expect(await page.evaluate(() => receiptQA.removals)).not.toContain('qa/receipts/receipt-qa/old');
    await page.evaluate(() => { const current = TravelMateTripStore.getTrip('receipt-qa', 'qa'); Object.assign(current, { syncStatus: 'synced', cloudRevision: Number(current.cloudRevision || 0) + 1, cloudUpdatedAt: '2026-10-21T09:00:00.000Z' }); delete current.syncMutationId; delete current.syncConflict; TravelMateCloud.upsertLocalTrip(current); receiptQA.remote = current; dispatchEvent(new Event('travelmate:trip-synced')); });
    await expect.poll(() => page.evaluate(() => receiptQA.removals)).toContain('qa/receipts/receipt-qa/old');
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('[data-receipt-form]')).toHaveCount(1); expect((await canonical(page)).expenses[0].receiptPath).toBe(saved.expenses[0].receiptPath);
  });
  test('null trip during upload does not close or claim success', async ({ page }) => {
    await boot(page); const f = await form(page); await page.evaluate(() => { receiptQA.hold = true; }); await f.locator('[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => receiptQA.waits.length)).toBe(1);
    await page.evaluate(() => { localStorage.setItem('travelmate-trips', '[]'); receiptQA.release(); }); await expect(f.locator('[type="submit"]')).toBeEnabled();
    await expect(f).toBeVisible(); expect(await page.evaluate(() => receiptQA.saves.length)).toBe(0); expect(await page.evaluate(() => receiptQA.removals)).not.toContain('qa/receipts/receipt-qa/old');
  });
  test('real IndexedDB fallback survives reload and commits before local cleanup', async ({ page }) => {
    await boot(page); const f = await form(page); await page.evaluate(() => { receiptQA.offline = true; }); await submit(f); await expect(f).toBeHidden();
    const local = (await canonical(page)).expenses[0]; expect(local.receiptPending).toBe(true); expect(await idb(page, local.receiptLocalKey)).toBeGreaterThan(0);
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('[data-receipt-form]')).toHaveCount(1);
    await expect.poll(async () => (await canonical(page)).expenses[0].receiptPending).toBe(false);
    await expect.poll(() => idb(page, local.receiptLocalKey)).toBe(null); expect((await canonical(page)).expenses[0].receiptLocalKey).toBeUndefined();
  });
  test('ABA while upload is pending cannot commit into returning account', async ({ page }) => {
    await boot(page); const f = await form(page); await page.evaluate(() => { receiptQA.hold = true; }); await f.locator('[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => receiptQA.waits.length)).toBe(1);
    await page.evaluate(() => { const original = TravelMateCloud.getLocalTrips(); for (const id of ['other', 'qa']) { localStorage.setItem('travelmate-active-user', id); dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { trips: id === 'qa' ? original : [] } })); } receiptQA.release(); });
    await expect(f.locator('[type="submit"]')).toBeEnabled(); expect(await page.evaluate(() => receiptQA.saves.length)).toBe(0); expect((await canonical(page)).expenses[0].receiptPath).toBe('qa/receipts/receipt-qa/old');
  });
  test('pending IndexedDB file survives quota on reload and online retry', async ({ page }) => {
    await boot(page); const f = await form(page); await page.evaluate(() => { receiptQA.offline = true; }); await submit(f); await expect(f).toBeHidden();
    const local = (await canonical(page)).expenses[0]; await page.evaluate(() => localStorage.setItem('receipt-qa-quota', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('[data-receipt-form]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => receiptQA.uploads.length)).toBe(1);
    expect((await canonical(page)).expenses[0].receiptLocalKey).toBe(local.receiptLocalKey); expect(await idb(page, local.receiptLocalKey)).toBeGreaterThan(0);
    await page.evaluate(() => { receiptQA.quota = false; dispatchEvent(new Event('online')); });
    await expect.poll(async () => (await canonical(page)).expenses[0].receiptPending).toBe(false); await expect.poll(() => idb(page, local.receiptLocalKey)).toBe(null);
  });
});
