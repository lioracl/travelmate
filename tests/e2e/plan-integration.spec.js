const { test, expect } = require('@playwright/test');

function localDateKey(offset) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

const dates = {
  past: localDateKey(-1),
  today: localDateKey(0),
  tomorrow: localDateKey(1),
  future2: localDateKey(2),
  future3: localDateKey(3)
};

const trip = {
  id: 'qa-playwright',
  country: 'Czechia',
  city: 'Prague QA',
  start: dates.past,
  end: dates.future3,
  days: 5,
  type: 'סולו',
  budget: 1000,
  planInitialized: true,
  dayNotes: {},
  savedPlaces: [],
  activities: [
    { id: 'past-1', date: dates.past, time: '10:00', title: 'Old Town Walk', category: 'סיור', duration: 90, done: true, locationName: 'Old Town Square' },
    { id: 'today-1', date: dates.today, time: '09:30', title: 'Breakfast near Wenceslas Square', category: 'אוכל', duration: 60, done: false, locationName: 'Wenceslas Square' },
    { id: 'today-2', date: dates.today, time: '12:00', title: 'National Museum Visit', category: 'תרבות', duration: 120, done: false, locationName: 'National Museum, Prague' },
    { id: 'today-3', date: dates.today, time: '16:00', title: 'Charles Bridge Walk', category: 'סיור', duration: 90, done: false, locationName: 'Charles Bridge' },
    { id: 'future-1', date: dates.future2, time: '11:00', title: 'Prague Castle', category: 'אטרקציה', duration: 150, done: false, locationName: 'Prague Castle' }
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
    { id:'scheduled-1', name:'Scheduled Museum', category:'מוזיאון', description:'Already planned', date:dates.today, time:'15:00', lat:'50.079', lon:'14.430', imageResolutionVersion:3 }
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

      const today = page.locator('.generated-day[data-day-date="'+dates.today+'"]');
      await expect(today).toBeVisible();
      await expect(today).not.toHaveClass(/day-collapsed/);

      for (const date of [dates.tomorrow, dates.future2, dates.future3]) {
        await expect(page.locator('.generated-day[data-day-date="'+date+'"]')).toHaveClass(/day-collapsed/);
      }

      const pastStrip = page.locator('[data-past-days-strip]');
      await expect(pastStrip).toBeVisible();
      await expect(page.locator('.generated-day[data-day-date="'+dates.past+'"]')).not.toBeVisible();
      await pastStrip.locator('[data-open-past-day="'+dates.past+'"]').click();
      await expect(page.locator('.generated-day[data-day-date="'+dates.past+'"]')).toBeVisible();

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

      const emptyDay = page.locator('.generated-day[data-day-date="'+dates.tomorrow+'"]');
      await emptyDay.locator('.badge').click();
      await expect(emptyDay.locator('.tm-plan-empty-day')).toBeVisible();
      await expect(emptyDay.locator('[data-add-date="'+dates.tomorrow+'"]')).toBeVisible();

      expect(await noHorizontalOverflow(page)).toBeTruthy();
      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });

    test('Overview V3 Today starts collapsed with a summary and expands accessibly', async ({ page }) => {
      await seed(page);
      await page.goto('/trip/custom/index.html?id=qa-playwright&view=overview', { waitUntil: 'domcontentloaded' });

      const todayCard = page.locator('[data-trip-today]');
      await expect(todayCard).toBeVisible();
      await expect(todayCard).toHaveClass(/today-activities-card/);
      const toggle = todayCard.locator('.today-activities-toggle');
      // The approved compact default remains part of the V3 UX contract.
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(todayCard.locator('.today-activities-expanded')).toBeHidden();
      await expect(todayCard.locator('.today-activities-summary')).toBeVisible();
      await expect(todayCard.locator('[data-next-title]')).not.toHaveText('');
      await expect(toggle).toHaveAttribute('aria-controls', await todayCard.locator('.today-activities-expanded').getAttribute('id'));

      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(todayCard.locator('.today-activities-expanded')).toBeVisible();
      await todayCard.locator('.today-activities-less').click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(todayCard.locator('.today-activities-summary')).toBeVisible();

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

      const savedToggle = shelf.locator('[data-saved-places-toggle]');
      if (await savedToggle.getAttribute('aria-expanded') === 'false') await savedToggle.click();
      await expect(savedToggle).toHaveAttribute('aria-expanded', 'true');

      let savedOnly = shelf.locator('[data-saved-shelf-id="saved-only-1"]');
      await savedOnly.locator('[data-saved-shelf-date]').selectOption(dates.tomorrow);
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
      const targetDay = page.locator('.generated-day[data-day-date="'+dates.tomorrow+'"]');
      const targetRow = page.locator('[data-saved-place-id="saved-only-1"]');
      await expect(targetDay).not.toHaveClass(/day-collapsed/);
      await expect(targetDay.locator('[data-toggle-day]').first()).toHaveAttribute('aria-expanded', 'true');
      await expect(targetRow).toBeVisible();
      await expect(targetRow).toBeFocused();
      expect(await noHorizontalOverflow(page)).toBeTruthy();
    });
  });
}

// Synthetic local trips only. These browser regressions need the supported CI
// preview; they do not exercise real accounts, cloud writes or physical devices.
async function seedUninitializedPlan(page, baseURL, view = 'overview') {
  const value = { ...trip, activities: [], savedPlaces: [], dayNotes: {} };
  delete value.planInitialized;
  const origin = new URL(baseURL).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(value => {
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-trips', JSON.stringify([value]));
    localStorage.setItem('travelmate-theme', 'light');
  }, value);
  await page.goto('/trip/custom/index.html?id=qa-playwright&view=' + view, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TravelMateFeatures && window.TravelMateNavigation);
  if (view === 'plan') { await page.evaluate(() => window.travelMateTripReady); return value; }
  await page.evaluate(async () => {
    await window.travelMateTripReady;
    const store = window.TravelMateTripStore;
    window.__planActivationWrites = [];
    window.TravelMateTripStore = Object.assign({}, store, {
      saveTripFields(...args) {
        if (args[2].includes('planInitialized')) window.__planActivationWrites.push(args[0].id);
        return store.saveTripFields(...args);
      }
    });
  });
  return value;
}

