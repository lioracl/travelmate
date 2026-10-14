const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const trip={
  id:'calendar-qa',city:'Prague QA',country:'Czechia',start:'2026-10-13',end:'2026-10-13',days:1,
  type:'סולו',budget:1000,planInitialized:true,dayNotes:{},savedPlaces:[
    {id:'saved-fixed',name:'מקום שמור',date:'2026-10-13',time:'15:00',scheduleMode:'reservation',address:'רחוב 1',imageResolutionVersion:3},
    {id:'saved-no-time',name:'מקום ללא שעה',date:'2026-10-13',imageResolutionVersion:3}
  ],
  activities:[
    {id:'exact',title:'סיור שלום 🌍 &?',date:'2026-10-13',time:'23:30',duration:90,scheduleMode:'booked',category:'סיור',locationName:'מוזיאון',address:'רחוב 2',notes:'PRIVATE_NOTES',description:'PRIVATE_DESCRIPTION'},
    {id:'flex',title:'גמיש',date:'2026-10-13',time:'12:00',duration:60,scheduleMode:'flexible'},
    {id:'window',title:'חלון זמן',date:'2026-10-13',time:'12:00',duration:60,scheduleMode:'window',timeWindowStart:'11:00',timeWindowEnd:'14:00'},
    {id:'missing',title:'ללא שעה',date:'2026-10-13',time:'',duration:60,scheduleMode:'fixed'}
  ]
};
async function seed(page,theme){
  await page.addInitScript(({trip,theme})=>{
    localStorage.setItem('travelmate-trips',JSON.stringify([trip]));
    localStorage.removeItem('travelmate-active-user');localStorage.setItem('travelmate-theme',theme);
    window.__calendarOpened=[];window.open=(...args)=>{window.__calendarOpened.push(args);return null};
  },{trip,theme});
  await page.goto('/trip/custom/index.html?id=calendar-qa&view=plan',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-calendar-export-activity]').first()).toBeAttached();
  const past=page.locator('[data-open-past-day="2026-10-13"]');if(await past.isVisible())await past.click();
}
async function openDetails(page,id='exact'){
  const row=page.locator('[data-activity-id="'+id+'"]');
  const day=row.locator('xpath=ancestor::article[contains(@class,"generated-day")]');
  if(await day.count()&&await day.evaluate(el=>el.classList.contains('day-collapsed')))await day.locator('[data-toggle-day]').click();
  await row.locator('[data-plan-details-toggle]').click();
  const trigger=row.locator('[data-calendar-export-activity]');
  await expect(trigger).toBeVisible();const box=await trigger.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);await trigger.focus();await page.keyboard.press('Enter');
  return trigger;
}
async function downloadIcs(page){
  const promise=page.waitForEvent('download');
  await page.locator('dialog [data-calendar-ics]').click();
  const download=await promise;expect(download.suggestedFilename()).toBe('travelmate-calendar.ics');
  return fs.readFileSync(await download.path(),'utf8').replace(/\r\n /g,'');
}
for(const width of [360,390,430])for(const theme of ['light','dark']){
  test.describe(width+' RTL '+theme,()=>{
    test.use({viewport:{width,height:844}});
    test('details calendar Google and ICS; focus, touch, privacy, no automatic provider request',async({page},testInfo)=>{
      const providerRequests=[],errors=[];
      page.on('request',request=>{if(/^https:\/\/(?:calendar\.google\.com|www\.googleapis\.com|accounts\.google\.com)\//i.test(request.url()))providerRequests.push(request.url())});
      page.on('pageerror',error=>errors.push(error.message));
      await seed(page,theme);
      const before=await page.evaluate(()=>JSON.stringify(window.TravelMateTripStore.getTrip('calendar-qa')));
      const trigger=await openDetails(page),dialog=page.locator('dialog.tm-calendar-export');
      await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('dir','rtl');
      await expect(dialog.locator('[data-calendar-close]')).toBeFocused();
      await expect(dialog.locator('[data-calendar-ics]')).toBeEnabled();
      await expect(dialog.locator('#tm-calendar-export-time')).toContainText('אזור הזמן של הטיול אינו ידוע');
      expect(await page.evaluate(()=>window.__calendarOpened)).toEqual([]);expect(providerRequests).toEqual([]);
      for(const button of await dialog.locator('button').all()){
        const box=await button.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
      }
      for(let index=0;index<5;index++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.closest('dialog')!==null)).toBeTruthy()}
      await page.screenshot({path:testInfo.outputPath('calendar-'+theme+'-'+width+'.png')});
      const ics=await downloadIcs(page);
      expect(ics).toContain('DTSTART:20261013T233000\r\nDTEND:20261014T010000');
      expect(ics).toContain('SUMMARY:סיור שלום 🌍 &?');expect(ics).not.toMatch(/PRIVATE|TZID|VTIMEZONE/);
      expect(providerRequests).toEqual([]);
      await dialog.locator('[data-calendar-google]').click();
      const opened=await page.evaluate(()=>window.__calendarOpened);expect(opened).toHaveLength(1);
      const url=new URL(opened[0][0]);expect(url.searchParams.get('text')).toBe(trip.activities[0].title);
      expect(url.searchParams.get('dates')).toBe('20261013T233000/20261014T010000');
      expect(url.searchParams.get('details')).toBe('TravelMate');expect(opened[0][2]).toBe('noopener,noreferrer');
      expect(providerRequests).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBeTruthy();
      expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
      await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
      expect(await page.evaluate(()=>JSON.stringify(window.TravelMateTripStore.getTrip('calendar-qa')))).toBe(before);
      expect(errors).toEqual([]);
    });
    test('offline ICS and Google disabled; recover online without store mutation',async({page,context})=>{
      await seed(page,theme);
      const before=await page.evaluate(()=>JSON.stringify(window.TravelMateTripStore.getTrip('calendar-qa')));
      await context.setOffline(true);await openDetails(page);
      await expect(page.locator('dialog [data-calendar-ics]')).toBeEnabled();
      await expect(page.locator('dialog [data-calendar-google]')).toBeDisabled();
      await expect(page.locator('[data-calendar-online]')).toContainText('אינו זמין ללא רשת');
      expect(await downloadIcs(page)).toContain('BEGIN:VEVENT');
      expect(await page.evaluate(()=>window.__calendarOpened)).toEqual([]);
      await context.setOffline(false);await expect(page.locator('dialog [data-calendar-google]')).toBeEnabled();
      await page.keyboard.press('Escape');
      expect(await page.evaluate(()=>JSON.stringify(window.TravelMateTripStore.getTrip('calendar-qa')))).toBe(before);
    });
  });
}
test('saved-place calendar action reused; missing times, flexible and windows cannot export',async({page})=>{
  await seed(page,'light');
  for(const id of ['flex','window','missing']){
    await openDetails(page,id);
    await expect(page.locator('[data-calendar-status]')).toContainText('נדרשים תאריך תקין');
    await expect(page.locator('dialog [data-calendar-google]')).toBeDisabled();
    await expect(page.locator('dialog [data-calendar-ics]')).toBeDisabled();
    await page.keyboard.press('Escape');
  }
  for(const id of ['saved-fixed','saved-no-time']){
    const row=page.locator('[data-saved-place-id="'+id+'"]');await row.locator('[data-plan-details-toggle]').click();
    await expect(row.locator('.saved-calendar-link')).toHaveCount(1);
    await row.locator('.saved-calendar-link').click();
    if(id==='saved-fixed'){await expect(page.locator('dialog [data-calendar-ics]')).toBeEnabled();expect(await downloadIcs(page)).toContain('SUMMARY:מקום שמור')}
    else {await expect(page.locator('dialog [data-calendar-ics]')).toBeDisabled();expect(await page.evaluate(()=>window.TravelMateTripStore.getTrip('calendar-qa').savedPlaces[1].time)).toBeUndefined()}
    await page.keyboard.press('Escape');
  }
});
test('browser Back dismisses export and restores activity focus',async({page})=>{
  await seed(page,'light');const trigger=await openDetails(page);
  await expect(page.locator('dialog [data-calendar-ics]')).toBeEnabled();
  await page.goBack();await expect(page.locator('dialog')).not.toBeVisible();await expect(trigger).toBeFocused();
});
test('bulk export uses same eligible minimal events and truthful confirmation',async({page})=>{
  await seed(page,'light');
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('אזור הזמן של הטיול אינו ידוע');dialog.accept()});
  await page.locator('.planner-more summary').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-export-calendar]').click();
  const result=await downloadPromise,ics=fs.readFileSync(await result.path(),'utf8');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);expect(ics).not.toMatch(/PRIVATE|TZID|SUMMARY:גמיש|SUMMARY:חלון/);
});
