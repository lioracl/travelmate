const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'}); // Deterministic component routing; offline PWA has separate regression coverage.
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../trip/custom/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
for(const width of [390,430,768,1440]) for(const theme of ['light','dark']) {
 test(`release Weather and notification offline boundary ${width} ${theme}`,async({page,context})=>{
  await page.setViewportSize({width,height:1000});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({theme})=>{
   const today=new Date().toLocaleDateString('en-CA');
   const trip={id:'release-ui',ownerId:'qa-A',city:'QA',country:'Italy',start:today,end:today,days:1,budget:1000,planInitialized:true,activities:[],savedPlaces:[],expenses:[]};
   localStorage.setItem('travelmate-trips',JSON.stringify([trip]));localStorage.removeItem('travelmate-active-user');localStorage.setItem('travelmate-theme',theme);
  },{theme});
  await page.goto('/trip/custom/index.html?id=release-ui&view=overview');
  const weather=page.locator('[data-weather-top-widget]');await expect(weather).toBeVisible();
  const material=await weather.evaluate(el=>({background:getComputedStyle(el).backgroundColor,insideHero:!!el.closest('.hero'),direction:getComputedStyle(document.documentElement).direction,overflow:document.documentElement.scrollWidth>innerWidth+2}));
  expect(material).toEqual({background:'rgba(0, 0, 0, 0)',insideHero:false,direction:'rtl',overflow:false});
  await page.screenshot({path:test.info().outputPath(`weather-${width}-${theme}.png`)});
  // Component fixture: no provider access. Exercise the production notification UI with an explicit Cloud API stub.
  await page.route('**/release-notifications.html',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('/release-notifications.html');
  await page.evaluate(theme=>{
   document.documentElement.dataset.theme=theme;document.body.dataset.tripView='overview';
   const events=[{id:1,actor_user_id:'qa-B',entity_type:'activity',action:'added',created_at:new Date().toISOString()}];
   let lastRead=0;window.releaseQA={events,reads:0};
   window.travelMateTripReady=Promise.resolve({id:'release-ui',ownerId:'qa-A'});
   window.TravelMateCloud={getSession:async()=>({user:{id:'qa-A'}}),onAuthChange:()=>{},listTripChangeEvents:async()=>{releaseQA.reads++;return events.slice();},getTripChangeReadState:async()=>({last_read_event_id:lastRead}),listTripMembers:async()=>[{user_id:'qa-A'},{user_id:'qa-B',display_name:'משתמש בדיקה'}],subscribeToTripChangeEvents:async()=>()=>{},markTripChangesRead:async(_owner,_trip,id)=>{lastRead=id;return id;}};
  },theme);
  await page.addScriptTag({url:'/assets/trip-change-notifications.js'});
  const launcher=page.locator('.trip-notification-launcher:visible').first();await expect(launcher).toBeVisible();await launcher.click();
  const panel=page.locator('.trip-notification-panel');await expect(panel).toBeVisible();await expect(panel.locator('[data-trip-change-id]')).toHaveCount(1);
  await panel.locator('[data-trip-notification-read-all]').click();await expect.poll(()=>page.evaluate(()=>TravelMateTripChangeContext.snapshot().unreadCount)).toBe(0);
  await context.setOffline(true);await panel.locator('[data-trip-notification-close]').click();await launcher.click();await expect(panel.locator('[data-trip-notification-status]')).toContainText('לא מקוון');
  await page.evaluate(()=>releaseQA.events.push({id:2,actor_user_id:'qa-B',entity_type:'place',action:'added',created_at:new Date().toISOString()}));
  await context.setOffline(false);await expect(panel.locator('[data-trip-change-id]')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`notifications-${width}-${theme}.png`)});
 });
}
