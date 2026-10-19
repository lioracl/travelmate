const {test,expect}=require('@playwright/test');
const {open,trips}=require('./fixtures/all-trips-v3.cjs');
for(const width of [360,390,430,768,1440])for(const theme of ['light','dark'])test(`All Trips V3 RTL ${width} ${theme}`,async({page},testInfo)=>{
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
  // R06 replaces the old 60% information pane with a measured 45/55 split.
  // Verify both physical panes, their shared boundary and the title's location.
  const geometry=await card.evaluate(el=>{
   const copy=el.querySelector('.trip-copy'),link=el.querySelector('.trip-card'),photo=el.querySelector('.trip-card-photo');
   const c=copy.getBoundingClientRect(),l=link.getBoundingClientRect(),p=photo.getBoundingClientRect(),h=copy.querySelector('h2').getBoundingClientRect();
   return {ratio:c.width/l.width,photoRatio:p.width/l.width,shadow:getComputedStyle(copy).textShadow,leftGap:p.left-l.left,boundaryGap:c.left-p.right,rightGap:l.right-c.right,photoHeight:p.height,linkHeight:l.height,titleLeft:h.left,photoRight:p.right,photoImage:getComputedStyle(photo).backgroundImage,sourceImage:getComputedStyle(link).backgroundImage};
  });
  expect(geometry.ratio).toBeGreaterThan(.54);expect(geometry.ratio).toBeLessThan(.56);
  expect(geometry.photoRatio).toBeGreaterThan(.44);expect(geometry.photoRatio).toBeLessThan(.46);
  for(const gap of [geometry.leftGap,geometry.boundaryGap,geometry.rightGap])expect(Math.abs(gap)).toBeLessThan(1);
  expect(geometry.photoHeight).toBeCloseTo(geometry.linkHeight,0);
  expect(geometry.titleLeft).toBeGreaterThanOrEqual(geometry.photoRight);
  expect(geometry.photoImage).toBe(geometry.sourceImage);expect(geometry.shadow).toBe('none');
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
  if([390,430].includes(width))await captureR06Evidence(page,testInfo,width,theme);
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

async function captureR06Evidence(page,testInfo,width,theme) {
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const photos=await page.locator('#active-trips .trip-card-photo').evaluateAll(async nodes=>Promise.all(nodes.map(async node=>{
  const css=getComputedStyle(node).backgroundImage,match=css.match(/url\(["']?(.*?)["']?\)/);
  if(!match)return {decoded:false,width:0,height:0};
  const img=new Image();img.src=match[1];
  const decoded=await Promise.race([img.decode().then(()=>true,()=>false),new Promise(resolve=>setTimeout(()=>resolve(false),3000))]);
  return {decoded,width:img.naturalWidth,height:img.naturalHeight};
 })));
 const eligible=photos.some(p=>p.decoded&&p.width>=300&&p.height>=180);
 const sourceHashes=Object.fromEntries(['assets/home.js','assets/home-organizer.css','assets/readable-glass.css'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',name))).digest('hex')]));
 const evidence={reference:'Original R06',referenceSHA256:'67ba6f5b50e5b27f0424921cc34aea68dd315b9979fbb0662b5ce9b17b8ad449',fixture:'Synthetic All Trips; canonical production renderer; existing fixture destination URLs only',width,theme,rtl:true,photos,photoFidelityEligible:eligible,sourceHashes};
 const evidencePath=testInfo.outputPath('r06-photo-evidence.json');
 fs.mkdirSync(path.dirname(evidencePath),{recursive:true});fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n');
 await testInfo.attach('r06-photo-evidence',{path:evidencePath,contentType:'application/json'});
 if(!eligible)testInfo.annotations.push({type:'photo-fidelity-unavailable',description:'No representative destination photo decoded. These captures establish layout/fallback only.'});
 await page.evaluate(()=>scrollTo(0,0));
 const label=eligible?'photo-present':'photo-unavailable';
 for(const [number,fullPage]of [[1,false],[2,true]]){
  const filename=number+'-r06-'+width+'-'+theme+'-'+label+(fullPage?'-full-list':'-viewport')+'.png';
  const output=testInfo.outputPath(filename);
  await page.screenshot({path:output,fullPage});
  await testInfo.attach(filename,{path:output,contentType:'image/png'});
 }
}

for(const width of [390,430])for(const theme of ['light','dark'])test('R06 long metadata and dock clearance '+width+' '+theme,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const records=[{...trips[0],city:'רומא והעיירות שלאורך החוף · Roma Centro',country:'איטליה והיעדים בדרך לטיול המשפחתי הארוך',savedPlaces:[{id:'one'},{id:'two'}]},trips[1]];
 await open(page,{theme,records});
 const card=page.locator('[data-cloud-trip="alltrips-rome"]');
 await expect(card.locator('.trip-calendar .trip-date-range bdi')).toHaveCount(2);
 await expect(card.locator('.trip-card-metrics .trip-day-count')).toHaveText('4 ימים');
 await expect(card.locator('.trip-card-metrics .trip-place-count')).toHaveText('2 מקומות שמורים');
 const geometry=await card.evaluate(el=>{
  const copy=el.querySelector('.trip-copy'),calendar=el.querySelector('.trip-calendar'),metrics=el.querySelector('.trip-card-metrics');
  const c=copy.getBoundingClientRect(),d=calendar.getBoundingClientRect(),m=metrics.getBoundingClientRect();
  return {metadataBelow:m.top>=d.bottom,overflow:Array.from(copy.querySelectorAll('h2,p,.tag')).some(n=>n.scrollWidth>n.clientWidth+1),contained:m.left>=c.left&&m.right<=c.right,border:getComputedStyle(metrics).borderTopWidth};
 });
 expect(geometry.metadataBelow).toBe(true);expect(geometry.overflow).toBe(false);expect(geometry.contained).toBe(true);expect(parseFloat(geometry.border)).toBeGreaterThanOrEqual(1);
 // Inspect the reachable hit area, not just CSS dimensions.
 await page.evaluate(()=>document.documentElement.style.setProperty('--tm-safe-bottom','28px'));
 const controls=page.locator('.home-trip-tools input,.home-trip-tools button,.home-trip-filters button,#active-trips .trip-card-action-rail button');
 for(let i=0;i<await controls.count();i++){
  const control=controls.nth(i);await control.focus();await control.evaluate(el=>el.scrollIntoView({block:'center'}));
  const hit=await control.evaluate(el=>{const r=el.getBoundingClientRect(),dock=document.querySelector('.tm-home-dock').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {width:r.width,height:r.height,clear:r.bottom<=dock.top,hit:el.contains(document.elementFromPoint(x,y)),outline:getComputedStyle(el).outlineStyle};});
  expect(hit.width).toBeGreaterThanOrEqual(44);expect(hit.height).toBeGreaterThanOrEqual(44);expect(hit.clear).toBe(true);expect(hit.hit).toBe(true);expect(hit.outline).not.toBe('none');
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await captureR06Evidence(page,testInfo,width,theme);
 await page.setViewportSize({width,height:520});
 const last=page.locator('#active-trips .trip-card-action-rail button').last();await last.evaluate(el=>el.scrollIntoView({block:'center'}));
 expect(await last.evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.tm-home-dock').getBoundingClientRect().top)).toBe(true);
});

for(const width of [390,430])for(const theme of ['light','dark'])test('R06 missing metadata and photo fallback '+width+' '+theme,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await page.route('**/images.unsplash.com/**',r=>r.abort());
 const missing={...trips[0],start:'',end:'',days:undefined,savedPlaces:undefined};
 // Offline cache preserves missing fields; cloud row normalization has its own existing defaults.
 await open(page,{theme,state:'offline',records:[missing]});
 const card=page.locator('[data-cloud-trip="alltrips-rome"]');
 await expect(card).toBeVisible();await expect(card.locator('.trip-calendar')).toHaveCount(0);await expect(card.locator('.trip-card-metrics')).toHaveCount(0);
 await expect(card.locator('.trip-day-count,.trip-place-count')).toHaveCount(0);
 await expect(card.locator('h2')).toHaveText('איטליה');await expect(card.locator('a')).toHaveAttribute('href','trip/custom/index.html?id=alltrips-rome');
 await expect(card.locator('.trip-card-action-rail button')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('[data-home-trip-search]').fill('רומא');await expect(card).toBeVisible();
 const evidencePath=testInfo.outputPath('fallback-only.json');
 const fs=require('node:fs');fs.mkdirSync(require('node:path').dirname(evidencePath),{recursive:true});
 fs.writeFileSync(evidencePath,JSON.stringify({fixture:'Synthetic offline account; all destination-photo requests blocked',photoFidelityEligible:false,width,theme,missingMetadata:true})+'\n');
 await testInfo.attach('fallback-only',{path:evidencePath,contentType:'application/json'});
 const output=testInfo.outputPath('3-r06-'+width+'-'+theme+'-missing-metadata-fallback.png');
 await page.screenshot({path:output,fullPage:true});await testInfo.attach('missing-metadata-fallback',{path:output,contentType:'image/png'});
});

test('R06 card actions and Home Places profile routes retain their owners',async({page})=>{
 await page.setViewportSize({width:390,height:900});await open(page);
 const baseline=await page.evaluate(()=>JSON.stringify(TravelMateCloud.getCachedTrips()));
 const edit=page.locator('[data-cloud-trip="alltrips-rome"] [data-trip-edit-dates]');
 await edit.click();await expect(page.locator('.trip-date-editor')).toBeVisible();await page.keyboard.press('Escape');await expect(edit).toBeFocused();
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-cloud-trip="alltrips-rome"] [data-trip-delete]').click();
 await expect(page.locator('[data-cloud-trip="alltrips-rome"]')).toBeVisible();
 await page.locator('[data-home-route="home"]').click();await expect(page.locator('[data-home-dashboard]')).toBeVisible();await expect(page.locator('[data-home-trip-browser]')).toBeHidden();
 await page.locator('[data-home-route="places"]').click();await expect(page.locator('#home-places')).toBeVisible();await expect(page.locator('[data-home-dashboard]')).toBeHidden();
 await page.locator('[data-home-route="trips"]').click();await expect(page.locator('[data-home-trip-browser]')).toBeVisible();
 await page.locator('.home-profile-launcher').click();await expect(page.locator('.cloud-account-backdrop')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.cloud-account-backdrop')).toBeHidden();
 await page.locator('.home-trip-create').click();await expect(page.locator('#modal-destination')).toHaveClass(/open/);await page.keyboard.press('Escape');await expect(page.locator('.home-trip-create')).toBeFocused();
 expect(await page.evaluate(()=>JSON.stringify(TravelMateCloud.getCachedTrips()))).toBe(baseline);
});
