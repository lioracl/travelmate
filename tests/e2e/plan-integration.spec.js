const { test, expect } = require('@playwright/test');

const trip = {
  id: 'qa-playwright',
  country: 'Czechia',
  city: 'Prague QA',
  start: '2026-09-28',
  end: '2026-10-02',
  days: 5,
  type: 'סולו',
  budget: 1000,
  planInitialized: true,
  dayNotes: {},
  savedPlaces: [],
  activities: [
    { id: 'past-1', date: '2026-09-28', time: '10:00', title: 'Old Town Walk', category: 'סיור', duration: 90, done: true, locationName: 'Old Town Square' },
    { id: 'today-1', date: '2026-09-29', time: '09:30', title: 'Breakfast near Wenceslas Square', category: 'אוכל', duration: 60, done: false, locationName: 'Wenceslas Square' },
    { id: 'today-2', date: '2026-09-29', time: '12:00', title: 'National Museum Visit', category: 'תרבות', duration: 120, done: false, locationName: 'National Museum, Prague' },
    { id: 'today-3', date: '2026-09-29', time: '16:00', title: 'Charles Bridge Walk', category: 'סיור', duration: 90, done: false, locationName: 'Charles Bridge' },
    { id: 'future-1', date: '2026-10-01', time: '11:00', title: 'Prague Castle', category: 'אטרקציה', duration: 150, done: false, locationName: 'Prague Castle' }
  ]
};

async function seed(page) {
  await page.addInitScript(value => {
    localStorage.setItem('travelmate-trips', JSON.stringify([value]));
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-theme', 'light');
  }, trip);
}

async function seedSavedPlaces(page) {
  const value = JSON.parse(JSON.stringify(trip));
  value.savedPlaces = [
    { id:'saved-only-1', name:'Saved Cafe', category:'בית קפה', description:'Saved for later', date:'', time:'10:00', lat:'50.081', lon:'14.425', imageResolutionVersion:3 },
    { id:'scheduled-1', name:'Scheduled Museum', category:'מוזיאון', description:'Already planned', date:'2026-09-29', time:'15:00', lat:'50.079', lon:'14.430', imageResolutionVersion:3 }
  ];
  await page.addInitScript(savedTrip => {
    localStorage.setItem('travelmate-trips', JSON.stringify([savedTrip]));
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-theme', 'light');
  }, value);
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
}

for (const viewport of [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Plan compact days and activity details', async ({ page }) => {
      await seed(page);
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));

      await page.goto('/trip/custom/index.html?id=qa-playwright&view=plan', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#plan')).toBeVisible();
      await expect(page.locator('.generated-day')).toHaveCount(5);

      const today = page.locator('.generated-day[data-day-date="2026-09-29"]');
      await expect(today).toBeVisible();
      await expect(today).not.toHaveClass(/day-collapsed/);

      for (const date of ['2026-09-30','2026-10-01','2026-10-02']) {
        await expect(page.locator('.generated-day[data-day-date="'+date+'"]')).toHaveClass(/day-collapsed/);
      }

      const pastStrip = page.locator('[data-past-days-strip]');
      await expect(pastStrip).toBeVisible();
      await expect(page.locator('.generated-day[data-day-date="2026-09-28"]')).not.toBeVisible();
      await pastStrip.locator('[data-open-past-day="2026-09-28"]').click();
      await expect(page.locator('.generated-day[data-day-date="2026-09-28"]')).toBeVisible();

      await expect(today.locator('.planned-activity.tm-plan-item')).toHaveCount(3);
      const first = today.locator('.planned-activity.tm-plan-item').nth(0);
      const second = today.locator('.planned-activity.tm-plan-item').nth(1);
      await expect(first.locator('.tm-plan-nav-action')).toBeVisible();
      await expect(first.locator('[data-toggle-done]')).toBeVisible();
      await expect(first.locator('[data-plan-details-toggle]')).toBeVisible();

      await first.locator('[data-plan-details-toggle]').click();
      await expect(first).toHaveClass(/tm-plan-expanded/);
      await second.locator('[data-plan-details-toggle]').click();
      await expect(second).toHaveClass(/tm-plan-expanded/);
      await expect(first).not.toHaveClass(/tm-plan-expanded/);

      const emptyDay = page.locator('.generated-day[data-day-date="2026-09-30"]');
      await emptyDay.locator('.badge').click();
      await expect(emptyDay.locator('.tm-plan-empty-day')).toBeVisible();
      await expect(emptyDay.locator('[data-add-date="2026-09-30"]')).toBeVisible();

      expect(await noHorizontalOverflow(page)).toBeTruthy();
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });

    test('Overview Today card is compact and reversible', async ({ page }) => {
      await seed(page);
      await page.goto('/trip/custom/index.html?id=qa-playwright&view=overview', { waitUntil: 'domcontentloaded' });

      const todayCard = page.locator('[data-trip-today]');
      await expect(todayCard).toBeVisible();
      await expect(todayCard).toHaveClass(/today-activities-card/);
      const toggle = todayCard.locator('.today-activities-toggle');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(todayCard.locator('[data-next-title]')).not.toHaveText('');

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(todayCard.locator('.today-activities-expanded')).toBeVisible();
      await todayCard.locator('.today-activities-less').click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      expect(await noHorizontalOverflow(page)).toBeTruthy();
    });


    test('Saved Places has a complete save-to-Plan lifecycle', async ({ page }) => {
      await seedSavedPlaces(page);
      page.on('dialog', dialog => dialog.accept());
      await page.goto('/trip/custom/index.html?id=qa-playwright&view=places', { waitUntil: 'domcontentloaded' });

      const shelf = page.locator('[data-saved-places-shelf]');
      await expect(shelf).toBeVisible();
      await expect(shelf.locator('[data-saved-places-count]')).toHaveText('2 מקומות');
      await expect(shelf.locator('[data-saved-places-scheduled]')).toHaveText('1');
      await expect(shelf.locator('[data-saved-places-unscheduled]')).toHaveText('1');

      let savedOnly = shelf.locator('[data-saved-shelf-id="saved-only-1"]');
      await savedOnly.locator('[data-saved-shelf-date]').selectOption('2026-09-30');
      await savedOnly.locator('[data-saved-shelf-time]').fill('14:15');
      await savedOnly.locator('[data-saved-shelf-schedule]').click();
      await expect(shelf.locator('[data-saved-places-scheduled]')).toHaveText('2');
      savedOnly = shelf.locator('[data-saved-shelf-id="saved-only-1"]');
      await expect(savedOnly.locator('[data-saved-shelf-open-plan]')).toBeVisible();

      let scheduled = shelf.locator('[data-saved-shelf-id="scheduled-1"]');
      await scheduled.locator('[data-saved-shelf-unschedule]').click();
      await expect(shelf.locator('[data-saved-places-scheduled]')).toHaveText('1');
      await expect(shelf.locator('[data-saved-places-unscheduled]')).toHaveText('1');
      scheduled = shelf.locator('[data-saved-shelf-id="scheduled-1"]');
      await scheduled.locator('[data-saved-shelf-delete]').click();
      await expect(shelf.locator('[data-saved-places-count]')).toHaveText('מקום אחד');

      savedOnly = shelf.locator('[data-saved-shelf-id="saved-only-1"]');
      await savedOnly.locator('[data-saved-shelf-open-plan]').click();
      await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'plan');
      await expect(page.locator('[data-saved-place-id="saved-only-1"]')).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBeTruthy();
    });
  });
}
