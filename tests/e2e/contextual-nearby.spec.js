const { test, expect } = require('@playwright/test');

const fixedNow = Date.UTC(2026, 8, 30, 12, 0, 0);
const trip = {
  id: 'qa-context-nearby',
  country: 'Israel',
  city: 'Tel Aviv',
  start: '2026-09-29',
  end: '2026-10-02',
  days: 4,
  type: 'סולו',
  budget: 1000,
  planInitialized: true,
  dayNotes: {},
  savedPlaces: [],
  activities: [
    {
      id: 'fixed-tour',
      date: '2026-09-30',
      time: '14:00',
      title: 'Booked Tour',
      category: 'סיור',
      duration: 90,
      scheduleMode: 'fixed',
      lat: 32.08,
      lon: 34.78
    }
  ]
};

async function seed(page) {
  await page.addInitScript(payload => {
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [payload.fixedNow]));
      }
      static now() { return payload.fixedNow; }
    }
    window.Date = FixedDate;
    localStorage.setItem('travelmate-trips', JSON.stringify([payload.trip]));
    localStorage.removeItem('travelmate-active-user');
    localStorage.setItem('travelmate-theme', 'light');
  }, { fixedNow, trip });
}

test.use({ viewport: { width: 390, height: 844 } });

test('Free Time Finder is contextual and requests app consent before browser geolocation', async ({ page }) => {
  await seed(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto('/trip/custom/index.html?id=qa-context-nearby&view=places', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', 'places');

  await page.waitForFunction(() => Boolean(window.TravelMateTripContext && window.TravelMateTripStore));
  const contextSnapshot = await page.evaluate(() => {
    const trip = window.TravelMateTripStore.getTrip('qa-context-nearby');
    const info = window.TravelMateTripContext.freeTimeWindow(trip, new Date(), { bufferMinutes: 30 });
    return {
      now: new Date().toString(),
      trip: trip && { start: trip.start, end: trip.end, activities: trip.activities },
      info: info && {
        availableMinutes: info.availableMinutes,
        nextId: info.nextFixedActivity && info.nextFixedActivity.record && info.nextFixedActivity.record.id
      }
    };
  });
  expect(contextSnapshot.info, JSON.stringify(contextSnapshot)).not.toBeNull();
  expect(contextSnapshot.info.availableMinutes, JSON.stringify(contextSnapshot)).toBe(90);

  const finder = page.locator('[data-nearby-time-context]');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('travelmate:activities-updated')));
  await expect(finder).toBeVisible();
  await expect(finder.locator('[data-nearby-time-title]')).toContainText('90 דקות');
  await expect(finder.locator('[data-nearby-time-title]')).toContainText('Booked Tour');

  await finder.locator('[data-nearby-time-search]').click();
  const consent = page.locator('[data-gps-consent]');
  await expect(consent).toBeVisible();
  await expect(consent).toContainText('אין מעקב ברקע');

  await consent.locator('[data-gps-deny]').click();
  await expect(consent).toHaveCount(0);
  await expect(page.locator('[data-nearby-status]')).toContainText('בוטל');

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
