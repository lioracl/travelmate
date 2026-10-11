const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
for(const width of [360,390,430])for(const theme of ['light','dark'])test(`public landing inset ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(theme=>{localStorage.setItem('travelmate-theme',theme);document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.setProperty('--safe-area-inset-top','32px');document.documentElement.dataset.nativeShell='android';});},theme);
 await page.goto('/');await expect(page.locator('.landing-login')).toBeVisible();
 const bar=await page.evaluate(()=>getComputedStyle(document.documentElement,'::before').backgroundColor);expect(bar).toBe(theme==='dark'?'rgb(38, 48, 51)':'rgb(244, 243, 239)');
 const box=await page.locator('.landing-login').boundingBox();expect(box.y).toBeGreaterThanOrEqual(32);
 const nav=await page.locator('.landing-nav').evaluate(el=>({padding:parseFloat(getComputedStyle(el).paddingTop),bottom:el.getBoundingClientRect().bottom}));expect(nav.padding).toBeGreaterThanOrEqual(32);
 await page.locator('.landing-login').click();await expect(page.locator('.cloud-account-backdrop')).toBeVisible();
 expect((await page.locator('.cloud-account-backdrop').boundingBox()).y).toBeGreaterThanOrEqual(32);
});
const fixture=fs.readFileSync('trip/custom/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
async function notifications(page,shared){
 await page.route('**/notification-acceptance.html',r=>r.fulfill({contentType:'text/html',body:fixture}));
 await page.goto('/notification-acceptance.html');
 await page.evaluate(shared=>{
  document.body.dataset.tripView='overview';
  window.qa={members:shared?[{user_id:'A'},{user_id:'B'}]:[{user_id:'A'}],events:[],reads:0,auth:null};
  window.travelMateTripReady=Promise.resolve({id:'qa',ownerId:'A'});
  window.TravelMateCloud={getSession:async()=>({user:{id:'A'}}),onAuthChange:cb=>{qa.auth=cb;},listTripMembers:async()=>qa.members,listTripChangeEvents:async()=>{qa.reads++;return qa.events;},getTripChangeReadState:async()=>({last_read_event_id:0}),subscribeToTripChangeEvents:async()=>()=>{}};
 },shared);
 await page.addScriptTag({url:'/assets/trip-change-notifications.js'});
 await expect.poll(()=>page.evaluate(()=>typeof qa.auth)).toBe('function');
}
test('solo launcher and zero badges stay hidden, including stale clicks and reconnect',async({page,context})=>{
 await notifications(page,false);const buttons=page.locator('.trip-notification-launcher');
 for(const button of await buttons.all())await expect(button).toBeHidden();
 await buttons.first().evaluate(el=>el.click());await expect(page.locator('.trip-notification-panel')).toBeHidden();
 await context.setOffline(true);await context.setOffline(false);for(const button of await buttons.all())await expect(button).toBeHidden();
});
test('shared zero/nonzero badge and panel refresh, account switch/logout isolation',async({page,context})=>{
 await notifications(page,true);const button=page.locator('.trip-notification-launcher:visible').first();await expect(button).toBeVisible();
 for(const badge of await page.locator('[data-trip-notification-badge]').all())await expect(badge).toBeHidden();
 await button.click();await expect(page.locator('.trip-notification-panel')).toBeVisible();
 await page.evaluate(()=>{qa.events=[{id:1,actor_user_id:'B',entity_type:'activity',action:'added'}];dispatchEvent(new Event('travelmate:sync-restored'));});
 await expect(button.locator('[data-trip-notification-badge]')).toHaveText('1');await expect(button.locator('[data-trip-notification-badge]')).toBeVisible();await expect(page.locator('.trip-notification-panel')).toBeVisible();
 await context.setOffline(true);await page.evaluate(()=>qa.auth('SIGNED_IN',{user:{id:'C'}}));
 for(const el of await page.locator('.trip-notification-launcher').all())await expect(el).toBeHidden();await expect(page.locator('.trip-notification-panel')).toBeHidden();
 await page.evaluate(()=>{qa.members=[{user_id:'C'}];qa.events=[];});await context.setOffline(false);
 await expect.poll(()=>page.evaluate(()=>qa.reads)).toBeGreaterThan(2);
 for(const el of await page.locator('.trip-notification-launcher').all())await expect(el).toBeHidden();
 await page.evaluate(()=>qa.auth('SIGNED_OUT',null));for(const el of await page.locator('[data-trip-notification-badge]').all())await expect(el).toBeHidden();
});
for(const width of [360,390,430])test(`authenticated home inset remains intact ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.addInitScript(()=>{localStorage.setItem('travelmate-active-user','A');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'qa-home',ownerId:'A',city:'QA',country:'Italy',start:'2026-10-10',end:'2026-10-12',days:3,activities:[],savedPlaces:[],expenses:[]}]));document.addEventListener('DOMContentLoaded',()=>document.documentElement.style.setProperty('--safe-area-inset-top','32px'));});
 await page.goto('/');await expect(page.locator('body')).toHaveClass(/has-cached-trips/);const header=await page.locator('.home-sidebar').boundingBox();expect(header.y).toBeGreaterThanOrEqual(32);
 const padding=await page.locator('main.content').evaluate(el=>parseFloat(getComputedStyle(el).paddingTop));expect(padding).toBeGreaterThanOrEqual(header.y+header.height);
});
test('planned saved place has one canonical ratings action after detail expansion',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{const day=new Date().toLocaleDateString('en-CA');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'qa-ratings',country:'Israel',city:'QA',start:day,end:day,days:1,planInitialized:true,activities:[],expenses:[],savedPlaces:[{id:'p1',name:'QA Museum',category:'attraction',description:'QA description',date:day,time:'12:00',ratingsUrl:'https://maps.google.com/?q=qa',imageResolutionVersion:3}]}]));});
 await page.goto('/trip/custom/index.html?id=qa-ratings&view=plan');const row=page.locator('[data-saved-place-id="p1"]');
 await expect(row.locator('[data-plan-details-toggle]')).toBeVisible();await row.locator('[data-plan-details-toggle]').click();
 await expect(row.locator('.tm-plan-secondary-details')).toBeVisible();await expect(row.getByRole('link',{name:/ציונים וביקורות/})).toHaveCount(1);
 await expect(row.locator('.saved-place-links .google-rating-link')).toBeVisible();
 await expect(row.locator('.saved-place-type')).toHaveText('אטרקציה');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('travelmate-trips'))[0].savedPlaces[0].category)).toBe('attraction');
 const back=page.locator('.mobile-header>a').first();await expect(back).toHaveClass(/mobile-trip-back/);const geometry=await back.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius}));expect(geometry).toEqual({width:50,height:50,radius:'14px'});
});
for(const width of [360,390,430])test(`short landing remains scrollable with full carousel ${width}`,async({page})=>{
 await page.setViewportSize({width,height:568});await page.goto('/');await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-area-inset-top','32px');document.documentElement.style.setProperty('--safe-area-inset-bottom','48px');document.documentElement.dataset.nativeShell='android';});
 const login=await page.locator('.landing-login').boundingBox();expect(login.height).toBeGreaterThanOrEqual(44);expect(login.y).toBeGreaterThanOrEqual(32);
 await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 const geometry=await page.locator('.destination-slide.active').evaluate(el=>({slide:el.getBoundingClientRect().toJSON(),scene:el.closest('.home-landing').getBoundingClientRect().toJSON()}));
 expect(geometry.slide.bottom).toBeLessThanOrEqual(geometry.scene.bottom-48);expect(geometry.slide.bottom).toBeLessThanOrEqual(568-48+1);expect(geometry.slide.top).toBeGreaterThanOrEqual(geometry.scene.top);
 await page.screenshot({path:test.info().outputPath('short-landing.png')});
});
