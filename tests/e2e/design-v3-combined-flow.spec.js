'use strict';

const { test, expect } = require('@playwright/test');
const { open, trips } = require('./fixtures/all-trips-v3.cjs');

test.use({ serviceWorkers: 'block' });

const OWNER = 'alltrips-A';
const TRIP = 'alltrips-rome';
const FX_HOST = /(^|\.)(er-api\.com|exchangerate-api\.com|frankfurter\.dev|boi\.org\.il|ecb\.europa\.eu)$/i;

// Keep the real Cloud/TripStore and routed application. Only the fixture's
// synthetic client gains document metadata; no production service is contacted.
async function installDocumentBoundary(page) {
  await expect(page.locator('script[src*="document-vault.js"]')).toHaveCount(0);
  await page.evaluate(({ owner, trip }) => {
    const client = window.__travelMateSupabaseClient;
    if (!client || typeof client.from !== 'function' || !client.auth) {
      throw new Error('Expected the existing All Trips synthetic client');
    }
    if (window.combinedFlowQA) throw new Error('Document boundary already installed');
    const originalFrom = client.from;
    const originalStorage = client.storage;
    const row = (id, category, fileName, user = owner, tripId = trip) => ({
      id, category, file_name: fileName, note: 'Synthetic combined-flow metadata',
      user_id: user, trip_id: tripId, storage_path: `${user}/${tripId}/${id}.vault`,
      mime_type: 'text/plain', file_size: 20, encrypted: true,
      created_at: '2026-10-17T07:00:00Z'
    });
    const qa = window.combinedFlowQA = {
      requests: [], downloads: [],
      rows: [
        row('combined-flight-one', 'flights', 'Synthetic Journey Flight One.txt'),
        row('combined-flight-two', 'flights', 'Synthetic Flight Two.txt'),
        row('combined-lodging', 'lodging', 'Synthetic Journey Lodging.txt'),
        row('foreign-owner-sentinel', 'flights', 'FOREIGN OWNER SENTINEL.txt', 'alltrips-B'),
        row('foreign-trip-sentinel', 'flights', 'FOREIGN TRIP SENTINEL.txt', owner, 'alltrips-tokyo')
      ],
      client, auth: client.auth, originalFrom,
      cloud: window.TravelMateCloud, store: window.TravelMateTripStore,
      getClient: window.TravelMateCloud.getClient,
      getPrivateStorageSession: window.TravelMateCloud.getPrivateStorageSession,
      getTrip: window.TravelMateTripStore.getTrip
    };
    client.from = function (table, ...args) {
      if (table !== 'travel_documents') return originalFrom.call(this, table, ...args);
      const filters = [];
      let selected = null, order = null, limit = null;
      const query = {
        select(columns) { selected = columns; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order(key, options) { order = { key, options }; return query; },
        limit(value) { limit = value; return query; },
        then(resolve, reject) {
          let data = qa.rows.filter(record => filters.every(([key, value]) => record[key] === value));
          if (order) data = data.slice().sort((a, b) => String(a[order.key]).localeCompare(String(b[order.key])) * (order.options?.ascending === false ? -1 : 1));
          if (limit != null) data = data.slice(0, limit);
          qa.requests.push({ table, selected, filters: filters.map(pair => pair.slice()), order, returnedIds: data.map(record => record.id) });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    };
    // Any accidental storage download is recorded and fails; search must use
    // metadata only. Other storage methods retain their existing behavior.
    client.storage = Object.assign({}, originalStorage, {
      from(bucket, ...args) {
        const originalBucket = originalStorage?.from?.call(originalStorage, bucket, ...args);
        return Object.assign({}, originalBucket, {
          async download(storagePath) {
            qa.downloads.push({ bucket, storagePath });
            throw new Error('Unexpected storage download during metadata-only flow');
          }
        });
      }
    });
  }, { owner: OWNER, trip: TRIP });
}

async function canonical(page) {
  return page.evaluate(({ owner, id }) => {
    const cloud = window.TravelMateCloud;
    if (!cloud || typeof cloud.getCachedTrips !== 'function') throw new Error('Canonical cloud cache unavailable');
    const trip = cloud.getCachedTrips().find(record => record.id === id && record.ownerId === owner);
    if (!trip) throw new Error('Canonical trip/owner missing');
    const storeTrip = window.TravelMateTripStore?.getTrip(id, owner);
    if (window.TravelMateTripStore && (!storeTrip || storeTrip.id !== id || storeTrip.ownerId !== owner)) {
      throw new Error('TripStore and Cloud identity disagree');
    }
    return { id: trip.id, ownerId: trip.ownerId, expenses: trip.expenses || [], storeExpenses: storeTrip ? storeTrip.expenses || [] : trip.expenses || [] };
  }, { owner: OWNER, id: TRIP });
}

async function assertBoundaryPreserved(page) {
  expect(await page.evaluate(() => {
    const qa = window.combinedFlowQA;
    return Boolean(qa && window.__travelMateSupabaseClient === qa.client && qa.client.auth === qa.auth &&
      window.TravelMateCloud === qa.cloud && window.TravelMateTripStore === qa.store &&
      qa.cloud.getClient === qa.getClient && qa.cloud.getPrivateStorageSession === qa.getPrivateStorageSession &&
      qa.store.getTrip === qa.getTrip);
  }), 'Canonical facades and original auth must remain intact').toBe(true);
}

async function assertScreen(page, theme, selectors) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe('rtl');
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
  for (const selector of selectors) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, selector).not.toBeNull();
    expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);
    expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(overflow.viewport + 1);
  }
}

