const { test, expect } = require('@playwright/test');

// Real app, navigation, lazy features, TripStore, WebCrypto and IndexedDB.
// Only cloud/auth/server storage are synthetic. No product function is replaced.
// Routed fixtures intentionally exclude service-worker/live-backend acceptance.
test.use({ serviceWorkers: 'block' });
test.describe.configure({ retries: 0 });
function sharedCloudBoundary() {
  const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const actor = () => localStorage.getItem('travelmate-active-user');
  const trips = () => read('travelmate-trips', []);
  const session = () => actor() ? { user: { id: actor(), email: actor() + '@example.invalid' } } : null;
  const q = window.integrationQA = { callbacks: [], holds: {}, waiters: {}, entered: {}, modes: read('rdi-modes', {}) };
  const audit = (type, detail = {}) => { const rows = read('rdi-audit', []); rows.push({ type, actor: actor(), ...detail }); write('rdi-audit', rows); };
  const kind = path => path.includes('/receipts/') ? 'receipt' : 'document';
  q.setModes = values => { Object.assign(q.modes, values); write('rdi-modes', q.modes); };
  q.release = name => { q.holds[name] = false; const waits = (q.waiters[name] || []).splice(0); audit('release', { kind: name, count: waits.length }); waits.forEach(fn => fn()); };
  q.transition = ids => {
    for (const id of ids) {
      if (actor()) write('rdi-trips:' + actor(), trips());
      if (id) localStorage.setItem('travelmate-active-user', id); else localStorage.removeItem('travelmate-active-user');
      write('travelmate-trips', id ? read('rdi-trips:' + id, []) : []);
      audit('auth-transition', { next: id });
      q.callbacks.forEach(fn => fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', session()));
      // This is the existing cloud -> application event boundary, not a router stub.
      dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { trips: trips() } }));
    }
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: fn => { q.callbacks.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => { q.transition([null]); return {}; }
    },
    rpc: async () => { throw Error('Unexpected RPC in combined synthetic boundary'); },
    storage: { from: () => ({
      upload: async (path, file) => {
        const resource = kind(path), bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        audit('upload-start', { kind: resource, path, size: bytes.length });
        if (q.holds[resource]) { q.entered[resource] = true; await new Promise(resolve => (q.waiters[resource] ||= []).push(resolve)); }
        audit('upload-return', { kind: resource, path });
        if (resource === 'receipt' && q.modes.offlineReceipt) return { error: Error('MFA_REQUIRED') };
        const objects = read('rdi-objects', {}); objects[path] = bytes; write('rdi-objects', objects);
        return {};
      },
      remove: async paths => {
        audit('remove-attempt', { paths });
        if (q.modes.failRemove) return { error: Error('synthetic offline cleanup') };
        const objects = read('rdi-objects', {}); paths.forEach(path => delete objects[path]); write('rdi-objects', objects);
        audit('remove-accepted', { paths }); return {};
      },
      download: async path => {
        audit('download-attempt', { path });
        throw Error('Unexpected download: no preview or private file is requested');
      }
    }) },
    from: table => {
      const filters = []; let cap = Infinity;
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit(value) { cap = value; return query; },
        async insert(row) {
          if (table !== 'travel_documents') throw Error('Unexpected insert table ' + table);
          audit('document-insert-attempt', { user: row.user_id, path: row.storage_path });
          if (q.modes.metadataFailure) return { error: Error('synthetic metadata failure') };
          const rows = read('rdi-documents', []); rows.push({ ...row, id: String(rows.length + 1), created_at: '2026-10-21T00:00:00Z' }); write('rdi-documents', rows);
          audit('document-insert-accepted', { user: row.user_id, path: row.storage_path }); return {};
        },
        then(resolve, reject) {
          let rows;
          if (table === 'travel_documents') rows = read('rdi-documents', []);
          else if (table === 'travel_trips') rows = read('rdi-server-trips', []).map(trip => ({ id: trip.id, user_id: trip.ownerId, revision: trip.cloudRevision, updated_at: trip.cloudUpdatedAt, payload: trip }));
          else throw Error('Unexpected select table ' + table);
          return Promise.resolve({ data: rows.filter(row => filters.every(([key, value]) => row[key] === value)).slice(0, cap) }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  window.TravelMateCloud = {
    getClient: async () => client, getSession: async () => session(),
    getPrivateStorageSession: async () => ({ client, session: session() }),
    getLocalTrips: trips, getTrip: async id => trips().find(trip => trip.id === id),
    upsertLocalTrip: trip => {
      audit('canonical-upsert-attempt', { owner: trip.ownerId, id: trip.id });
      if (q.modes.quota) throw Error('synthetic primary quota');
      const rows = trips(), index = rows.findIndex(t => t.id === trip.id && t.ownerId === trip.ownerId);
      if (index < 0) rows.push(trip); else rows[index] = trip;
      write('travelmate-trips', rows); if (actor()) write('rdi-trips:' + actor(), rows);
    },
    queueTripSave: trip => {
      audit('receipt-queue-attempt', { owner: trip.ownerId, trip });
      if (q.modes.queueFailure) throw Error('synthetic queue failure after canonical upsert');
      audit('receipt-queue-accepted', { owner: trip.ownerId, trip });
    },
    onAuthChange: async () => () => {}, listTripChangeEvents: async () => [], getTripChangeReadState: async () => null,
    listTripMembers: async () => [], subscribeToTripChangeEvents: async () => () => {}
  };
  q.cloud = window.TravelMateCloud;
}

const oldPath = 'A/receipts/integration-trip/old';
const originalKey = 'synthetic-original-passphrase';
const documentFile = { name: 'synthetic-document.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic document') };
const receiptFile = { name: 'synthetic-receipt.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic receipt') };
const persisted = (page, key, fallback = []) => page.evaluate(({ key, fallback }) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)), { key, fallback });
const audit = async (page, type) => (await persisted(page, 'rdi-audit')).filter(row => row.type === type);
const canonical = page => page.evaluate(() => TravelMateTripStore.getTrip('integration-trip', localStorage.getItem('travelmate-active-user')));
async function ready(page, documents = false) {
  await expect.poll(() => page.evaluate(() => Boolean(window.integrationQA && integrationQA.cloud === window.TravelMateCloud && window.TravelMateTripStore))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker && navigator.serviceWorker.controller))).toBe(false);
  if (documents) {
    await expect(page.locator('[data-document-vault]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => integrationQA.callbacks.length)).toBeGreaterThan(0);
    await expect.poll(() => page.locator('[data-vault-form]').evaluate(form => form.hidden)).toBe(false);
  } else await expect(page.locator('[data-receipt-form]')).toHaveCount(1);
}
async function navigate(page, view) {
  await page.locator('[data-mobile-menu]').click();
  await page.locator('.sidebar nav [data-view="' + view + '"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', view);
  await ready(page, view === 'documents');
}
async function boot(page, theme) {
  const evidence = { requests: { documents: 0, receipts: 0 }, choosers: 0, errors: [] };
  page.on('filechooser', () => evidence.choosers++); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort());
  await page.addInitScript(theme => {
    localStorage.setItem('travelmate-theme', theme);
    if (!localStorage.getItem('rdi-seeded')) {
      const makeTrip = ownerId => ({ id: 'integration-trip', ownerId, city: 'Synthetic', country: 'Czechia', start: '2026-10-21', end: '2026-10-23', days: 3, budget: 100, planInitialized: true, activities: [], savedPlaces: [], expenses: [{ id: 7, amount: ownerId === 'A' ? 10 : 77, currency: 'CZK', category: 'Food', date: '2026-10-21', note: 'synthetic old receipt', receiptPath: ownerId + '/receipts/integration-trip/old' }] });
      const a = makeTrip('A'), b = makeTrip('B'); localStorage.setItem('rdi-seeded', '1'); localStorage.setItem('travelmate-active-user', 'A');
      localStorage.setItem('travelmate-trips', JSON.stringify([a])); localStorage.setItem('rdi-trips:A', JSON.stringify([a])); localStorage.setItem('rdi-trips:B', JSON.stringify([b]));
      localStorage.setItem('rdi-server-trips', JSON.stringify([a, b])); localStorage.setItem('rdi-objects', JSON.stringify({ [a.expenses[0].receiptPath]: [1, 2, 3], [b.expenses[0].receiptPath]: [7, 8, 9] }));
    }
    window.integrationPickerClicks = 0;
    const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file' && this.closest('[data-vault-form]')) integrationPickerClicks++; return click.call(this); };
  }, theme);
  await page.route('**/assets/supabase-config.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'window.TRAVELMATE_SUPABASE={url:"https://example.invalid",publishableKey:"synthetic-only",documentBucket:"travel-documents"};' }));
  await page.route('**/assets/cloud-sync.js*', route => route.fulfill({ contentType: 'text/javascript', body: '(' + sharedCloudBoundary.toString() + ')();' }));
  await page.route('**/assets/document-vault.js*', route => { evidence.requests.documents++; return route.continue(); });
  await page.route('**/assets/trip-experience.js*', route => { evidence.requests.receipts++; return route.continue(); });
  await page.goto('/trip/custom/index.html?id=integration-trip&view=budget', { waitUntil: 'domcontentloaded' });
  await ready(page); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(0);
  await navigate(page, 'documents'); return evidence;
}
async function pendingDocument(page, nextKey = originalKey) {
  await page.locator('[data-vault-passphrase]').fill(originalKey);
  await page.evaluate(() => { integrationQA.holds.document = true; });
  await page.locator('[data-vault-form] [name="files"]').setInputFiles(documentFile);
  await expect.poll(() => page.evaluate(() => Boolean(integrationQA.entered.document))).toBe(true);
  await page.locator('[data-vault-passphrase]').fill(nextKey);
}
async function receiptDraft(page) {
  await navigate(page, 'budget');
  await page.locator('.expense-category-group > summary').first().click();
  await page.locator('[data-expense-id="7"] > summary').click(); await page.locator('[data-expense-edit="7"]').click();
  const form = page.locator('[data-receipt-form]'); await expect(form).toBeVisible();
  await form.locator('[name="amount"]').fill('42.5'); await form.locator('[name="note"]').fill('synthetic combined replacement');
  await form.locator('[name="category"]').selectOption({ index: 0 }); await form.locator('[name="receiptFile"]').setInputFiles(receiptFile); return form;
}
async function submit(form) { await form.locator('button[type="submit"]').click(); await expect(form.locator('button[type="submit"]')).toBeEnabled(); }
async function finishDocument(page) { await page.evaluate(() => integrationQA.release('document')); await expect(page.locator('.vault-upload-button')).toBeEnabled(); }
async function assertReceipt(page) {
  const trip = await canonical(page); expect(trip.ownerId).toBe('A'); expect(trip.expenses).toHaveLength(1);
  expect(trip.expenses[0]).toMatchObject({ id: 7, amount: 42.5, currency: 'CZK', receiptPending: false });
  expect(trip.expenses[0].receiptPath).toMatch(/^A\/receipts\/integration-trip\//); expect(trip.expenses[0].receiptPath).not.toBe(oldPath);
}
async function idbBytes(page, key) {
  return page.evaluate(key => new Promise((resolve, reject) => {
    const open = indexedDB.open('travelmate-private-receipts', 1); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, request = db.transaction('files').objectStore('files').get(key); request.onsuccess = () => { db.close(); resolve(request.result ? request.result.blob.size : null); }; request.onerror = () => { db.close(); reject(request.error); }; };
  }), key);
}

for (const width of [390, 430]) test.describe(width + ' RTL combined receipt/Documents', () => {
  // Behavioral theme sampling: all cases at 390/light and 430/dark; not visual QA.
  const theme = width === 390 ? 'light' : 'dark';
  test.use({ viewport: { width, height: 844 }, colorScheme: theme });
  for (const nextKey of ['', 'synthetic-replacement-passphrase']) for (const outcome of ['success', 'quota', 'queue']) test('pending document ' + (nextKey ? 'key change' : 'lock') + ' isolates receipt ' + outcome, async ({ page }) => {
    await boot(page, theme); await pendingDocument(page, nextKey); const form = await receiptDraft(page);
    await page.evaluate(outcome => integrationQA.setModes({ quota: outcome === 'quota', queueFailure: outcome === 'queue' }), outcome); await submit(form);
    if (outcome !== 'success') {
      await expect(form).toBeVisible(); await expect(form.locator('[name="amount"]')).toHaveValue('42.5');
      expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(0);
      if (outcome === 'quota') expect((await canonical(page)).expenses[0].receiptPath).toBe(oldPath);
    } else { await expect(form).toBeHidden(); await assertReceipt(page); }
    expect((await persisted(page, 'rdi-objects', {}))[oldPath]).toEqual([1, 2, 3]);
    await finishDocument(page); await expect(page.locator('[data-vault-passphrase]')).toHaveValue(nextKey);
    const documents = await persisted(page, 'rdi-documents'); expect(documents).toHaveLength(1); expect(documents[0]).toMatchObject({ user_id: 'A', trip_id: 'integration-trip', encrypted: true });
    expect(documents[0].storage_path).toMatch(/^A\/integration-trip\/.*\.vault$/);
    expect((await persisted(page, 'rdi-objects', {}))[documents[0].storage_path].length).toBe(documentFile.buffer.length + 16);
    const initialUploads = (await audit(page, 'upload-start')).filter(row => row.kind === 'receipt');
    expect(initialUploads).toHaveLength(1);
    const initialPath = initialUploads[0].path;
    if (outcome !== 'success') {
      await expect(form).toBeVisible(); await expect(form.locator('[name="amount"]')).toHaveValue('42.5');
      expect(await form.locator('[name="receiptFile"]').evaluate(input => input.files.length)).toBe(1);
      expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(0);
      const beforeRetry = await canonical(page);
      expect(beforeRetry.expenses[0].receiptPath).toBe(outcome === 'queue' ? initialPath : oldPath);
      // A partial upsert is recovered through saveTrip before this same submit
      // uploads the still-selected file as a subsequent replacement.
      await page.evaluate(() => {
        integrationQA.setModes({ quota: false, queueFailure: false });
        integrationQA.entered.receipt = false; integrationQA.holds.receipt = true;
      });
      await form.locator('button[type="submit"]').click();
      await expect.poll(() => page.evaluate(() => Boolean(integrationQA.entered.receipt))).toBe(true);
      await expect(form).toBeVisible(); await expect(form.locator('button[type="submit"]')).toBeDisabled();
      const recovery = await audit(page, 'receipt-queue-accepted');
      if (outcome === 'queue') {
        expect(recovery).toHaveLength(1);
        expect(recovery[0]).toMatchObject({ actor: 'A', owner: 'A', trip: { id: 'integration-trip', ownerId: 'A' } });
        expect(recovery[0].trip.expenses).toEqual(beforeRetry.expenses);
        expect(recovery[0].trip.expenses[0].receiptPath).toBe(initialPath);
        expect((await canonical(page)).expenses).toEqual(beforeRetry.expenses);
      } else {
        expect(recovery).toHaveLength(0);
        expect((await canonical(page)).expenses[0].receiptPath).toBe(oldPath);
      }
      const uploads = (await audit(page, 'upload-start')).filter(row => row.kind === 'receipt');
      expect(uploads).toHaveLength(2); expect(uploads[1].path).not.toBe(initialPath);
      expect(uploads[1]).toMatchObject({ actor: 'A', size: receiptFile.buffer.length });
      expect(uploads[1].path).toMatch(/^A\/receipts\/integration-trip\//);
      await page.evaluate(() => integrationQA.release('receipt'));
      await expect(form.locator('button[type="submit"]')).toBeEnabled(); await expect(form).toBeHidden();
      const accepted = await audit(page, 'receipt-queue-accepted');
      expect(accepted).toHaveLength(outcome === 'queue' ? 2 : 1);
      const final = await canonical(page), replacement = accepted[accepted.length - 1];
      expect(replacement).toMatchObject({ actor: 'A', owner: 'A', trip: { id: 'integration-trip', ownerId: 'A' } });
      expect(replacement.trip.expenses).toEqual(final.expenses);
      expect(final.expenses[0].receiptPath).toBe(uploads[1].path);
      const history = await persisted(page, 'rdi-audit');
      const secondUpload = history.findIndex(row => row.type === 'upload-start' && row.path === uploads[1].path);
      const finalAccepted = history.findIndex(row => row.type === 'receipt-queue-accepted' && row.trip.expenses[0].receiptPath === uploads[1].path);
      expect(finalAccepted).toBeGreaterThan(secondUpload);
      if (outcome === 'queue') expect(history.findIndex(row => row.type === 'receipt-queue-accepted' && row.trip.expenses[0].receiptPath === initialPath)).toBeLessThan(secondUpload);
    } else {
      expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(1);
      expect((await canonical(page)).expenses[0].receiptPath).toBe(initialPath);
    }
    await assertReceipt(page);
    expect((await persisted(page, 'rdi-objects', {}))[oldPath]).toEqual([1, 2, 3]);
    const removed = (await audit(page, 'remove-accepted')).flatMap(row => row.paths);
    expect(removed).not.toContain(oldPath); expect(removed).not.toContain('B/receipts/integration-trip/old');
    await navigate(page, 'documents'); await expect(page.locator('[data-vault-passphrase]')).toHaveValue(nextKey);
    if (!nextKey) {
      expect(await audit(page, 'download-attempt')).toHaveLength(0);
      await page.locator('[data-open-document]').first().click();
      await expect(page.locator('[data-vault-status]')).toHaveClass(/error/);
      await expect(page.locator('[data-vault-passphrase]')).toHaveValue('');
      await expect(page.locator('[data-vault-preview]')).toHaveCount(0);
      expect(await audit(page, 'download-attempt')).toHaveLength(0);
    }
    expect((await persisted(page, 'rdi-objects', {}))['B/receipts/integration-trip/old']).toEqual([7, 8, 9]);
  });

  for (const transition of ['logout', 'switch', 'ABA']) test(transition + ' while both uploads are pending fences the returning account', async ({ page }) => {
    await boot(page, theme); await pendingDocument(page, 'synthetic-newer-key'); const form = await receiptDraft(page);
    await page.evaluate(() => { integrationQA.holds.receipt = true; }); await form.locator('button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => Boolean(integrationQA.entered.receipt))).toBe(true);
    expect((await audit(page, 'upload-start')).map(row => row.kind).sort()).toEqual(['document', 'receipt']);
    const navigated = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() });
    await page.evaluate(transition => {
      integrationQA.transition(transition === 'logout' ? [null] : transition === 'switch' ? ['B'] : ['B', 'A']);
      integrationQA.release('document'); integrationQA.release('receipt');
    }, transition);
    await navigated; await page.waitForLoadState('domcontentloaded');
    await expect.poll(async () => (await audit(page, 'upload-return')).length).toBe(2);
    expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(0); expect(await audit(page, 'canonical-upsert-attempt')).toHaveLength(0);
    expect(await audit(page, 'document-insert-accepted')).toHaveLength(0); expect(await audit(page, 'document-insert-attempt')).toHaveLength(0);
    // A returning A session may legitimately clean its newly abandoned upload.
    // It must never remove either owner's existing receipt or act as B on A bytes.
    const startedPaths = (await audit(page, 'upload-start')).map(row => row.path);
    for (const removal of await audit(page, 'remove-accepted')) {
      expect(removal.actor).toBe('A');
      for (const path of removal.paths) { expect(startedPaths).toContain(path); expect(path).toMatch(/^A\//); }
    }
    const a = await persisted(page, 'rdi-trips:A'), b = await persisted(page, 'rdi-trips:B');
    expect(a[0].expenses[0]).toMatchObject({ id: 7, amount: 10, receiptPath: oldPath });
    expect(b[0].expenses[0]).toMatchObject({ id: 7, amount: 77, receiptPath: 'B/receipts/integration-trip/old' });
    expect((await persisted(page, 'rdi-objects', {}))[oldPath]).toEqual([1, 2, 3]);
    if (transition === 'logout') { expect(await page.evaluate(() => localStorage.getItem('travelmate-active-user'))).toBe(null); await expect(page).toHaveURL(/\/index\.html$/); }
    else {
      await ready(page); await navigate(page, 'documents'); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('');
      await expect(page.locator('[data-vault-form] [name="files"]')).toHaveValue('');
      expect((await canonical(page)).ownerId).toBe(transition === 'switch' ? 'B' : 'A');
    }
  });

  test('document metadata failure leaves accepted receipt and retry draft independent', async ({ page }) => {
    await boot(page, theme); await page.evaluate(() => integrationQA.setModes({ metadataFailure: true, failRemove: true }));
    await pendingDocument(page, 'synthetic-failure-key'); const form = await receiptDraft(page); await submit(form); await expect(form).toBeHidden(); await assertReceipt(page);
    const receipt = (await canonical(page)).expenses[0].receiptPath; await finishDocument(page);
    await navigate(page, 'documents'); await expect(page.locator('[data-vault-status]')).toHaveClass(/error/); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('synthetic-failure-key');
    expect(await persisted(page, 'rdi-documents')).toHaveLength(0); const cleanup = await persisted(page, 'travelmate-document-cleanup:A'); expect(cleanup).toHaveLength(1);
    expect(cleanup[0]).not.toBe(receipt); expect((await persisted(page, 'rdi-objects', {}))[receipt]).toBeDefined();
    await page.evaluate(() => { integrationQA.setModes({ metadataFailure: false, failRemove: false }); dispatchEvent(new Event('online')); });
    await expect.poll(() => persisted(page, 'travelmate-document-cleanup:A')).toEqual([]);
    await page.locator('[data-vault-form] [name="files"]').setInputFiles(documentFile); await expect(page.locator('.vault-upload-button')).toBeEnabled();
    await expect.poll(async () => (await persisted(page, 'rdi-documents')).length).toBe(1); await assertReceipt(page);
    expect((await canonical(page)).expenses[0].receiptPath).toBe(receipt); expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(1);
  });

  test('reload recovers receipt IndexedDB and document cleanup without crossing resources', async ({ page }) => {
    await boot(page, theme); await page.evaluate(() => integrationQA.setModes({ metadataFailure: true, failRemove: true, offlineReceipt: true }));
    await pendingDocument(page); const form = await receiptDraft(page); await submit(form); await expect(form).toBeHidden();
    const pending = (await canonical(page)).expenses[0]; expect(pending.receiptPending).toBe(true); expect(await idbBytes(page, pending.receiptLocalKey)).toBe(receiptFile.buffer.length);
    await finishDocument(page); const abandoned = await persisted(page, 'travelmate-document-cleanup:A'); expect(abandoned).toHaveLength(1);
    const attempts = (await audit(page, 'upload-start')).filter(row => row.kind === 'receipt').length;
    await page.evaluate(() => integrationQA.setModes({ offlineReceipt: false, quota: true, metadataFailure: false }));
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page);
    await expect.poll(async () => (await audit(page, 'upload-start')).filter(row => row.kind === 'receipt').length).toBeGreaterThan(attempts);
    expect((await canonical(page)).expenses[0].receiptLocalKey).toBe(pending.receiptLocalKey); expect(await idbBytes(page, pending.receiptLocalKey)).toBe(receiptFile.buffer.length);
    await navigate(page, 'documents'); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('');
    expect(await persisted(page, 'travelmate-document-cleanup:A')).toEqual(abandoned);
    await page.evaluate(() => { integrationQA.setModes({ quota: false, failRemove: false }); dispatchEvent(new Event('online')); });
    await expect.poll(async () => (await canonical(page)).expenses[0].receiptPending).toBe(false);
    await expect.poll(() => idbBytes(page, pending.receiptLocalKey)).toBe(null); await expect.poll(() => persisted(page, 'travelmate-document-cleanup:A')).toEqual([]);
    await assertReceipt(page); const receipt = (await canonical(page)).expenses[0].receiptPath;
    const objects = await persisted(page, 'rdi-objects', {}); expect(objects[receipt]).toBeDefined(); expect(objects[abandoned[0]]).toBeUndefined(); expect(objects[oldPath]).toEqual([1, 2, 3]);
    const removals = (await audit(page, 'remove-accepted')).flatMap(row => row.paths); expect(removals).toContain(abandoned[0]); expect(removals).not.toContain(receipt); expect(removals).not.toContain(oldPath);
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(page, true); await navigate(page, 'budget'); await assertReceipt(page);
    expect(await persisted(page, 'rdi-documents')).toHaveLength(0); expect(await persisted(page, 'travelmate-document-cleanup:A')).toEqual([]);
  });

  test('repeated canonical roundtrips retain one bootstrap and picker alongside receipt save', async ({ page }) => {
    const evidence = await boot(page, theme);
    for (let i = 0; i < 3; i++) { await navigate(page, 'budget'); await navigate(page, 'documents'); }
    for (const selector of ['[data-vault-pick]', '[data-document-group="personal"] > button']) {
      const before = evidence.choosers, chooser = page.waitForEvent('filechooser'); await page.locator(selector).click(); await chooser; expect(evidence.choosers).toBe(before + 1);
      await page.locator('[data-vault-form] [name="files"]').setInputFiles([]);
    }
    expect(await page.evaluate(() => integrationPickerClicks)).toBe(2);
    await pendingDocument(page, 'synthetic-roundtrip-key'); const form = await receiptDraft(page); await submit(form); await finishDocument(page);
    await navigate(page, 'documents'); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('synthetic-roundtrip-key');
    await expect(page.locator('[data-document-vault]')).toHaveCount(1); await expect(page.locator('[data-receipt-form]')).toHaveCount(1); await assertReceipt(page);
    expect(await persisted(page, 'rdi-documents')).toHaveLength(1); expect(await audit(page, 'receipt-queue-accepted')).toHaveLength(1);
    expect(evidence.requests).toEqual({ documents: 1, receipts: 1 }); expect(evidence.errors).toEqual([]);
  });
});
