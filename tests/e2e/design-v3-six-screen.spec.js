'use strict';
const { test, expect } = require('@playwright/test');
const { boot, documents, canonical, navigate, capture, layout, readability, mate, OWNER, ID } = require('./fixtures/six-screen-v3.cjs');
test.use({ serviceWorkers: 'block' });

for (const width of [390, 430]) for (const theme of ['light', 'dark']) {
  test('six-screen continuity/readability/MATE ' + width + ' ' + theme + ' RTL failed images', async ({ page, context }, testInfo) => {
    test.setTimeout(120000);
    const errors = [], aiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/travel-assistant|generativelanguage|api\.openai/.test(request.url())) aiRequests.push(request.url()); });
    const unchanged = async baseline => {
      expect(await canonical(page)).toEqual(baseline);
      expect(await page.evaluate(() => {
        const q = window.sixScreenQA;
        return !q || q.auth === window.__travelMateSupabaseClient.auth && q.cloud === window.TravelMateCloud && q.store === window.TravelMateTripStore && q.getTrip === q.store.getTrip && q.getClient === q.cloud.getClient;
      })).toBe(true);
    };
    try {
      await page.setViewportSize({ width, height: 900 });
      await boot(page, context, theme);
      const baseline = await canonical(page);
      expect(baseline).toMatchObject({ id: ID, ownerId: OWNER });
      await layout(page, theme); await capture(page, testInfo, '01-all-trips');

      await page.locator('[data-cloud-trip="alltrips-rome"] a').click();
      await expect(page.locator('#overview [data-city]')).toHaveText('\u05e8\u05d5\u05de\u05d0');
      await documents(page);
      await layout(page, theme); await unchanged(baseline); await mate(page, testInfo, 'overview', width);
      await capture(page, testInfo, '02-overview');

      await navigate(page, 'plan');
      const selected = page.locator('[data-plan-select-day="2026-10-19"]');
      await expect(selected).toBeVisible(); await selected.click();
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.generated-day[data-day-date="2026-10-19"]')).toBeVisible();
      await layout(page, theme); await unchanged(baseline); await mate(page, testInfo, 'plan', width);
      await capture(page, testInfo, '03-plan-selected-day');

      await navigate(page, 'places');
      await expect(page.locator('.places-v3-views')).toBeVisible();
      const savedPlacesView = page.locator('#places [data-nearby-places] .places-v3-views button[data-places-view="saved"]');
      await expect(savedPlacesView).toHaveCount(1);
      await expect(savedPlacesView).toBeVisible();
      await savedPlacesView.click();
      await page.locator('[data-places-saved-search]').fill('\u05e9\u05d7\u05d6\u05d5\u05e8');
      await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
      await expect(savedPlacesView).toHaveAttribute('aria-pressed', 'true');
      await layout(page, theme); await unchanged(baseline); await mate(page, testInfo, 'places', width);
      await capture(page, testInfo, '04-places-saved-state');

      await navigate(page, 'budget');
      const toggle = page.locator('[data-expense-toggle]'), form = page.locator('[data-receipt-form]');
      await expect(toggle).toBeVisible(); await toggle.click();
      await form.locator('[name="amount"]').fill('12.50');
      await form.locator('[data-expense-cancel]').click();
      await expect(toggle).toBeFocused(); await expect(form).toBeHidden();
      await page.locator('[data-converter-from]').selectOption('EUR');
      await page.locator('[data-converter-to]').selectOption('EUR');
      await page.locator('[data-converter-amount]').fill('0');
      await expect(page.locator('[data-currency-converter]')).toHaveAttribute('data-quote-state', 'ready');
      await expect(page.locator('[data-converter-result]')).toContainText('1 EUR = 1 EUR');
      await readability(page, testInfo, 'budget', ['#budget .budget-mode-badge', '#budget .currency-converter header p', '#budget .currency-converter>footer span', '#budget .currency-converter-result span']);
      await layout(page, theme); await unchanged(baseline); await mate(page, testInfo, 'budget', width);
      await capture(page, testInfo, '05-budget-semantic-readability');

      await navigate(page, 'documents');
      await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'locked');
      await expect(page.locator('[data-document-id]:visible')).toHaveCount(2);
      await expect(page.locator('[data-document-id="foreign-owner"],[data-document-id="foreign-trip"]')).toHaveCount(0);
      const search = page.locator('[data-vault-search]');
      await search.fill('flights');
      await page.locator('[data-document-filter="flights"]').click();
      await expect(page.locator('[data-document-id]:visible')).toHaveCount(1);
      await page.locator('[data-vault-search-clear]').click(); await expect(search).toBeFocused();
      // A text-only style probe on the real status element; auth, crypto,
      // records and storage are unchanged and no API method is replaced.
      await page.locator('[data-vault-status]').evaluate(node => { node.textContent = 'Synthetic status readability probe'; });
      await readability(page, testInfo, 'documents', ['#documents>.section-head h1', '#documents>.section-head p', '#documents .vault-head h2', '#documents .vault-head p', '#documents .vault-badge', '#documents .vault-unlock>small', '#documents .vault-lock-state', '#documents .vault-status']);
      const scope = await page.evaluate(() => ({ requests: sixScreenQA.requests, downloads: sixScreenQA.downloads }));
      expect(scope.requests.length).toBeGreaterThan(0);
      for (const query of scope.requests) {
        expect(query.filters).toEqual(expect.arrayContaining([['user_id', OWNER], ['trip_id', ID]]));
        expect(query.ids.sort()).toEqual(['six-flight', 'six-lodging']);
      }
      expect(scope.downloads).toEqual([]);
      await testInfo.attach('document-scope', { body: Buffer.from(JSON.stringify(scope, null, 2)), contentType: 'application/json' });
      await layout(page, theme); await unchanged(baseline); await mate(page, testInfo, 'documents', width);
      await capture(page, testInfo, '06-documents-semantic-readability');

      await navigate(page, 'overview'); await unchanged(baseline);
      await navigate(page, 'plan');
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.generated-day[data-day-date="2026-10-19"]')).toBeVisible();
      await unchanged(baseline);
      await navigate(page, 'places');
      await expect(savedPlacesView).toHaveCount(1);
      await expect(savedPlacesView).toBeVisible();
      await expect(savedPlacesView).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-places-saved-search]')).toHaveValue('\u05e9\u05d7\u05d6\u05d5\u05e8');
      await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
      await unchanged(baseline);
      await capture(page, testInfo, '07-plan-places-restored');

      await navigate(page, 'overview'); await page.locator('#overview .hero-back').click();
      await expect(page.locator('[data-home-trip-browser]')).toBeVisible();
      await expect.poll(() => canonical(page)).toEqual(baseline);
      await layout(page, theme); await capture(page, testInfo, '08-all-trips-return');
      expect(aiRequests, 'Opening/closing MATE must never submit the draft').toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await testInfo.attach('page-errors', { body: Buffer.from(JSON.stringify(errors, null, 2)), contentType: 'application/json' });
    }
  });
}
