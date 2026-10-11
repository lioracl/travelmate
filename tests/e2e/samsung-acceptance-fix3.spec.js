const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
const fixture=fs.readFileSync('trip/custom/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
async function notifications(page,shared=true){
 await page.route('**/notification-device.html',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('/notification-device.html');
 await page.evaluate(shared=>{
  document.body.classList.add('tm-new-design');document.body.dataset.tripKind='custom';document.body.dataset.tripView='overview';
  document.documentElement.dataset.nativeShell='android';document.documentElement.style.setProperty('--safe-area-inset-top','32px');document.documentElement.style.setProperty('--safe-area-inset-bottom','48px');
  window.qa={members:shared?[{user_id:'A'},{user_id:'B'}]:[{user_id:'A'}],events:[],reads:0,auth:null,realtime:null};
  window.travelMateTripReady=Promise.resolve({id:'qa',ownerId:'A'});
  window.TravelMateCloud={getSession:async()=>({user:{id:'A'}}),onAuthChange:cb=>{qa.auth=cb;},listTripMembers:async()=>qa.members,listTripChangeEvents:async()=>{qa.reads++;return qa.events;},getTripChangeReadState:async()=>({last_read_event_id:0}),subscribeToTripChangeEvents:async(o,t,cb)=>{qa.realtime=cb;return()=>{};}};
 },shared);await page.addScriptTag({url:'/assets/trip-change-notifications.js'});await expect.poll(()=>page.evaluate(()=>typeof qa.auth)).toBe('function');
}
for(const width of [360,390,430])for(const height of [844,568])test(`notification real chrome toggle and close ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height});await notifications(page);
 const bell=page.locator('.trip-notification-mobile'),panel=page.locator('.trip-notification-panel');
 await expect(bell).toBeVisible();await bell.click();await expect(panel).toBeVisible();
 const geo=await page.locator('[data-trip-notification-close]').evaluate(el=>{const r=el.getBoundingClientRect(),h=document.querySelector('.mobile-header').getBoundingClientRect();return{width:r.width,height:r.height,top:r.top,headerBottom:h.bottom,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
 expect(geo.width).toBeGreaterThanOrEqual(44);expect(geo.height).toBeGreaterThanOrEqual(44);expect(geo.top).toBeGreaterThanOrEqual(geo.headerBottom);expect(geo.hit).toBe(true);
 await bell.click();await expect(panel).toBeHidden();await bell.click();await expect(panel).toBeVisible();
 await page.evaluate(()=>dispatchEvent(new Event('travelmate:sync-restored')));await expect.poll(()=>page.evaluate(()=>qa.reads)).toBeGreaterThanOrEqual(3);await expect(panel).toBeVisible();
 await page.locator('[data-trip-notification-close]').click();await expect(panel).toBeHidden();await bell.click();await expect(panel).toBeVisible();
 await page.screenshot({path:test.info().outputPath('notification-chrome.png')});
});
test('zero has no badge DOM; exact count, account/logout and reconnect isolate state',async({page,context})=>{
 await notifications(page);await expect(page.locator('[data-trip-notification-badge]')).toHaveCount(0);
 await page.evaluate(()=>{qa.events=Array.from({length:101},(_,i)=>({id:i+1,actor_user_id:'B',entity_type:'activity'}));dispatchEvent(new Event('travelmate:sync-restored'));});
 await expect(page.locator('.trip-notification-mobile [data-trip-notification-badge]')).toHaveText('101');
 await context.setOffline(true);await page.evaluate(()=>qa.auth('SIGNED_IN',{user:{id:'C'}}));await expect(page.locator('[data-trip-notification-badge]')).toHaveCount(0);
 await expect(page.locator('.trip-notification-mobile')).toBeHidden();await page.evaluate(()=>{qa.members=[{user_id:'C'}];qa.events=[];});await context.setOffline(false);await expect(page.locator('.trip-notification-mobile')).toBeHidden();
 await page.locator('.trip-notification-mobile').evaluate(el=>el.click());await expect(page.locator('.trip-notification-panel')).toBeHidden();
 await page.evaluate(()=>qa.auth('SIGNED_OUT',null));await expect(page.locator('[data-trip-notification-badge]')).toHaveCount(0);
});
for(const width of [360,390,430])test(`actual plan activity and saved place labels and one reviews action ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.addInitScript(()=>{const day=new Date().toLocaleDateString('en-CA');const common={date:day,time:'12:00',duration:60,category:'attraction',address:'QA address',description:'QA description',ratingsUrl:'https://maps.google.com/?q=qa',imageResolutionVersion:3};localStorage.setItem('travelmate-trips',JSON.stringify([{id:'qa-device',country:'Israel',city:'QA',start:day,end:day,days:1,planInitialized:true,activities:[{...common,id:'a1',title:'QA Activity'}],expenses:[],savedPlaces:[{...common,id:'p1',name:'QA Place'}]}]));});
 await page.goto('/trip/custom/index.html?id=qa-device&view=plan');
 for(const selector of ['[data-activity-id="a1"]','[data-saved-place-id="p1"]']){
  const row=page.locator(selector);await expect(row.locator('[data-plan-details-toggle]')).toBeVisible();await row.locator('[data-plan-details-toggle]').click();
  await expect(row.getByRole('link',{name:/ציונים וביקורות/})).toHaveCount(1);await expect(row).not.toContainText('attraction');
 }
 // A later primary renderer must take precedence over the detail enrichment action.
 await page.locator('[data-activity-id="a1"]').evaluate(row=>{const link=document.createElement('a');link.href='https://maps.google.com/?q=qa';link.className='google-rating-link';link.textContent='ציונים וביקורות';row.querySelector('.activity-copy').appendChild(link);});
 await expect(page.locator('[data-activity-id="a1"] [data-plan-secondary-reviews]')).toHaveCount(0);
 await page.evaluate(()=>document.dispatchEvent(new Event('travelmate:planner-rendered')));
 for(const selector of ['[data-activity-id="a1"]','[data-saved-place-id="p1"]'])await expect(page.locator(selector).getByRole('link',{name:/ציונים וביקורות/,includeHidden:true})).toHaveCount(1);
 expect(await page.evaluate(()=>{const t=JSON.parse(localStorage.getItem('travelmate-trips'))[0];return[t.activities[0].category,t.savedPlaces[0].category];})).toEqual(['attraction','attraction']);
});
