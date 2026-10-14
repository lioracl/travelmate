const {test,expect}=require('@playwright/test');
test('real Smart Trip alternative stays preview-only until confirm and apply, then supports undo',async({page})=>{
 await page.setViewportSize({width:390,height:568});await page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'));
 await page.addInitScript(()=>{localStorage.setItem('travelmate-theme','light');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'alt-qa',city:'QA',country:'Italy',start:'2026-10-13',end:'2026-10-15',days:3,type:'סולו',planInitialized:true,expenses:[],savedPlaces:[],activities:[{id:'flex',title:'פעילות גמישה',date:'2026-10-13',time:'15:00',duration:30,scheduleMode:'flexible'},{id:'fixed',title:'הזמנה',date:'2026-10-13',time:'18:00',duration:60,scheduleMode:'fixed'}]}]));window.gpsCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.gpsCalls++;throw Error('Automatic GPS');}}});});
 await page.goto('/trip/custom/index.html?id=alt-qa&view=plan',{waitUntil:'domcontentloaded'});await page.locator('[data-smart-check]').click();
 const panel=page.locator('[data-smart-decisions]'),alternative=panel.locator('[data-smart-alternative]').first();await expect(alternative).toBeVisible();
 const before=await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time);expect(before).toBe('15:00');
 await alternative.click();await expect(panel.locator('[data-smart-step=confirm]')).toBeVisible();expect(await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time)).toBe('15:00');
 await panel.locator('[data-smart-step=confirm]').click();await panel.locator('[data-smart-step=apply]').click();const moved=await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time);expect(moved).not.toBe('15:00');
 await panel.locator('[data-smart-step=undo]').click();expect(await page.evaluate(()=>TravelMateTripStore.getTrip('alt-qa').activities[0].time)).toBe('15:00');expect(await page.evaluate(()=>window.gpsCalls)).toBe(0);
});
