const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'}); // Deterministic component routing; offline PWA has separate regression coverage.
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../trip/custom/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
for(const width of [390,430,768,1440]) for(const theme of ['light','dark']) {
 test(`release Weather and notification offline boundary ${width} ${theme}`,async({page,context})=>{
  await page.setViewportSize({width,height:1000});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('https://geocoding-api.open-meteo.com/**',route=>route.fulfill({json:{results:[{name:'QA',country:'Italy',latitude:41.9,longitude:12.5,timezone:'Europe/Rome'}]}}));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{timezone_abbreviation:'CEST',current:{temperature_2m:22,apparent_temperature:21,weather_code:2,is_day:1},daily:{time:['2026-10-10','2026-10-11'],weather_code:[2,3],temperature_2m_max:[24,23],temperature_2m_min:[16,15],precipitation_probability_max:[10,20],wind_speed_10m_max:[12,10],uv_index_max:[4,3]}}}));
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
  await weather.click();
  const forecast=page.locator('#modal-weather-live');await expect(forecast).toBeVisible();await expect(forecast).toHaveAttribute('role','dialog');
  await expect(forecast.locator('.modal-close')).toBeFocused();await expect(weather).toHaveAttribute('aria-expanded','true');
  await expect(forecast.locator('.weather-live-day')).toHaveCount(2);await expect(forecast.locator('[data-weather-close]')).toHaveText('×');
  const expanded=await forecast.locator('.weather-live-modal').evaluate(el=>({background:getComputedStyle(el).backgroundColor,header:getComputedStyle(el.querySelector('header')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+2,close:el.querySelector('.modal-close').getBoundingClientRect().width}));
  // An opaque surface defeats the approved glass treatment even when it is off-white.
  const alpha=expanded.background.startsWith('rgba')?Number(expanded.background.split(',').pop().replace(')','')):expanded.background.startsWith('color(')?Number(expanded.background.split('/').pop().replace(')','')):1;
  expect(alpha).toBeGreaterThan(.5);expect(alpha).toBeLessThan(.9);expect(expanded.header).toBe('rgba(0, 0, 0, 0)');expect(expanded.overflow).toBe(false);expect(expanded.close).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:test.info().outputPath(`weather-expanded-${width}-${theme}.png`)});
  await page.keyboard.press('Escape');await expect(forecast).toBeHidden();await expect(weather).toBeFocused();await expect(weather).toHaveAttribute('aria-expanded','false');
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
