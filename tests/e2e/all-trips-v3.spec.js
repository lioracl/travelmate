const {test,expect}=require('@playwright/test');
const {open,trips}=require('./fixtures/all-trips-v3.cjs');
for(const width of [360,390,430,768,1440])for(const theme of ['light','dark'])test(`All Trips V3 RTL ${width} ${theme}`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:900});await open(page,{theme});
 await expect(page.locator('[data-home-trip-browser]')).toBeVisible();
 await expect(page.locator('#active-trips>[data-cloud-trip]')).toHaveCount(2);
 await expect(page.locator('.tm-home-dock')).toHaveCount(1);await expect(page.locator('.tm-home-dock')).toBeVisible();await expect(page.locator('.tm-home-dock > *')).toHaveCount(5);await expect(page.locator('.tm-home-dock [data-shell-view],.tm-home-dock .ai-orb')).toHaveCount(0);
 await expect(page.locator('[data-home-greeting]')).toContainText('דנה');
 expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const controls=page.locator('.home-trip-tools input,.home-trip-tools button,.home-trip-filters button,#active-trips .trip-card-action-rail button');
 for(const box of await controls.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()))){expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);}
 const dates=page.locator('[data-cloud-trip="alltrips-rome"] .trip-date-range');
 const card=page.locator('[data-cloud-trip="alltrips-rome"]');
 const geometry=await card.evaluate(el=>{const copy=el.querySelector('.trip-copy'),link=el.querySelector('.trip-card');return {ratio:copy.clientWidth/link.clientWidth,shadow:getComputedStyle(copy).textShadow};});
 expect(geometry.ratio).toBeGreaterThan(.58);expect(geometry.ratio).toBeLessThan(.62);expect(geometry.shadow).toBe('none');
 const contrast=await page.locator('.trip-copy p,.trip-copy .tag,.trip-copy>strong,.trip-archive-toggle small').evaluateAll(nodes=>{
  function luminance(values){const rgb=values.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
  return nodes.map(el=>{const foreground=getComputedStyle(el).color.match(/[\d.]+/g).map(Number);const background=getComputedStyle(el.closest('.trip-copy,.trip-archive')).backgroundColor.match(/[\d.]+/g).map(Number);const alpha=background[3]??1;const bg=background.slice(0,3).map(x=>x*alpha);const a=luminance(foreground),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 });
 contrast.forEach(value=>expect(value).toBeGreaterThanOrEqual(4.5));
 await expect(dates).toHaveAttribute('aria-label',/מ־.*17.*עד.*20/);
 await expect(dates.locator('bdi')).toHaveCount(2);
 const endpoints=await dates.locator('bdi').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
 expect(endpoints[0].y<endpoints[1].y||endpoints[0].x>endpoints[1].x).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 // Decode real destination photos when available; a provider failure stays a fallback.
 await page.locator('#active-trips .trip-card').evaluateAll(async nodes=>{
  await Promise.race([Promise.allSettled(nodes.map(node=>{const match=getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(!match)return;const img=new Image();img.src=match[1];return img.decode();})),new Promise(resolve=>setTimeout(resolve,3000))]);
 });
 await page.screenshot({path:`.cache/v3/all-trips-${width}-${theme}.png`,fullPage:true});
 expect(errors).toEqual([]);
});
test('search and archive filter retain canonical dates, counts and opening URLs',async({page})=>{
 await open(page);const search=page.locator('[data-home-trip-search]');
 const before=await page.evaluate(()=>TravelMateCloud.getCachedTrips().map(({id,ownerId,start,end,budgetCurrency})=>({id,ownerId,start,end,budgetCurrency})));
 await search.fill('רומא');await expect(page.locator('#active-trips>.trip-card-shell:visible')).toHaveCount(1);
 await expect(page.locator('[data-home-trip-results]')).toContainText('נמצאו 1');
 await expect(page.locator('[data-home-active-count]')).toHaveText('(2)');
 await search.fill('איןיעדכזה');await expect(page.locator('[data-home-trip-results]')).toContainText('לא נמצאו');
 await search.fill('');await page.locator('[data-home-filter="archive"]').click();
 await expect(page.locator('#active-trips')).toBeHidden();await expect(page.locator('[data-archive-list]')).toBeVisible();
 await expect(page.locator('[data-cloud-trip="alltrips-future"]')).toBeVisible();
 await expect(page.locator('[data-cloud-trip="alltrips-past"]')).toBeVisible();
 await search.fill('אתונה');await expect(page.locator('[data-archive-list]>.trip-card-shell:visible')).toHaveCount(1);
 await expect(page.locator('[data-cloud-trip="alltrips-future"] a')).toHaveAttribute('href','trip/custom/index.html?id=alltrips-future');
 await page.locator('[data-archive-toggle]').click();await expect(page.locator('[data-home-filter="active"]')).toHaveAttribute('aria-pressed','true');
 // Sync owns ordering; searching must preserve the same canonical records.
 expect(await page.evaluate(()=>TravelMateCloud.getCachedTrips().map(t=>t.id).sort())).toEqual(trips.map(t=>t.id).sort());
 expect(await page.evaluate(()=>TravelMateCloud.getCachedTrips().map(({id,ownerId,start,end,budgetCurrency})=>({id,ownerId,start,end,budgetCurrency})))).toEqual(before);
});
test('empty, loading, error and retry states remain honest',async({page})=>{
 await open(page,{state:'loading',records:[]});await expect(page.locator('[data-home-trip-state]')).toContainText('טוען');
 await expect(page.locator('#active-trips')).toHaveAttribute('aria-busy','true');
 await page.screenshot({path:'.cache/v3/all-trips-loading.png',fullPage:true});
 await expect(page.locator('[data-home-trip-results]')).toBeEmpty();
 await expect.poll(()=>page.evaluate(()=>allTripsQA.pending.length)).toBeGreaterThan(0);
 await page.evaluate(()=>{allTripsQA.mode='error';allTripsQA.release();});
 await expect(page.locator('[data-home-trip-state]')).toContainText('הסנכרון לא הושלם');
 await page.screenshot({path:'.cache/v3/all-trips-error.png',fullPage:true});
 await expect(page.locator('[data-home-trip-results]')).toContainText('אין טיולים פעילים');
 await page.evaluate(()=>allTripsQA.mode='ready');await page.locator('[data-home-trip-retry]').click();
 await expect(page.locator('[data-home-trip-state]')).toBeEmpty();
 await expect(page.locator('[data-home-trip-results]')).toContainText('אין טיולים פעילים');
 await page.screenshot({path:'.cache/v3/all-trips-empty.png',fullPage:true});
});
test('offline cold hydration exposes only the cached account without a session or images',async({page})=>{
 await page.route('**/images.unsplash.com/**',r=>r.abort());
 await open(page,{state:'offline'});
 await expect(page.locator('[data-home-trip-state]')).toContainText('ללא רשת');
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
 await expect(page.locator('[data-home-personal-summary]')).toBeHidden();
 await expect(page.locator('[data-cloud-trip="alltrips-B-only"]')).toHaveCount(0);
 await page.locator('[data-home-trip-search]').fill('טוקיו');
 await expect(page.locator('#active-trips>.trip-card-shell:visible')).toHaveCount(1);
 await page.screenshot({path:'.cache/v3/all-trips-cached-offline.png',fullPage:true});
});
test('offline hydration, filtering and existing trip opening need no cloud response',async({page,context})=>{
 await open(page);await context.setOffline(true);
 await expect(page.locator('[data-home-trip-state]')).toContainText('ללא רשת');
 await page.locator('[data-home-trip-search]').fill('רומא');
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
 await page.screenshot({path:'.cache/v3/all-trips-offline.png',fullPage:true});
 await context.setOffline(false);await page.locator('[data-home-trip-search]').fill('');
 await page.locator('[data-cloud-trip="alltrips-rome"] a').click();
 await expect(page).toHaveURL(/trip\/custom\/index.html\?id=alltrips-rome/);
 await expect(page.locator('#overview [data-city]')).toHaveText('רומא');
 await page.locator('#overview .hero-back').click();await expect(page.locator('[data-home-trip-browser]')).toBeVisible();
});
test('switching accounts clears search and ignores the prior in-flight sync',async({page})=>{
 await open(page,{state:'loading'});await expect.poll(()=>page.evaluate(()=>allTripsQA.pending.length)).toBeGreaterThan(0);
 await page.locator('[data-home-trip-search]').fill('רומא');
 await page.evaluate(()=>{allTripsQA.mode='ready';allTripsQA.emit('alltrips-B');});
 await expect(page.locator('[data-home-trip-search]')).toHaveValue('');
 await expect(page.locator('[data-cloud-trip="alltrips-B-only"]')).toBeVisible();
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toHaveCount(0);
 await page.evaluate(()=>allTripsQA.release());
 await expect(page.locator('[data-home-trip-state]')).toBeEmpty();
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toHaveCount(0);
 expect(await page.evaluate(()=>TravelMateCloud.getCachedTrips().every(t=>t.ownerId==='alltrips-B'))).toBe(true);
 await page.evaluate(()=>allTripsQA.emit(null));await expect(page.locator('[data-home-trip-browser]')).toBeHidden();
 await expect(page.locator('[data-cloud-trip]')).toHaveCount(0);
});
test('keyboard entry, unchanged New Trip dialog and guest boundary',async({page})=>{
 await open(page);const button=page.locator('[data-home-filter="archive"]');
 await button.focus();await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-pressed','true');
 await page.locator('.home-trip-create').click();await expect(page.locator('#modal-destination')).toHaveClass(/open/);
 await page.keyboard.press('Escape');await expect(page.locator('#modal-destination')).not.toHaveClass(/open/);
 await expect(page.locator('.home-trip-create')).toBeFocused();
 await page.evaluate(()=>allTripsQA.emit(null));await expect(page.locator('[data-home-trip-browser]')).toBeHidden();
 await expect(page.locator('.home-landing')).toBeVisible();
});
test('archive activation remains canonical and survives offline reload',async({page})=>{
 await open(page,{state:'offline'});
 await page.locator('[data-cloud-trip="alltrips-rome"] [data-trip-activity]').click();
 await expect(page.locator('#active-trips>[data-cloud-trip]')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('#active-trips>[data-cloud-trip]')).toHaveCount(1);
 await page.locator('[data-home-filter="archive"]').click();
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
 await page.locator('[data-cloud-trip="alltrips-rome"] [data-trip-activity]').click();
 await page.locator('[data-home-filter="active"]').click();
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
 expect(await page.evaluate(()=>TravelMateCloud.getCachedTrips().find(t=>t.id==='alltrips-rome').isActive)).toBe(true);
});
