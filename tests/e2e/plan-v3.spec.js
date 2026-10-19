const {test,expect}=require('@playwright/test');
const {open,record}=require('./fixtures/plan-v3.cjs');
for(const width of [360,390,430,768,1440])for(const theme of ['light','dark'])test(`Plan V3 ${width} ${theme} RTL timeline and days`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width,height:900});await open(page,{theme});
 const days=page.locator('[data-plan-days]');await expect(days.locator('button')).toHaveCount(5);
 await expect(days.locator('[aria-pressed="true"]')).toHaveAttribute('data-plan-select-day','2026-10-17');
 await expect(page.locator('[data-activity-id="current"]')).toHaveAttribute('data-plan-activity-state','current');
 await expect(page.locator('[data-activity-id="done"] .tm-plan-state-badge')).toHaveText('הושלם');
 await expect(page.locator('[data-activity-id="next"]')).toHaveAttribute('data-plan-activity-state','upcoming');
 await expect(page.locator('.generated-day[data-day-date="2026-10-16"]')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const box of await days.locator('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()))){expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}
 const contrasts=await days.locator('button').evaluateAll(buttons=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
  function rgb(color){ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);}
  function luminance(channels){const a=channels.map(x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
  return buttons.map(button=>{ctx.clearRect(0,0,1,1);const ancestors=[];for(let n=button;n;n=n.parentElement)ancestors.unshift(n);for(const node of ancestors){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);}const background=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);const foreground=rgb(getComputedStyle(button).color),a=luminance(background),b=luminance(foreground);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
 });contrasts.forEach(value=>expect(value).toBeGreaterThanOrEqual(4.5));
 if(width<=1000)await expect(page.locator('.tm-trip-dock .ai-orb')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.tm-plan-item').first()).toHaveCSS('animation-name','none');
 await page.locator('#plan img').evaluateAll(async images=>{await Promise.race([Promise.allSettled(images.map(img=>img.decode())),new Promise(resolve=>setTimeout(resolve,3000))]);});
 await page.screenshot({path:`.cache/plan-v3/plan-${width}-${theme}.png`,fullPage:true});
 await days.locator('[data-plan-select-day="2026-10-19"]').click();
 await expect(page.locator('.generated-day[data-day-date="2026-10-19"]')).not.toHaveClass(/day-collapsed/);
 await expect(days.locator('[aria-pressed="true"]')).toHaveAttribute('data-plan-select-day','2026-10-19');
 expect(errors).toEqual([]);
});
test('day selection opens past and empty days without changing canonical trip data',async({page})=>{
 await open(page);const before=await page.evaluate(()=>JSON.stringify(TravelMateTripStore.getTrip('plan-v3')));
 await page.locator('[data-plan-select-day="2026-10-16"]').click();
 await expect(page.locator('.generated-day[data-day-date="2026-10-16"]')).toBeVisible();
 await page.locator('[data-plan-select-day="2026-10-18"]').click();
 await expect(page.locator('.generated-day[data-day-date="2026-10-18"] .tm-plan-empty-day')).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify(TravelMateTripStore.getTrip('plan-v3')))).toBe(before);
});
test('one Details toggle, canonical completion, edit and add activity',async({page})=>{
 await page.setViewportSize({width:390,height:900});await open(page);
 const row=page.locator('[data-activity-id="current"]'),toggle=row.locator('[data-plan-details-toggle]');
 await expect(toggle).toHaveCount(1);await toggle.focus();await page.keyboard.press('Enter');
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 for(const id of (await toggle.getAttribute('aria-controls')).split(' '))await expect(page.locator('[id="'+id+'"]')).toBeVisible();
 await row.locator('[data-edit]').click();await expect(page.locator('.planner-composer [name=title]')).toBeFocused();
 await page.locator('.planner-composer [name=title]').fill('קולוסיאום מעודכן');await page.locator('.planner-composer [type=submit]').click();
 await expect(page.locator('[data-activity-id="current"] .activity-copy>strong')).toHaveText('קולוסיאום מעודכן');
 await page.locator('[data-activity-id="current"] [data-toggle-done]').click();
 await expect(page.locator('[data-activity-id="current"]')).toHaveAttribute('data-plan-activity-state','completed');
 await expect(page.locator('[data-activity-id="current"] [data-toggle-done]')).toBeFocused();
 await page.locator('[data-new-activity]').click();await page.locator('.planner-composer [name=title]').fill('פעילות חדשה לבדיקה');
 await page.locator('.planner-composer [name=date]').selectOption('2026-10-17');await page.locator('.planner-composer [type=submit]').click();
 expect(await page.evaluate(()=>TravelMateTripStore.getTrip('plan-v3').activities.some(a=>a.title==='פעילות חדשה לבדיקה'))).toBe(true);
});
test('History return preserves selected day and Plan scroll, Today stays compact',async({page})=>{
 await page.setViewportSize({width:390,height:700});await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 await page.locator('[data-plan-select-day="2026-10-19"]').click();await page.waitForTimeout(100);
 await page.evaluate(()=>window.scrollBy(0,80));await page.waitForTimeout(100);
 const before=await page.evaluate(()=>scrollY);expect(before).toBeGreaterThan(100);
 await page.locator('[data-shell-view="overview"]').click();await expect(page.locator('.today-activities-toggle')).toHaveAttribute('aria-expanded','false');
 await page.locator('[data-shell-view="plan"]').click();
 await expect(page.locator('[data-plan-select-day="2026-10-19"]')).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before-40);
});
test('offline Plan data and error fallback survive canonical reload',async({page})=>{
 await page.route('**/images.unsplash.com/**',route=>route.abort());await open(page);
 await expect(page.locator('[data-activity-id="current"] .tm-plan-activity-media')).toHaveClass(/tm-plan-image-placeholder/);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));});
 await page.locator('[data-activity-id="next"] [data-toggle-done]').click();
 expect(await page.evaluate(()=>TravelMateTripStore.getTrip('plan-v3').activities.find(a=>a.id==='next').done)).toBe(true);
 await page.reload();await expect(page.locator('#plan')).toBeVisible();
 await expect(page.locator('[data-activity-id="next"]')).toHaveAttribute('data-plan-activity-state','completed');
});
