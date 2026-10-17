const {test,expect}=require('@playwright/test');
const {open,search,record}=require('./fixtures/places-v3.cjs');
for(const width of [360,390,430,768,1440])for(const theme of ['light','dark'])test(`Places V3 ${width} ${theme} RTL search and saved`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await open(page,{theme});await search(page);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>placesGpsCalls)).toBe(0);
 for(const button of await page.locator('.places-v3-views button').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);}
 const contrast=await page.locator('.places-v3-views button[aria-pressed="true"]').evaluate(button=>{const c=getComputedStyle(button),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=channels=>channels.map(value=>{value/=255;return value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4)}).reduce((total,value,index)=>total+value*[.2126,.7152,.0722][index],0),a=lum(rgb(c.color)),b=lum(rgb(c.backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});expect(contrast).toBeGreaterThanOrEqual(4.5);
 if(width<=1000)await expect(page.locator('.tm-trip-dock .ai-orb')).toBeVisible();
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.places-v3-views')).toHaveCSS('animation-name','none');
 await page.locator('[data-nearby-results]').scrollIntoViewIfNeeded();await page.locator('[data-nearby-results] img').evaluateAll(async images=>Promise.race([Promise.allSettled(images.map(img=>img.decode())),new Promise(resolve=>setTimeout(resolve,2500))]));
 await page.screenshot({path:`.cache/places-v3/places-${width}-${theme}.png`,fullPage:true});
 await page.locator('[data-places-view="saved"]').click();await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();expect(errors).toEqual([]);
});
test('map/list selection, filters, details actions, Escape focus and provider error',async({page})=>{
 await page.setViewportSize({width:390,height:900});await open(page);await search(page);
 const first=page.locator('[data-nearby-results]>.nearby-result').first(),details=first.locator('[data-nearby-details]');await details.focus();await page.keyboard.press('Enter');
 await expect(page.locator('[data-nearby-map-shell]')).toBeVisible();await expect(page.locator('.tm-poi-marker')).toHaveCount(3);await expect(first).toHaveClass(/is-selected/);
 await expect(details).toHaveAttribute('aria-expanded','true');await expect(page.locator('.tm-poi-marker').first()).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-nearby-map-detail] .google-rating-link')).toHaveAttribute('href',/google\.com\/maps\/search/);
 await expect(page.locator('[data-nearby-map-detail] a:has(.fa-globe)')).toHaveAttribute('href','https://example.org/controlled-place');
 await page.keyboard.press('Escape');await expect(details).toBeFocused();
 await page.locator('.tm-poi-marker').last().click();await expect(page.locator('[data-nearby-map-detail]')).toContainText('מוזיאון בדיקה');await expect(page.locator('.tm-poi-marker').last()).toHaveClass(/selected/);
 await page.locator('[data-nearby-detail-close]').click();await expect(page.locator('.tm-poi-marker').last()).toBeFocused();
 await page.locator('[data-nearby-result-filter]').selectOption('website');await expect(page.locator('.tm-poi-marker')).toHaveCount(1);
 await page.locator('[data-places-map-size]').click();await expect(page.locator('[data-places-map-size]')).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>document.querySelector('[data-nearby-places]')._travelMateMap.emit('error'));await expect(page.locator('[data-nearby-status]')).toContainText('מפת הרקע');
 await page.locator('[data-places-view="list"]').click();await expect(page.locator('[data-nearby-map-shell]')).toBeHidden();await expect(first).toBeVisible();
});
test('canonical save/unsave, saved search, offline restoration and trip boundary',async({page})=>{
 await open(page);await search(page);const card=page.locator('[data-nearby-results]>.nearby-result').first();await card.locator('.nearby-save-primary').click();
 await expect(card.locator('.nearby-save-primary')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-places-saved-count]')).toHaveText('2');
 await page.locator('[data-places-view="saved"]').click();await page.locator('[data-places-saved-search]').fill('לא קיים');await expect(page.locator('[data-places-saved-empty]')).toBeVisible();await page.locator('[data-places-saved-search]').fill('קולוסיאום');await expect(page.locator('[data-saved-shelf-id]:visible')).toHaveCount(1);
 await page.locator('[data-places-view="list"]').click();page.once('dialog',dialog=>dialog.accept());await card.locator('[data-places-unsave]').click();await expect(card.locator('.nearby-save-primary')).toHaveAttribute('aria-pressed','false');await expect(card.locator('.nearby-save-primary')).toBeFocused();
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});await expect(page.locator('.places-v3-feedback')).toContainText('אין חיבור');
 await page.reload();await expect(page.locator('.places-v3-views')).toBeVisible();await page.locator('[data-places-view="saved"]').click();await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
 expect(await page.evaluate(()=>TravelMateTripStore.getTrip('places-v3').savedPlaces.length)).toBe(1);expect(await page.evaluate(()=>TravelMateTripStore.getTrip('missing-trip'))).toBeFalsy();
});
for(const gps of ['accepted','denied','delayed','unavailable'])test(`GPS consent ${gps} preserves fallback`,async({page})=>{
 await open(page,{gps});await page.locator('[data-nearby-mode="gps"]').click();expect(await page.evaluate(()=>placesGpsCalls)).toBe(0);await page.locator('[data-nearby-execute-search]').click();await expect(page.locator('[data-gps-consent]')).toBeVisible();expect(await page.evaluate(()=>placesGpsCalls)).toBe(0);await page.locator('[data-gps-once]').click();
 if(gps==='delayed'){await expect(page.locator('[data-nearby-status]')).toContainText('מקבל מיקום');await expect(page.locator('[data-nearby-execute-search]')).toBeDisabled();await page.evaluate(()=>finishPlacesGps());}
 if(gps==='accepted'||gps==='delayed')await expect(page.locator('[data-nearby-results]>.nearby-result')).toHaveCount(3);else await expect(page.locator('[data-nearby-status]')).toHaveClass(/is-error/);
 await page.locator('[data-places-view="saved"]').click();await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
});
for(const provider of ['empty','error','delayed'])test(`provider ${provider} state is accessible`,async({page})=>{
 await open(page,{provider});await page.locator('[data-nearby-execute-search]').click();
 if(provider==='delayed')await expect(page.locator('.nearby-results-region')).toHaveAttribute('aria-busy','true');
 else await expect(page.locator('[data-nearby-status]')).toContainText(provider==='empty'?'לא נמצאו':'לא הצלחנו');
 await page.locator('[data-places-view="saved"]').click();await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
});
test('Places view, filters and scroll survive History return',async({page})=>{
 await page.setViewportSize({width:390,height:700});await open(page);await search(page);await page.locator('[data-nearby-result-sort]').selectOption('name');await page.locator('[data-places-view="saved"]').click();await page.locator('[data-places-saved-search]').fill('שחזור');await page.locator('[data-saved-shelf-id="saved-controlled"]').scrollIntoViewIfNeeded();const top=await page.evaluate(()=>scrollY);
 await page.locator('[data-shell-view="overview"]').click();await page.locator('[data-shell-view="places"]').click();await expect(page.locator('#places')).toBeVisible();await expect(page.locator('button[data-places-view="saved"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-places-saved-search]')).toHaveValue('שחזור');await expect(page.locator('[data-nearby-result-sort]')).toHaveValue('name');await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThanOrEqual(top-50);
});
test('system Back closes place details through the existing History owner',async({page})=>{
 await open(page);await search(page);const details=page.locator('[data-nearby-results]>.nearby-result').first().locator('[data-nearby-details]');await details.click();await expect(page.locator('[data-nearby-map-detail]')).toBeVisible();await expect.poll(()=>page.evaluate(()=>history.state.travelMateOverlay)).toBe('places-detail');await page.goBack();await expect(page.locator('[data-nearby-map-detail]')).toBeHidden();await expect(page.locator('#places')).toBeVisible();await expect(details).toBeFocused();
});
test('category and name search use the existing provider query; consent refusal never calls GPS',async({page})=>{
 await open(page);await page.locator('.nearby-category-chips [data-nearby-category-chip="restaurants"]').click();await page.locator('[data-nearby-place-name-input]').fill('Controlled POI');const request=page.waitForRequest(request=>request.url().includes('overpass'));await page.locator('[data-nearby-execute-search]').click();const body=decodeURIComponent((await request).postData());expect(body).toContain('restaurant|cafe');expect(body).toContain('controlled poi');await expect(page.locator('[data-nearby-results]>.nearby-result')).toHaveCount(3);
 await page.locator('[data-nearby-mode="gps"]').click();await page.locator('[data-nearby-execute-search]').click();await expect(page.locator('[data-gps-once]')).toBeFocused();await page.locator('[data-gps-deny]').click();expect(await page.evaluate(()=>placesGpsCalls)).toBe(0);await expect(page.locator('[data-nearby-status]')).toContainText('בוטל');
});
test('offline provider failure and unavailable photos retain saved-place access',async({page})=>{
 await page.route('**/images.unsplash.com/**',route=>route.abort());await open(page,{provider:'error'});await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'))});await page.locator('[data-nearby-execute-search]').click();await expect(page.locator('[data-nearby-status]')).toContainText('אין חיבור לרשת');await page.locator('button[data-places-view="saved"]').click();await expect(page.locator('[data-saved-shelf-id="saved-controlled"]')).toBeVisible();
});
