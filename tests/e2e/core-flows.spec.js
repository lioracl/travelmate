const { test, expect } = require('@playwright/test');

function localDateKey(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

const trip = {
  id: 'qa-core',
  country: 'Italy',
  city: 'Rome QA',
  start: localDateKey(-1),
  end: localDateKey(3),
  days: 5,
  type: 'סולו',
  budget: 1000,
  budgetUnlimited: false,
  planInitialized: true,
  dayNotes: {},
  savedPlaces: [],
  activities: [],
  expenses: []
};

async function seed(page) {
  await page.addInitScript(value => {
    localStorage.setItem('travelmate-trips', JSON.stringify([value.trip]));
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-theme', 'light');
    localStorage.setItem('travelmate-accent', 'ocean');
    localStorage.setItem('travelmate-eur-rates:EUR', JSON.stringify({
      rate: 3.72,
      rates: { ILS: 3.72, USD: 1.17, GBP: 0.87, EUR: 1 },
      ilsRates: { ILS: 1, EUR: 3.72, USD: 3.1794871795, GBP: 4.275862069 },
      source: 'QA cache',
      sourceUrl: 'https://example.invalid/',
      date: value.rateDate,
      savedAt: Date.now()
    }));
  }, { trip, rateDate: localDateKey(0) });
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
}

for (const viewport of [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Budget supports unlimited mode and a local expense lifecycle', async ({ page }) => {
      await seed(page);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));

      await page.goto('/trip/custom/index.html?id=qa-core&view=budget', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'budget');
      await expect(page.locator('[data-budget-smart-summary]')).toBeVisible();
      await expect(page.locator('[data-currency-converter]')).toBeVisible();
      await expect(page.locator('[data-expense-workspace]')).toBeVisible();

      const budgetForm = page.locator('[data-total-budget-form]');
      await expect(budgetForm).toHaveCount(1);
      if (await budgetForm.isHidden()) await page.locator('.budget-settings-toggle').click();
      await expect(budgetForm).toBeVisible();

      await budgetForm.locator('input[name="budgetMode"][value="unlimited"]').evaluate(input => {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(budgetForm.locator('input[name="total"]')).toBeDisabled();
      await budgetForm.locator('button[type="submit"]').click();

      await expect.poll(async () => page.evaluate(() => {
        const trips = JSON.parse(localStorage.getItem('travelmate-trips') || '[]');
        return Boolean(trips[0] && trips[0].budgetUnlimited);
      })).toBeTruthy();

      await page.locator('[data-expense-toggle]').click();
      const expenseForm = page.locator('[data-receipt-form]');
      await expect(expenseForm).toBeVisible();
      await expenseForm.locator('input[name="amount"]').fill('42');
      await expenseForm.locator('input[name="note"]').fill('QA Coffee');
      await expenseForm.locator('select[name="currency"]').selectOption('EUR');
      await expenseForm.locator('button[type="submit"]').click();

      await expect(page.locator('[data-expense-records]')).toContainText('QA Coffee');
      await expect.poll(async () => page.evaluate(() => {
        const trips = JSON.parse(localStorage.getItem('travelmate-trips') || '[]');
        return trips[0] && Array.isArray(trips[0].expenses) && trips[0].expenses.some(item => item.note === 'QA Coffee' && Number(item.amount) === 42);
      })).toBeTruthy();

      expect(await noHorizontalOverflow(page)).toBeTruthy();
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });

    test('Documents loads its vault shell and category filtering without authentication', async ({ page }) => {
      await seed(page);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));

      await page.goto('/trip/custom/index.html?id=qa-core&view=documents', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'documents');
      await expect(page.locator('[data-documents-category-nav]')).toBeVisible();
      await expect(page.locator('[data-document-vault]')).toHaveCount(1);

      const insurance = page.locator('[data-document-filter="insurance"]');
      await insurance.click();
      await expect(insurance).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-document-group="insurance"]')).toBeVisible();
      await expect(page.locator('[data-document-group="flights"]')).toBeHidden();

      expect(await noHorizontalOverflow(page)).toBeTruthy();
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });

    test('Settings persists display mode and accent choice', async ({ page }) => {
      await seed(page);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));

      await page.goto('/trip/custom/index.html?id=qa-core&view=overview', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.TravelMateFeatures && window.TravelMateFeatures.load));
      await page.evaluate(() => window.TravelMateFeatures.load('account'));
      await page.waitForFunction(() => Boolean(window.TravelMateSettings && window.TravelMateSettings.open));
      await page.evaluate(() => window.TravelMateSettings.open());
      const dialog = page.locator('[data-security-dialog]');
      await expect(dialog).toBeVisible();

      await dialog.locator('[data-theme-choice="dark"]').click();
      await dialog.locator('[data-accent-choice="pink"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink');

      const stored = await page.evaluate(() => ({
        theme: localStorage.getItem('travelmate-theme'),
        accent: localStorage.getItem('travelmate-accent')
      }));
      expect(stored).toEqual({ theme: 'dark', accent: 'pink' });

      await dialog.locator('[data-security-close]').click();
      await expect(dialog).toBeHidden();
      expect(await noHorizontalOverflow(page)).toBeTruthy();
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });
  });
}
