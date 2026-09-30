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
  id: 'qa-flexible',
  country: 'Israel',
  city: 'Tel Aviv',
  start: localDateKey(0),
  end: localDateKey(2),
  days: 3,
  type: 'סולו',
  budget: 1000,
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

async function addActivity(page, options) {
  await page.locator('[data-new-activity]').click();
  const form = page.locator('.planner-composer');
  await expect(form).toBeVisible();
  await form.locator('input[name="time"]').fill(options.time);
  await form.locator('input[name="title"]').fill(options.title);
  await form.locator('select[name="duration"]').selectOption(String(options.duration || 60));
  await form.locator('select[name="scheduleMode"]').selectOption(options.mode);
  if (options.mode === 'window') {
    await form.locator('input[name="windowStart"]').fill(options.windowStart);
    await form.locator('input[name="windowEnd"]').fill(options.windowEnd);
  }
  await form.locator('button[type="submit"]').click();
  await expect(form).toBeHidden();
}

test.use({ viewport: { width: 390, height: 844 } });

test('Flexible, window and fixed activities persist distinct timing semantics', async ({ page }) => {
  await seed(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto('/trip/custom/index.html?id=qa-flexible&view=plan', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.TravelMateTripStore));
  await expect(page.locator('#plan')).toBeVisible();

  await addActivity(page, { title: 'Flexible Cafe', time: '10:00', mode: 'flexible', duration: 60 });
  await addActivity(page, { title: 'Window Market', time: '13:00', mode: 'window', windowStart: '12:00', windowEnd: '14:00', duration: 60 });
  await addActivity(page, { title: 'Fixed Tour A', time: '16:00', mode: 'fixed', duration: 90 });
  await addActivity(page, { title: 'Fixed Tour B', time: '16:30', mode: 'fixed', duration: 60 });

  const rows = page.locator('.planned-activity');
  const flexibleRow = rows.filter({ hasText: 'Flexible Cafe' });
  const windowRow = rows.filter({ hasText: 'Window Market' });
  const fixedA = rows.filter({ hasText: 'Fixed Tour A' });
  const fixedB = rows.filter({ hasText: 'Fixed Tour B' });

  await expect(flexibleRow.locator('.activity-schedule-mode')).toHaveText('גמיש');
  await expect(flexibleRow).not.toHaveClass(/conflict/);
  await expect(windowRow.locator('.activity-schedule-mode')).toHaveText('חלון זמן');
  await expect(windowRow.locator('.activity-time')).toHaveText('12:00–14:00');
  await expect(windowRow).not.toHaveClass(/conflict/);
  await expect(fixedA.locator('.activity-schedule-mode')).toHaveText('שעה קבועה');
  await expect(fixedA).toHaveClass(/conflict/);
  await expect(fixedB).toHaveClass(/conflict/);

  const stored = await page.evaluate(() => {
    const item = JSON.parse(localStorage.getItem('travelmate-trips') || '[]')[0];
    return item.activities.map(activity => ({
      title: activity.title,
      mode: activity.scheduleMode,
      start: activity.timeWindowStart || '',
      end: activity.timeWindowEnd || ''
    }));
  });
  expect(stored).toEqual(expect.arrayContaining([
    { title: 'Flexible Cafe', mode: 'flexible', start: '', end: '' },
    { title: 'Window Market', mode: 'window', start: '12:00', end: '14:00' },
    { title: 'Fixed Tour A', mode: 'fixed', start: '', end: '' }
  ]));

  await expect(page.locator('.tm-plan-day-mode')).toHaveText(/יום מאוזן|יום מתוזמן/);
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
