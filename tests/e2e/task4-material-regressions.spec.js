const { test, expect } = require('@playwright/test');
for (const width of [360, 390, 430]) for (const theme of ['light', 'dark']) {
  test('Saved-place calendar end rolls into the next year: ' + width + ' ' + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(theme => {
      localStorage.removeItem('travelmate-active-user');
      localStorage.setItem('travelmate-theme', theme);
      localStorage.setItem('travelmate-trips', JSON.stringify([{ id: 'qa-task4-calendar', country: 'Italy', city: 'Rome QA', start: '2026-12-31', end: '2027-01-01', days: 2, planInitialized: true, activities: [], expenses: [], dayNotes: {}, savedPlaces: [{ id: 'overnight', name: 'QA late visit', date: '2026-12-31', time: '23:30', lat: 41.9, lon: 12.5, imageResolutionVersion: 3 }] }]));
    }, theme);
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/trip/custom/index.html?id=qa-task4-calendar&view=plan');
    const link = page.locator('[data-saved-place-id="overnight"] .saved-calendar-link');
    await expect(link).toHaveCount(1);
    await page.locator('[data-saved-place-id="overnight"] [data-plan-details-toggle]').click();
    await link.click();
    await expect(page.locator('[data-calendar-ics]')).toBeEnabled();
    const event = await page.evaluate(() => TravelMateCalendarExport.deriveEvent({id:'qa-task4-calendar'}, TravelMateTripStore.getTrip('qa-task4-calendar').savedPlaces[0]));
    expect(event.start + '/' + event.end).toBe('20261231T233000/20270101T003000');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips'))[0].savedPlaces[0].date)).toBe('2026-12-31');
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 390, 430]) for (const theme of ['light', 'dark']) {
  test('Completing a fixed activity releases timing guidance: ' + width + ' ' + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date('2026-10-14T12:00:00+03:00'));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(theme => {
      localStorage.removeItem('travelmate-active-user'); localStorage.setItem('travelmate-theme', theme);
      localStorage.setItem('travelmate-trips', JSON.stringify([{id:'qa-completion',country:'Israel',city:'Tel Aviv QA',start:'2026-10-14',end:'2026-10-15',days:2,planInitialized:true,savedPlaces:[],expenses:[],dayNotes:{},activities:[{id:'first',title:'QA first booking',date:'2026-10-14',time:'12:00',duration:90,scheduleMode:'fixed',lat:32.08,lon:34.78},{id:'next',title:'QA next booking',date:'2026-10-14',time:'14:00',duration:60,scheduleMode:'fixed',lat:32.30,lon:34.90}]}]));
    },theme);
    const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
    await page.goto('/trip/custom/index.html?id=qa-completion&view=plan');
    await page.waitForFunction(()=>Boolean(window.TravelMateTripContext));
    expect(await page.evaluate(()=>TravelMateTripContext.transitionAssessmentsForDate(TravelMateTripStore.getTrip('qa-completion'),'2026-10-14')['activity:next'].risk)).toBe(true);
    await page.locator('[data-activity-id="first"] [data-toggle-done]').click();
    await expect.poll(()=>page.evaluate(()=>TravelMateTripStore.getTrip('qa-completion').activities[0].done)).toBe(true);
    expect(await page.evaluate(()=>Object.keys(TravelMateTripContext.transitionAssessmentsForDate(TravelMateTripStore.getTrip('qa-completion'),'2026-10-14')))).toEqual([]);
    expect(await page.evaluate(()=>TravelMateTripContext.nextFixedActivity(TravelMateTripStore.getTrip('qa-completion'),new Date('2026-10-14T12:00:00')).record.id)).toBe('next');
    expect(await page.evaluate(()=>TravelMateTripContext.freeTimeWindowsForDate(TravelMateTripStore.getTrip('qa-completion'),'2026-10-14',{startTime:'12:00',endTime:'16:00'})[0].durationMinutes)).toBe(120);
    expect(errors).toEqual([]);
  });
}
