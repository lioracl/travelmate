const { test, expect } = require('@playwright/test');
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => { pageErrors.set(page, []); page.on('pageerror', error => pageErrors.get(page).push(String(error))); });
test.afterEach(async ({ page }) => { expect(pageErrors.get(page), 'unexpected page errors').toEqual([]); });
const displayMoney = (amount, currency) => new Intl.NumberFormat('he-IL', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);


// Existing custom-trip boot and canonical store; controlled data only, no real services.
async function boot(page, theme, fx = 'fresh') {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ theme, fx }) => {
    localStorage.setItem('travelmate-theme', theme);
    if (!localStorage.getItem('travelmate-trips')) localStorage.setItem('travelmate-trips', JSON.stringify([{
      id: 'qa-budget-v3', country: 'Czechia', city: 'Controlled Budget V3', start: '2026-10-17', end: '2026-10-20', days: 4,
      budget: 500, budgetUnlimited: false, activities: [], expenses: [], savedPlaces: [], planInitialized: true
    }]));
    if (fx !== 'missing') localStorage.setItem('travelmate-eur-rates:CZK', JSON.stringify({
      rate: 3.7, rates: { EUR: 1, CZK: fx === 'malformed' ? -25 : 25, ILS: 3.7 },
      ilsRates: { ILS: 1, EUR: 3.7, CZK: fx === 'malformed' ? -3.7 / 25 : 3.7 / 25 },
      source: 'Controlled FX mock', sourceUrl: 'https://example.invalid/fx',
      date: fx === 'stale' ? '2020-01-01' : new Date().toISOString(), savedAt: fx === 'stale' ? 1 : Date.now()
    }));
  }, { theme, fx });
  await page.goto('/trip/custom/index.html?id=qa-budget-v3&view=budget', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-expense-toggle]')).toBeVisible();
  await expect(page.locator('[data-currency-converter]')).toHaveCount(1);
}
async function canonical(page) { return page.evaluate(() => window.TravelMateTripStore.getTrip('qa-budget-v3')); }
async function fillExpense(page) {
  const form = page.locator('[data-receipt-form]');
  await form.locator('[name="amount"]').fill('42.50');
  await form.locator('[name="note"]').fill('Controlled manual expense');
  return form;
}
for (const width of [390, 430]) for (const theme of ['light', 'dark']) {
  test.describe(`Budget V3 ${width} RTL ${theme}`, () => {
    test.use({ viewport: { width, height: 844 } });
    test('manual expense is primary, canonical, single-save, keyboard accessible and contained', async ({ page }) => {
      await boot(page, theme);
      const toggle = page.locator('[data-expense-toggle]');
      await expect(toggle).toHaveAttribute('aria-controls', 'budget-expense-form');
      await toggle.focus(); await page.keyboard.press('Enter');
      const form = page.locator('[data-receipt-form]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(form.locator('[name="amount"]')).toBeFocused();
      await expect(form.locator('.expense-attachment')).not.toHaveAttribute('open');
      await fillExpense(page);
      await expect(form.locator('[name="currency"]')).toHaveValue('CZK');
      // Verify the duplicate-submit outcome; async pending-upload protection is covered by Node runtime tests.
      await form.evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      await expect(form).toBeHidden(); await expect(toggle).toBeFocused();
      const saved = await canonical(page);
      expect(saved.expenses).toHaveLength(1);
      expect(saved.expenses[0]).toMatchObject({ amount: 42.5, currency: 'CZK', note: 'Controlled manual expense', receiptPath: '' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
      for (const locator of [toggle, page.locator('[data-converter-swap]'), page.locator('[data-converter-from]'), page.locator('[data-converter-to]')]) {
        const box = await locator.boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await toggle.click(); await expect(form.locator('[name="amount"]')).toHaveValue('');
      await fillExpense(page); await form.locator('[data-expense-cancel]').click();
      expect((await canonical(page)).expenses).toHaveLength(1); await expect(toggle).toBeFocused();
      await toggle.click(); await fillExpense(page); await page.keyboard.press('Escape');
      await expect(form).toBeHidden(); expect((await canonical(page)).expenses).toHaveLength(1);
    });
    test('fresh conversion and swap show exact controlled amounts without mutating expenses', async ({ page }) => {
      await boot(page, theme);
      const before = (await canonical(page)).expenses;
      const card = page.locator('[data-currency-converter]'), result = card.locator('[data-converter-result]');
      await card.locator('[data-converter-amount]').fill('250');
      await card.locator('[data-converter-from]').selectOption('CZK'); await card.locator('[data-converter-to]').selectOption('ILS');
      await expect(card).toHaveAttribute('data-quote-state', 'ready');
      await expect(result.locator('strong bdi')).toHaveText(displayMoney(37, 'ILS') + ' · ILS');
      await expect(result).toContainText('1 CZK = 0.148 ILS');
      await expect(result).not.toContainText('שער ישן');
      await card.locator('[data-converter-swap]').click();
      await expect(card.locator('[data-converter-from]')).toHaveValue('ILS'); await expect(card.locator('[data-converter-to]')).toHaveValue('CZK');
      await expect(result.locator('strong bdi')).toHaveText(displayMoney(250 / 0.148, 'CZK') + ' · CZK');
      await expect(result).toContainText('1 ILS = 6.75676 CZK');
      expect((await canonical(page)).expenses).toEqual(before);
      await page.locator('[data-expense-toggle]').click(); const form = await fillExpense(page); await form.locator('[type="submit"]').click();
      const saved = (await canonical(page)).expenses;
      expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ amount: 42.5, currency: 'CZK', note: 'Controlled manual expense' });
      // Reload without boot(): the init script seeds trips only when absent.
      await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.locator('[data-expense-toggle]')).toBeVisible();
      await expect.poll(async () => (await canonical(page)).expenses).toEqual(saved);
    });
    test('optional receipt disclosure selects a file and scans through a controlled service', async ({ page }) => {
      await boot(page, theme);
      await page.evaluate(() => {
        if (!window.TravelMateCloud) throw new Error('Expected existing cloud service facade');
        window.__budgetReceiptMock = { calls: 0 };
        window.TravelMateCloud.getClient = async () => ({ functions: { invoke: async () => {
          window.__budgetReceiptMock.calls += 1;
          return new Promise(resolve => { window.__budgetReceiptMock.finish = resolve; });
        } } });
      });
      await page.locator('[data-expense-toggle]').click();
      const form = page.locator('[data-receipt-form]'), disclosure = form.locator('.expense-attachment'), scan = form.locator('[data-receipt-scan]');
      await expect(disclosure).not.toHaveAttribute('open'); await disclosure.locator('summary').focus(); await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('open', '');
      await form.locator('[name="receiptFile"]').setInputFiles({ name: 'controlled-receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      await expect(form.locator('[data-receipt-preview]')).toBeVisible();
      await scan.click(); await expect.poll(() => page.evaluate(() => window.__budgetReceiptMock.calls)).toBe(1);
      await expect(scan).toBeDisabled(); await expect(form.locator('[type="submit"]')).toBeDisabled();
      await scan.dispatchEvent('click'); expect(await page.evaluate(() => window.__budgetReceiptMock.calls)).toBe(1);
      await page.evaluate(() => window.__budgetReceiptMock.finish({ data: { receipt: { amount: 12.5, currency: 'CZK', merchant: 'Controlled receipt scan' } } }));
      await expect(form.locator('[name="amount"]')).toHaveValue('12.50'); await expect(form.locator('[name="note"]')).toHaveValue('Controlled receipt scan');
      await expect(scan).toBeEnabled(); await expect(form.locator('[type="submit"]')).toBeEnabled();
      expect((await canonical(page)).expenses).toHaveLength(0);
      await form.locator('[data-expense-cancel]').click(); await expect(page.locator('[data-expense-toggle]')).toBeFocused();
      expect((await canonical(page)).expenses).toHaveLength(0);
    });
    test('missing FX has no estimate, zero identity works offline, blank and invalid differ', async ({ page }) => {
      await boot(page, theme, 'missing');
      const card = page.locator('[data-currency-converter]'), result = card.locator('[data-converter-result]');
      await expect(card).toHaveAttribute('data-quote-state', 'unavailable');
      await expect(result).toContainText('אין שער'); await expect(result.locator('strong')).toHaveCount(0);
      await expect(result).toHaveAttribute('role', 'status');
      await card.locator('[data-converter-from]').selectOption('EUR'); await card.locator('[data-converter-to]').selectOption('EUR');
      await card.locator('[data-converter-amount]').fill('0');
      await expect(card).toHaveAttribute('data-quote-state', 'ready'); await expect(result.locator('strong')).toContainText('0');
      await expect(result).toContainText('1 EUR = 1 EUR');
      await card.locator('[data-converter-amount]').fill(''); await expect(card).toHaveAttribute('data-quote-state', 'empty'); await expect(result.locator('strong')).toHaveCount(0);
      await card.locator('[data-converter-amount]').fill('-1'); await expect(card).toHaveAttribute('data-quote-state', 'invalid'); await expect(result.locator('strong')).toHaveCount(0);
      // Expense records remain in their entered currency even without conversion data.
      await page.locator('[data-expense-toggle]').click(); const form = await fillExpense(page); await form.locator('[type="submit"]').click();
      expect((await canonical(page)).expenses[0]).toMatchObject({ amount: 42.5, currency: 'CZK' });
    });
    test('stale FX is labelled with source, date, currencies, rate and before-fee meaning', async ({ page }) => {
      await boot(page, theme, 'stale');
      const card = page.locator('[data-currency-converter]');
      await expect(card).toHaveAttribute('data-quote-state', 'ready');
      await expect(card.locator('[data-converter-result]')).toContainText('שער ישן');
      await expect(card.locator('[data-converter-result]')).toContainText('1 CZK =');
      await expect(card.locator('[data-converter-result]')).toContainText('לפני עמלת');
      await expect(card.locator('[data-converter-source]')).toContainText('Controlled FX mock');
      await expect(card.locator('[data-converter-source]')).toContainText('2020');
      expect(await card.locator('strong bdi').evaluate(e => getComputedStyle(e).direction)).toBe('ltr');
    });
    test('malformed FX never displays a misleading numeric estimate', async ({ page }) => {
      await boot(page, theme, 'malformed');
      const card = page.locator('[data-currency-converter]');
      await expect(card).toHaveAttribute('data-quote-state', 'unavailable');
      await expect(card.locator('[data-converter-result] strong')).toHaveCount(0);
      await expect(card.locator('[data-converter-source]')).toContainText('לא תקין');
    });
  });
}