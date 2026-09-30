const { test, expect } = require('@playwright/test');

const trip = {
  id: 'qa-back',
  country: 'Israel',
  city: 'Tel Aviv',
  start: '2026-09-29',
  end: '2026-10-16',
  days: 18,
  type: 'סולו',
  budget: 8819,
  planInitialized: true,
  dayNotes: {},
  savedPlaces: [],
  activities: []
};

async function seed(page) {
  await page.addInitScript(value => {
    localStorage.setItem('travelmate-trips', JSON.stringify([value]));
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-theme', 'light');
  }, trip);
}

test.use({ viewport: { width: 390, height: 844 } });

test('Android/browser Back closes Weather, returns sections to Overview, and protects Overview', async ({ page }) => {
  await seed(page);
  await page.route('**/api.open-meteo.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current: { temperature_2m: 27, apparent_temperature: 28, weather_code: 0 },
      daily: {
        time: ['2026-09-30'],
        temperature_2m_max: [30],
        temperature_2m_min: [22],
        weather_code: [0]
      }
    })
  }));

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto('/trip/custom/index.html?id=qa-back&view=overview', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.TravelMateHistory && window.TravelMateNavigation));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');

  const weather = page.locator('[data-weather-top-widget]');
  await expect(weather).toBeVisible();
  await weather.click();
  await expect(page.locator('#modal-weather-live')).toHaveClass(/open/);

  await page.goBack();
  await expect(page.locator('#modal-weather-live')).not.toHaveClass(/open/);
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');

  await page.evaluate(() => window.TravelMateNavigation.open('plan'));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'plan');
  await page.evaluate(() => window.TravelMateNavigation.open('places'));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'places');

  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');

  const overviewPath = new URL(page.url()).pathname;
  await page.goBack();
  await page.waitForTimeout(150);
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');
  expect(new URL(page.url()).pathname).toBe(overviewPath);

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});

test('direct non-Overview entry backs into Overview and cannot leave without the explicit top exit', async ({ page }) => {
  await seed(page);
  await page.goto('/trip/custom/index.html?id=qa-back&view=budget', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.TravelMateHistory && window.TravelMateNavigation));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'budget');

  await page.goBack();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');

  const path = new URL(page.url()).pathname;
  await page.goBack();
  await page.waitForTimeout(150);
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');
  expect(new URL(page.url()).pathname).toBe(path);

  const exit = page.locator('.mobile-trip-back,.hero-back').first();
  await expect(exit).toHaveAttribute('href', '../../index.html');
});