async function navigateWithDrawer(page, view) {
  const more = page.locator('[data-shell-more]');
  await expect(more).toBeVisible();
  await more.click();
  const drawer = page.locator('.workspace > .sidebar:visible');
  await expect(drawer).toBeVisible();
  const link = drawer.locator(`[data-view="${view}"]`);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', view);
  await expect(drawer).toBeHidden();
}

for (const width of [390, 430]) for (const theme of ['light', 'dark']) {
  test(`combined real-route flow ${width}px ${theme} RTL`, async ({ page, context }, testInfo) => {
    const errors = [], blockedExternal = [], fxRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) return route.continue();
      blockedExternal.push(url.hostname);
      if (FX_HOST.test(url.hostname)) fxRequests.push(url.hostname);
      return route.abort();
    });
    const screenshot = async name => {
      const file = testInfo.outputPath(`${name}-${width}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      await testInfo.attach(name, { path: file, contentType: 'image/png' });
    };
    try {
      await page.setViewportSize({ width, height: 900 });
      // The known cache seam prevents the app's initial FX hydration from
      // requesting remote rates. EUR identity still executes its real renderer.
      await page.addInitScript(() => {
        if (location.origin !== 'http://127.0.0.1:4173') return;
        localStorage.setItem('travelmate-eur-rates:EUR', JSON.stringify({
          rate: 3.7, rates: { EUR: 1, ILS: 3.7 }, ilsRates: { EUR: 3.7, ILS: 1 },
          date: '2026-10-17T07:30:00Z', savedAt: new Date('2026-10-17T07:30:00Z').getTime(),
          source: 'Synthetic combined QA cache', sourceUrl: 'https://example.invalid/synthetic-fx'
        }));
      });
      await open(page, { theme, records: structuredClone(trips) });
      const baseline = await canonical(page);
      expect(baseline).toMatchObject({ id: TRIP, ownerId: OWNER });
      expect(baseline.storeExpenses).toEqual(baseline.expenses);
      await assertScreen(page, theme, ['[data-home-trip-search]', '[data-home-filter="active"]', '[data-cloud-trip="alltrips-rome"] a']);
      await screenshot('01-all-trips');

      await page.locator('[data-cloud-trip="alltrips-rome"] a').click();
      await expect(page).toHaveURL(/\/trip\/custom\/index\.html\?id=alltrips-rome/);
      await expect(page.locator('#overview [data-city]')).toHaveText('\u05e8\u05d5\u05de\u05d0');
      await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');
      await expect.poll(() => canonical(page)).toEqual(baseline);
      await installDocumentBoundary(page);
      await assertScreen(page, theme, ['[data-shell-view="overview"]', '[data-shell-more]', '#overview .hero-back']);
      await screenshot('02-overview');

      await navigateWithDrawer(page, 'budget');
      const toggle = page.locator('[data-expense-toggle]');
      await expect(toggle).toBeVisible();
      await assertScreen(page, theme, ['[data-expense-toggle]', '[data-converter-from]', '[data-converter-to]', '[data-converter-swap]']);
      await toggle.focus();
      await page.keyboard.press('Enter');
      const form = page.locator('[data-receipt-form]');
      const amount = form.locator('[name="amount"]');
      await expect(amount).toBeFocused();
      await amount.fill('42.50');
      await assertScreen(page, theme, ['[data-receipt-form] [name="amount"]', '[data-expense-cancel]']);
      await form.locator('[data-expense-cancel]').click();
      await expect(form).toBeHidden();
      await expect(toggle).toBeFocused();
      expect((await canonical(page)).expenses).toHaveLength(baseline.expenses.length);
      expect(await canonical(page)).toEqual(baseline);

      const converter = page.locator('[data-currency-converter]');
      await converter.locator('[data-converter-from]').selectOption('EUR');
      await converter.locator('[data-converter-to]').selectOption('EUR');
      await converter.locator('[data-converter-amount]').fill('0');
      await expect(converter).toHaveAttribute('data-quote-state', 'ready');
      await expect(converter.locator('[data-converter-result] strong')).toContainText('0');
      await expect(converter.locator('[data-converter-result]')).toContainText('1 EUR = 1 EUR');
      expect(fxRequests, 'No external FX request, including initial hydration').toEqual([]);
      expect(await canonical(page)).toEqual(baseline);
      await assertBoundaryPreserved(page);
      await screenshot('03-budget-cancel-and-zero');

      await navigateWithDrawer(page, 'documents');
      const library = page.locator('#documents .vault-library');
      await expect(library).toHaveAttribute('data-vault-library-state', 'locked');
      await expect(page.locator('#documents [data-document-id]:visible')).toHaveCount(3);
      await expect(page.locator('[data-document-id="foreign-owner-sentinel"]')).toHaveCount(0);
      await expect(page.locator('[data-document-id="foreign-trip-sentinel"]')).toHaveCount(0);
      await expect(page.locator('#documents')).not.toContainText('FOREIGN OWNER SENTINEL');
      await expect(page.locator('#documents')).not.toContainText('FOREIGN TRIP SENTINEL');
      const search = page.locator('[data-vault-search]');
      await assertScreen(page, theme, ['[data-vault-search]', '[data-document-filter="flights"]', '[data-shell-view="overview"]']);
      await search.fill('SYNTHETIC JOURNEY');
      await expect(page.locator('#documents [data-document-id]:visible')).toHaveCount(2);
      await page.locator('[data-document-filter="flights"]').click();
      await expect(page.locator('#documents [data-document-id]:visible')).toHaveCount(1);
      await expect(page.locator('[data-document-id="combined-flight-one"]')).toBeVisible();
      await search.fill('NO MATCH SYNTHETIC');
      await expect(library).toHaveAttribute('data-vault-library-state', 'no-results');
      await expect(page.locator('#documents [data-document-id]:visible')).toHaveCount(0);
      await assertScreen(page, theme, ['[data-vault-search-clear]']);
      await page.locator('[data-vault-search-clear]').click();
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      await expect(page.locator('[data-vault-search-clear]')).toBeHidden();
      await expect(page.locator('#documents [data-document-id]:visible')).toHaveCount(2);
      const metadata = await page.evaluate(() => ({ requests: combinedFlowQA.requests, downloads: combinedFlowQA.downloads }));
      expect(metadata.requests.length).toBeGreaterThan(0);
      for (const query of metadata.requests) {
        expect(query.table).toBe('travel_documents');
        expect(query.selected).toBe('*');
        expect(query.filters).toEqual(expect.arrayContaining([['user_id', OWNER], ['trip_id', TRIP]]));
        expect(query.order).toEqual({ key: 'created_at', options: { ascending: false } });
        expect(query.returnedIds.sort()).toEqual(['combined-flight-one', 'combined-flight-two', 'combined-lodging']);
      }
      expect(metadata.downloads).toEqual([]);
      expect(await canonical(page)).toEqual(baseline);
      await assertBoundaryPreserved(page);
      await testInfo.attach('document-query-scope', { body: Buffer.from(JSON.stringify(metadata, null, 2)), contentType: 'application/json' });
      await screenshot('04-documents-scoped-search');

      await page.locator('[data-shell-view="overview"]').click();
      await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');
      await expect(page.locator('#overview [data-city]')).toHaveText('\u05e8\u05d5\u05de\u05d0');
      await expect.poll(() => canonical(page)).toEqual(baseline);
      await assertBoundaryPreserved(page);
      expect(await page.evaluate(() => combinedFlowQA.downloads)).toEqual([]);
      await assertScreen(page, theme, ['#overview .hero-back', '[data-shell-more]']);
      await screenshot('05-overview-return');

      await page.locator('#overview .hero-back').click();
      await expect(page.locator('[data-home-trip-browser]')).toBeVisible();
      await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
      await expect.poll(() => canonical(page)).toEqual(baseline);
      await assertScreen(page, theme, ['[data-home-trip-search]', '[data-home-filter="active"]']);
      await screenshot('06-all-trips-return');
      expect(fxRequests).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await testInfo.attach('page-errors', { body: Buffer.from(JSON.stringify(errors, null, 2)), contentType: 'application/json' });
      await testInfo.attach('blocked-external-hosts', { body: Buffer.from(JSON.stringify({ blockedExternal, fxRequests }, null, 2)), contentType: 'application/json' });
      if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
        await screenshot('failure-current-screen');
      }
    }
  });
}