for (const gesture of ['pointerenter', 'touchstart']) {
  test('Plan speculative ' + gesture + ' is read-only until explicit navigation', async ({ page, baseURL }) => {
    await seedUninitializedPlan(page, baseURL);
    const before = await page.evaluate(() => JSON.stringify(window.TravelMateTripStore.getTrip('qa-playwright')));
    await page.locator('[data-view="plan"]').first().dispatchEvent(gesture);
    // Drain any speculative feature request deterministically without starting it.
    await page.evaluate(async () => {
      await window.TravelMateFeatures.load('overview');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    expect(await page.evaluate(() => JSON.stringify(window.TravelMateTripStore.getTrip('qa-playwright')))).toBe(before);
    expect(await page.evaluate(() => window.__planActivationWrites)).toEqual([]);
    await expect(page.locator('link[data-travelmate-style="auto-planner.css"]')).toHaveCount(0);
    await expect(page.locator('script[src*="/auto-planner.js"]')).toHaveCount(0);
    await expect(page.locator('.planner-toolbar')).toHaveCount(0);
    await page.evaluate(() => window.TravelMateNavigation.open('plan'));
    await expect(page.locator('.planner-toolbar')).toHaveCount(1);
    await expect(page.locator('.planner-composer')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__planActivationWrites.length)).toBe(1);
    expect(await page.evaluate(() => window.TravelMateTripStore.getTrip('qa-playwright').activities.length)).toBe(trip.days);
    await page.evaluate(() => window.TravelMateNavigation.open('overview'));
    await page.evaluate(() => window.TravelMateNavigation.open('plan'));
    await expect(page.locator('.planner-toolbar')).toHaveCount(1);
    expect(await page.evaluate(() => window.__planActivationWrites.length)).toBe(1);
  });
}

test('pending Plan readiness cannot initialize after leaving and re-entry retries', async ({ page, baseURL }) => {
  await seedUninitializedPlan(page, baseURL);
  await page.evaluate(() => {
    window.travelMateTripReady = new Promise(resolve => { window.__resolvePlanReadiness = resolve; });
    window.TravelMateNavigation.open('plan');
  });
  await page.evaluate(() => window.TravelMateFeatures.load('plan'));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'plan');
  await page.evaluate(() => window.TravelMateNavigation.open('overview'));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'overview');
  await page.evaluate(async () => { window.__resolvePlanReadiness(); await window.travelMateTripReady; });
  await expect(page.locator('.planner-toolbar')).toHaveCount(0);
  expect(await page.locator('[data-generated-days]').getAttribute('data-enhanced')).toBeNull();
  expect(await page.evaluate(() => window.__planActivationWrites)).toEqual([]);
  expect(await page.evaluate(() => window.TravelMateTripStore.getTrip('qa-playwright').planInitialized)).toBeUndefined();
  await page.evaluate(() => window.TravelMateNavigation.open('plan'));
  await expect(page.locator('.planner-toolbar')).toHaveCount(1);
  expect(await page.evaluate(() => window.__planActivationWrites.length)).toBe(1);
});

test('Plan reads canonical activities arriving during readiness', async ({ page, baseURL }) => {
  await seedUninitializedPlan(page, baseURL);
  await page.evaluate(() => {
    window.travelMateTripReady = new Promise(resolve => { window.__resolvePlanReadiness = resolve; });
    window.TravelMateNavigation.open('plan');
  });
  await page.evaluate(() => window.TravelMateFeatures.load('plan'));
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'plan');
  await page.evaluate(() => {
    const store = window.TravelMateTripStore;
    const fresh = JSON.parse(JSON.stringify(store.getTrip('qa-playwright')));
    fresh.activities = [{ id: 'arrived-during-readiness', title: 'Keep canonical activity', date: fresh.start, time: '12:00', duration: 60 }];
    fresh.budget = 4321;
    store.saveTrip(fresh, { queue: false });
    window.__resolvePlanReadiness();
  });
  await expect(page.locator('.planner-toolbar')).toHaveCount(1);
  const current = await page.evaluate(() => window.TravelMateTripStore.getTrip('qa-playwright'));
  expect(current.activities.map(item => item.id)).toEqual(['arrived-during-readiness']);
  expect(current.budget).toBe(4321);
  expect(current.planInitialized).toBe(true);
  expect(await page.evaluate(() => window.__planActivationWrites.length)).toBe(1);
});

test('direct Plan startup still supplies first-entry defaults once', async ({ page, baseURL }) => {
  await seedUninitializedPlan(page, baseURL, 'plan');
  await expect(page.locator('.planner-toolbar')).toHaveCount(1);
  await expect(page.locator('.planner-composer')).toHaveCount(1);
  const current = await page.evaluate(() => window.TravelMateTripStore.getTrip('qa-playwright'));
  expect(current.planInitialized).toBe(true);
  expect(current.activities).toHaveLength(trip.days);
  await page.evaluate(() => window.TravelMateNavigation.open('overview'));
  await page.evaluate(() => window.TravelMateNavigation.open('plan'));
  await expect(page.locator('.planner-toolbar')).toHaveCount(1);
  expect(await page.evaluate(() => window.TravelMateTripStore.getTrip('qa-playwright').activities)).toEqual(current.activities);
});
