'use strict';
const {test,expect}=require('@playwright/test');
const home=require('./fixtures/all-trips-v3.cjs');
const overview=require('./fixtures/overview-v3.cjs');
const six=require('./fixtures/six-screen-v3.cjs');
const {readability}=six;
test.use({serviceWorkers:'block'});

for(const width of [360,390,430,768,1440])for(const theme of ['light','dark'])test(`V3 two contexts, physical RTL, utilities and asymmetric insets ${width}/${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 await page.addInitScript(()=>{
  window.shellGpsCalls=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){window.shellGpsCalls++;throw new Error('No real GPS allowed in synthetic shell QA');}}});
  document.addEventListener('DOMContentLoaded',()=>{for(const [side,n]of Object.entries({top:32,right:12,bottom:24,left:44}))document.documentElement.style.setProperty('--safe-area-inset-'+side,n+'px');});
 });
 await home.open(page,{theme});
 const dock=page.locator('.tm-trip-dock');await expect(dock).toBeVisible();await expect(dock.locator(':scope > *')).toHaveCount(5);
 await dock.locator('[data-home-route="home"]').click();await expect(page.locator('[data-home-dashboard]')).toBeVisible();await expect(page.locator('[data-home-trip-browser]')).toBeHidden();
 await dock.locator('[data-home-route="trips"]').click();await expect(page.locator('[data-home-trip-browser]')).toBeVisible();await expect(page.locator('[data-home-dashboard]')).toBeHidden();
 const centers=await dock.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return b.x+b.width/2;}));for(let i=1;i<centers.length;i++)expect(centers[i]).toBeLessThan(centers[i-1]);
 const box=await dock.boundingBox();expect(box.x).toBeGreaterThanOrEqual(44);expect(box.x+box.width).toBeLessThanOrEqual(width-12);expect(box.y+box.height).toBeLessThanOrEqual(1000-24);
 for(const item of await dock.locator(':scope > *').all()){const b=await item.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}
 await dock.locator('[data-modal="destination"]').click();await expect(page.locator('#modal-destination')).toHaveClass(/open/);await page.keyboard.press('Escape');await expect(dock.locator('[data-modal="destination"]')).toBeFocused();
 await readability(page,info,'home-dock-C1',['.tm-home-dock [data-home-route] span:last-child','.tm-home-dock .tm-new-trip span:last-child']);
 await page.locator('[data-cloud-trip="alltrips-rome"] a').click();await page.waitForFunction(()=>window.TravelMateHistory&&window.TravelMateNavigation&&document.querySelector('[data-shell-mate] .ai-orb'));
 const baseline=await page.evaluate(()=>JSON.stringify(TravelMateTripStore.getTrip(new URLSearchParams(location.search).get('id'))));
 await expect(dock).toBeVisible();await expect(dock.locator(':scope > *')).toHaveCount(5);await expect(page.locator('.mobile-header [data-mobile-menu]')).toHaveCount(0);await expect(page.locator('.ai-orb')).toHaveCount(1);
 const more=dock.locator('[data-shell-more]'),utilities=page.locator('[data-shell-utilities]');
 await more.click();await expect(utilities).toBeVisible();await expect(utilities.locator('[data-shell-close]')).toBeFocused();
 await page.keyboard.press('Shift+Tab');expect(await utilities.evaluate(n=>n.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');await expect(utilities).toBeHidden();await expect(more).toBeFocused();
 await more.click();await page.goBack();await expect(utilities).toBeHidden();await expect(more).toBeFocused();
 // Real capture loader -> Smart Hub owner -> canonical History adapter.
 for(const dismiss of ['escape','back','button']){
  await more.click();await expect(utilities).toBeVisible();await expect(utilities.locator('.trip-sidebar-more-menu')).toBeVisible();await expect(utilities.locator('[data-smart-hub-open]')).toBeVisible();await utilities.locator('[data-smart-hub-open]').click();
  const hub=page.locator('#modal-smart-hub');await expect(hub).toHaveClass(/open/);await expect(utilities).toBeHidden();await expect(hub.locator('[data-smart-close]')).toBeFocused();
  expect(await page.locator('main.content').evaluate(n=>n.inert)).toBe(false);expect(await dock.evaluate(n=>n.inert)).toBe(false);
  await page.keyboard.press('Shift+Tab');expect(await hub.evaluate(n=>n.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');expect(await hub.evaluate(n=>n.contains(document.activeElement))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>Boolean(history.state&&history.state.travelMateOverlay))).toBe(true);
  if(dismiss==='escape')await page.keyboard.press('Escape');else if(dismiss==='back')await page.goBack();else await hub.locator('[data-smart-close]').click();
  await expect(hub).not.toHaveClass(/open/);await expect(utilities).toBeHidden();await expect(more).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>Boolean(history.state&&history.state.travelMateOverlay))).toBe(false);
  expect(await page.locator('main.content').evaluate(n=>n.inert)).toBe(false);expect(await dock.evaluate(n=>n.inert)).toBe(false);
 }
 await more.click();await utilities.locator('[data-view="budget"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','budget');await expect(utilities).toBeHidden();
 await more.click();await utilities.locator('[data-view="documents"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','documents');
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-trip-view','documents');await expect(more).toBeVisible();
 await more.click();await utilities.locator('[data-security-open]').click();await expect(page.locator('[data-security-dialog]')).toBeVisible();await expect(page.locator('.settings-accent-picker button:visible')).toHaveCount(5);await expect(page.locator('.settings-accent-picker [aria-pressed="true"]:visible')).toHaveCount(1);await expect(page.locator('.settings-row-surface')).toBeHidden();await page.keyboard.press('Escape');await expect(page.locator('[data-security-dialog]')).toBeHidden();await expect(more).toBeFocused();
 await dock.locator('[data-shell-view="overview"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','overview');
 const hero=await page.locator('#overview').boundingBox();expect(hero.height).toBeGreaterThanOrEqual(240);expect(hero.height).toBeLessThanOrEqual(420);
 const weather=await page.locator('[data-weather-top-widget]').boundingBox();expect(weather.y).toBeGreaterThanOrEqual(hero.y+hero.height);
 await readability(page,info,'trip-dock-C1',['.tm-trip-dock [data-shell-view] span:last-child','.tm-trip-dock [data-shell-more] span:last-child']);
 expect(await page.evaluate(()=>JSON.stringify(TravelMateTripStore.getTrip(new URLSearchParams(location.search).get('id'))))).toBe(baseline);expect(await page.evaluate(()=>window.shellGpsCalls)).toBe(0);
 await page.locator('#overview .hero-back').click();await expect(page).toHaveURL(/index\.html#active-trips$/);await expect(page.locator('[data-home-trip-browser]')).toBeVisible();await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();await expect(page.locator('[data-home-carousel]')).toBeHidden();await expect(page.locator('.tm-home-header')).toHaveCount(1);
});

test('home Places retries failed lazy loading without acquiring GPS, and account transitions clear prior data',async({page})=>{
 await home.open(page);
 const abort=route=>route.abort();await page.route('**/nearby.js*',abort);
 await page.locator('[data-home-route="places"]').click();await expect(page.locator('#home-places [data-nearby-status]')).toContainText('טעינת מקומות לא הושלמה');
 await page.unroute('**/nearby.js*',abort);await page.locator('[data-home-route="home"]').click();await page.locator('[data-home-route="places"]').click();await page.waitForFunction(()=>window.TravelMateNearby);
 await page.locator('[data-home-route="trips"]').click();await page.locator('[data-home-trip-search]').fill('Rome');await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await expect(page.locator('[data-home-trip-search]')).toHaveValue('');await expect(page.locator('[data-cloud-trip="alltrips-B-only"]')).toBeVisible();await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toHaveCount(0);
 await page.evaluate(()=>allTripsQA.emit(null));await expect(page.locator('[data-home-carousel]')).toBeVisible();await expect(page.locator('[data-home-dashboard]')).toBeHidden();await expect(page.locator('.tm-home-header')).toBeHidden();await expect(page.locator('[data-cloud-trip]')).toHaveCount(0);
});

test('single MATE launcher hides with simulated IME, closes and restores focus without a voice request',async({page})=>{
 const calls=[];page.on('request',request=>{if(/travel-assistant|api\.openai|generativelanguage/.test(request.url()))calls.push(request.url());});
 await page.setViewportSize({width:390,height:900});await overview.open(page);const orb=page.locator('[data-shell-mate]>.ai-orb');await orb.click();const panel=page.locator('.ai-panel');await expect(panel).toBeVisible();await panel.locator('textarea').fill('Synthetic unsent text');
 await page.setViewportSize({width:390,height:480});await expect(page.locator('body')).toHaveClass(/ai-keyboard-open/);await expect(page.locator('.tm-trip-dock')).toBeHidden();await panel.locator('[data-ai-close]').click();await page.setViewportSize({width:390,height:900});await expect(orb).toBeVisible();await expect(orb).toBeFocused();await expect(page.locator('.ai-orb')).toHaveCount(1);expect(calls).toEqual([]);
});


test('More Smart Hub failed lazy request retains utility ownership and retries',async({page})=>{
 await overview.open(page);const more=page.locator('[data-shell-more]'),utilities=page.locator('[data-shell-utilities]');
 const abort=route=>route.abort();await page.route('**/smart-hub.js*',abort);
 const failed=page.waitForEvent('requestfailed',r=>/smart-hub\.js/.test(r.url()));
 await more.click();await utilities.locator('[data-smart-hub-open]').click();await failed;await expect(page.locator('script[src*="smart-hub.js"]')).toHaveCount(0);
 await expect(utilities).toBeVisible();expect(await page.locator('.tm-trip-dock').evaluate(n=>n.inert)).toBe(true);
 await page.keyboard.press('Escape');await expect(utilities).toBeHidden();await expect(more).toBeFocused();
 await page.unroute('**/smart-hub.js*',abort);await more.click();await utilities.locator('[data-smart-hub-open]').click();
 await expect(page.locator('#modal-smart-hub')).toHaveClass(/open/);await expect(utilities).toBeHidden();await page.keyboard.press('Escape');await expect(more).toBeFocused();
});

test('Home Places primary action uses explicit consent, mocked GPS and handles cancellation and denial',async({page})=>{
 await page.addInitScript(()=>{
  window.homeGpsCalls=0;window.homeGpsMode='success';
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,failure){window.homeGpsCalls++;if(window.homeGpsMode==='denied')failure({code:1,message:'Synthetic GPS permission denied'});else success({coords:{latitude:41.9,longitude:12.5,accuracy:10}});}}});
  document.addEventListener('nearby:destination-request',()=>window.homeDestinationRequests=(window.homeDestinationRequests||0)+1,true);
 });
 let queries=0;await page.route(/^https:\/\/overpass(?:-api\.de|\.kumi\.systems)\/api\/interpreter/,route=>{queries++;return route.fulfill({json:{elements:[]}});});
 await home.open(page);await page.locator('[data-home-route="places"]').click();
 const panel=page.locator('#home-places [data-nearby-places]'),execute=panel.locator('[data-nearby-execute-search]');
 await expect(panel).toHaveAttribute('data-search-mode','gps');await expect(panel.locator('[data-nearby-mode="destination"]')).toBeHidden();await expect(panel.locator('[data-nearby-mode="destination"]')).toBeDisabled();
 expect(await page.evaluate(()=>window.homeGpsCalls)).toBe(0);expect(await panel.locator('[data-gps-consent]').count()).toBe(0);
 await execute.click();await expect(panel.locator('[data-gps-consent]')).toBeVisible();expect(await page.evaluate(()=>window.homeGpsCalls)).toBe(0);
 await panel.locator('[data-gps-deny]').click();await expect(panel.locator('[data-gps-consent]')).toHaveCount(0);await expect(execute).toBeFocused();expect(await page.evaluate(()=>window.homeGpsCalls)).toBe(0);
 await page.evaluate(()=>window.homeGpsMode='denied');await execute.click();await panel.locator('[data-gps-once]').click();await expect(panel.locator('[data-nearby-status]')).toHaveClass(/is-error/);await expect(execute).toBeEnabled();expect(await page.evaluate(()=>window.homeGpsCalls)).toBe(1);
 await page.evaluate(()=>window.homeGpsMode='success');await execute.click();await panel.locator('[data-gps-once]').click();await expect.poll(()=>queries).toBeGreaterThan(0);await expect(execute).toBeEnabled();expect(await page.evaluate(()=>window.homeGpsCalls)).toBe(2);expect(await page.evaluate(()=>window.homeDestinationRequests||0)).toBe(0);
 // Reloading the same account/trip fixture must retain the engine's trip mode.
 await page.locator('[data-home-route="trips"]').click();await page.locator('[data-cloud-trip="alltrips-rome"] a').click();await page.locator('[data-shell-view="places"]').click();
 const tripPanel=page.locator('#places [data-nearby-places]');await expect(tripPanel.locator('[data-nearby-mode="destination"]')).toBeVisible();await expect(tripPanel.locator('[data-nearby-mode="destination"]')).toBeEnabled();
});


// Token presence alone is insufficient. Record actual painted properties and
// matching production declarations, then demand the intended role's exact ink.
async function textPaintProvenance(locator,roleToken){
 return locator.evaluate((node,roleToken)=>{
  const css=getComputedStyle(node),raw=css.getPropertyValue(roleToken).trim(),probe=document.createElement('span');probe.style.color=raw;document.body.appendChild(probe);const normalized=getComputedStyle(probe).color;probe.remove();
  const declarations=[];function walk(rules){for(const rule of rules){if(rule.conditionText&&rule.media&&!matchMedia(rule.conditionText).matches)continue;if(rule.selectorText&&rule.style){let matches=false;try{matches=node.matches(rule.selectorText);}catch(_){}if(matches&&(rule.style.color||rule.style.getPropertyValue('-webkit-text-fill-color')))declarations.push({selector:rule.selectorText,color:rule.style.color,fill:rule.style.getPropertyValue('-webkit-text-fill-color'),priority:rule.style.getPropertyPriority('color')});}if(rule.cssRules)walk(rule.cssRules);}}
  for(const sheet of document.styleSheets)try{walk(sheet.cssRules);}catch(_){}
  return {color:css.color,fill:css.getPropertyValue('-webkit-text-fill-color'),role:raw,normalized,secondary:css.getPropertyValue('--tm-text-secondary').trim(),declarations};
 },roleToken);
}
for(const width of [390,430])for(const theme of ['light','dark'])test('consumed text role provenance '+width+'/'+theme,async({page,context},info)=>{
 await page.setViewportSize({width,height:900});await six.boot(page,context,theme);
 await page.locator('[data-cloud-trip="alltrips-rome"] a').click();await expect(page.locator('#overview [data-city]')).toHaveText('\u05e8\u05d5\u05de\u05d0');await page.waitForFunction(()=>window.TravelMateHistory&&window.TravelMateCloud&&window.TravelMateTripStore&&Array.from(document.styleSheets).some(sheet=>sheet.href&&sheet.href.includes('readable-glass.css')));await six.documents(page);
 const label=page.locator('[data-overview-action="map-places"] span');await expect(label).toHaveCount(1);await expect(label).toBeVisible();
 const map=await textPaintProvenance(label,'--tm-overview-label-ink');expect(map.role.toLowerCase()).toBe(theme==='dark'?'#7ae0cf':'#005b53');expect(map.color).toBe(map.normalized);expect(map.fill).toBe(map.normalized);expect(map.declarations.some(d=>d.color.includes('--tm-overview-label-ink')&&d.fill.includes('--tm-overview-label-ink'))).toBe(true);
 await six.navigate(page,'documents');await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state','locked');await expect(page.locator('[data-document-id]:visible')).toHaveCount(2);
 const note=await textPaintProvenance(page.locator('#documents .vault-unlock>small'),'--tm-note-text');expect(note.role.toUpperCase()).toBe(theme==='dark'?'#F1F8FF':'#102A4D');expect(note.secondary.toUpperCase()).toBe(theme==='dark'?'#B9CFDC':'#58718E');expect(note.color).toBe(theme==='dark'?'rgb(241, 248, 255)':'rgb(16, 42, 77)');expect(note.color).toBe(note.normalized);expect(note.fill).toBe(note.normalized);expect(note.declarations.some(d=>d.color.includes('--tm-note-text')&&d.fill.includes('--tm-note-text')&&d.priority==='important')).toBe(true);
 await readability(page,info,'consumed-document-note',['#documents .vault-unlock>small']);
 expect(await page.evaluate(()=>sixScreenQA.downloads)).toEqual([]);await info.attach('consumed-text-properties-and-role-owners',{body:JSON.stringify({map,note},null,2),contentType:'application/json'});
});
