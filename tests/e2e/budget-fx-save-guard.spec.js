const { test, expect } = require('@playwright/test');

// FX data is a controlled mock, never a live quote. All external requests are blocked.
async function seed(page, theme, currency, quoted) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ theme, currency, quoted }) => {
    localStorage.setItem('travelmate-theme', theme);
    if (!localStorage.getItem('travelmate-trips')) localStorage.setItem('travelmate-trips', JSON.stringify([{
      id: 'qa-budget-fx', country: currency === 'EUR' ? 'Italy' : 'Czechia',
      city: 'Controlled Budget QA', start: '2026-10-11', end: '2026-10-15', days: 5,
      type: 'סולו', budget: 500, budgetUnlimited: true, budgetFx: { previous: true },
      activities: [], expenses: [], savedPlaces: [], planInitialized: true
    }]));
    if (quoted) localStorage.setItem('travelmate-eur-rates:' + currency, JSON.stringify({
      rate: 3.7, rates: { EUR: 1, CZK: 25, ILS: 3.7 },
      ilsRates: { ILS: 1, EUR: 3.7, CZK: 3.7 / 25 },
      source: 'Controlled FX mock', sourceUrl: 'https://example.invalid/fx',
      date: '2026-10-11', savedAt: 1
    }));
  }, { theme, currency, quoted });
  await page.goto('/trip/custom/index.html?id=qa-budget-fx&view=budget', { waitUntil: 'domcontentloaded' });
  const form = page.locator('[data-total-budget-form]');
  await expect(form).toHaveCount(1);
  if (await form.isHidden()) await page.locator('.budget-settings-toggle').click();
  await expect(form).toBeVisible();
  await form.locator('label:has([name="budgetMode"][value="limited"])').click();
  return form;
}
async function canonical(page) {
  return page.evaluate(() => window.TravelMateTripStore.getTrip('qa-budget-fx'));
}
for (const width of [360, 390, 430]) for (const theme of ['light', 'dark']) {
  test.describe(width + ' RTL ' + theme, () => {
    test.use({ viewport: { width, height: 844 } });
    test('missing foreign quote preserves canonical data; unlimited works offline', async ({ page }) => {
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      const form = await seed(page, theme, 'CZK', false);
      await form.locator('[name="total"]').fill('250');
      await form.locator('[type="submit"]').click();
      await expect(page.locator('.trip-experience-toast')).toContainText('התקציב הקודם לא השתנה');
      let saved = await canonical(page);
      expect(saved.budget).toBe(500); expect(saved.budgetUnlimited).toBe(true);
      expect(saved.budgetFx).toEqual({ previous: true });
      await form.locator('label:has([name="budgetMode"][value="unlimited"])').click();
      await form.locator('[type="submit"]').click();
      saved = await canonical(page);
      expect(saved.budget).toBe(500); expect(saved.budgetUnlimited).toBe(true);
      expect(saved.budgetFx).toEqual({ previous: true });
      expect(errors).toEqual([]);
    });
    test('cached quote saves EUR with source/date and survives canonical reload', async ({ page }) => {
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      const form = await seed(page, theme, 'CZK', true);
      await expect(page.locator('[data-converter-source]')).toContainText('שער שמור מהמכשיר');
      await form.locator('[name="total"]').fill('250');
      await form.locator('[type="submit"]').click();
      const saved = await canonical(page);
      expect(saved.budget).toBe(10); expect(saved.budgetUnlimited).toBe(false);
      expect(saved.budgetFx).toMatchObject({ enteredAmount: 250, enteredCurrency: 'CZK', storedCurrency: 'EUR', eurToEnteredCurrencyRate: 25, source: 'Controlled FX mock', rateDate: '2026-10-11', stale: true });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-total-budget-form]')).toHaveCount(1);
      expect((await canonical(page)).budgetFx).toEqual(saved.budgetFx);
      expect(errors).toEqual([]);
    });
    test('EUR identity offline uses keyboard submit and preserves RTL geometry', async ({ page }) => {
      const form = await seed(page, theme, 'EUR', false);
      const input = form.locator('[name="total"]');
      await input.fill('125'); await input.focus(); await page.keyboard.press('Enter');
      expect((await canonical(page)).budget).toBe(125);
      expect((await canonical(page)).budgetFx.source).toBe('identity');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
      const snapshot = await input.ariaSnapshot();
      expect(snapshot).toContain('spinbutton');
      await input.focus(); await page.keyboard.press('Tab');
      await expect(form.locator('[type="submit"]')).toBeFocused();
    });
  });
}
