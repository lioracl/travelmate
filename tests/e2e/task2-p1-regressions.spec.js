const { test, expect } = require('@playwright/test');

async function seed(page, theme, country = 'Italy', cachedRate = false) {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(({ theme, country, cachedRate }) => {
    localStorage.setItem('travelmate-theme', theme);
    localStorage.setItem('travelmate-active-user', 'task2-owner');
    if (!localStorage.getItem('travelmate-trips')) localStorage.setItem('travelmate-trips', JSON.stringify([{ id: 'task2-p1', ownerId: 'task2-owner', city: country === 'Japan' ? 'Tokyo QA' : 'Rome QA', country, start: '2026-10-14', end: '2026-10-18', days: 5, isActive: true, budget: 1000, budgetUnlimited: false, planInitialized: true, activities: [], savedPlaces: [], expenses: [], dayNotes: {} }]));
    if (cachedRate) localStorage.setItem('travelmate-eur-rates:JPY', JSON.stringify({ rate: 4, rates: { EUR: 1, ILS: 4, JPY: 200 }, ilsRates: { ILS: 1, EUR: 4, JPY: .02 }, source: 'Deterministic QA cache', date: '2026-10-14', savedAt: Date.now() }));
  }, { theme, country, cachedRate });
}

for (const width of [360, 390, 430]) for (const theme of ['light', 'dark']) {
  test.describe(width + ' RTL ' + theme, () => {
    test.use({ viewport: { width, height: 844 } });
    test('All Trips date editing opens, restores focus and persists dates', async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(String(error)));
      await seed(page, theme); await page.goto('/');
      const opener = page.locator('[data-trip-edit-dates]').first(); await opener.click();
      const editor = page.locator('.trip-date-editor'); await expect(editor).toBeVisible();
      await expect(editor.locator('[name=start]')).toBeFocused();
      await page.keyboard.press('Escape'); await expect(editor).toHaveCount(0); await expect(opener).toBeFocused();
      await opener.click(); await editor.locator('[name=end]').fill('2026-10-19'); await editor.locator('button[type=submit]').click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips'))[0].end)).toBe('2026-10-19');
      await page.reload(); await page.locator('[data-trip-edit-dates]').first().click(); await expect(page.locator('.trip-date-editor [name=end]')).toHaveValue('2026-10-19');
      expect(errors).toEqual([]);
    });
    for (const cachedRate of [false, true]) test('JPY budget save ' + (cachedRate ? 'uses dated cached rate' : 'preserves budget without a rate'), async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(String(error)));
      await seed(page, theme, 'Japan', cachedRate); await page.goto('/trip/custom/index.html?id=task2-p1&view=budget');
      const form = page.locator('[data-total-budget-form]'); await expect(form).toHaveCount(1);
      if (await form.isHidden()) await page.locator('.budget-settings-toggle').click();
      await form.locator('[name=total]').fill('10000'); await form.locator('button[type=submit]').click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips'))[0].budget)).toBe(cachedRate ? 50 : 1000);
      if (!cachedRate) {
        await expect(form.locator('[name=total]')).toHaveValue('10000');
        await form.locator('[name=budgetMode][value=unlimited]').evaluate(input => { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }); await form.locator('button[type=submit]').click();
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips'))[0].budgetUnlimited)).toBe(true);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips'))[0].budget)).toBe(1000);
      }
      expect(errors).toEqual([]);
    });
  });
}
