const {test,expect}=require('@playwright/test');const fs=require('node:fs');
test.use({serviceWorkers:'block'});
for(const width of [360,390,430])for(const theme of ['light','dark'])test(`native header avatar ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:568});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const fixture=fs.readFileSync('trip/custom/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 await page.route('**/native-profile.html',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('/native-profile.html');
 await page.evaluate(theme=>{localStorage.setItem('travelmate-theme',theme);document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty('--safe-area-inset-top','32px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');document.body.classList.add('tm-new-design');document.body.dataset.tripKind='custom';window.travelMateTripReady=Promise.resolve({id:'qa',ownerId:'A'});window.TravelMateCloud={getSession:async()=>({user:{id:'A',user_metadata:{display_name:'דנה ישראלי'}}}),onAuthChange:()=>Promise.resolve(),listTripMembers:async()=>[{user_id:'A'},{user_id:'B'}],listTripChangeEvents:async()=>[],getTripChangeReadState:async()=>({last_read_event_id:0}),subscribeToTripChangeEvents:async()=>()=>{}};},theme);
 await page.addScriptTag({url:'/assets/user-profile.js'});await page.addScriptTag({url:'/assets/app.js'});await page.addScriptTag({url:'/assets/trip-change-notifications.js'});
 const avatar=page.locator('.mobile-header [data-trip-profile-avatar]');await expect(avatar).toBeVisible();await expect(avatar).toContainText('די');await expect(page.locator('.trip-notification-mobile')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tm-shell-header-height').trim())).not.toBe('');
 const rects=await page.locator('.mobile-header').evaluate(header=>{return [...header.querySelectorAll('a,button')].filter(el=>el.getBoundingClientRect().width&&getComputedStyle(el).display!=='none').map(el=>({name:el.className,...el.getBoundingClientRect().toJSON()}));});
 for(const r of rects){expect(r.y,r.name).toBeGreaterThanOrEqual(32);expect(r.x,r.name).toBeGreaterThanOrEqual(0);expect(r.right,r.name).toBeLessThanOrEqual(width);expect(r.width,r.name).toBeGreaterThanOrEqual(44);}
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];expect(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y||b.bottom<=a.y,`${a.name} overlaps ${b.name}`).toBe(true);}
 const bell=page.locator('.trip-notification-mobile'),panel=page.locator('.trip-notification-panel');await bell.click();await expect(panel).toBeVisible();await bell.click();await expect(panel).toBeHidden();await bell.click();await page.locator('[data-trip-notification-close]').click();await expect(panel).toBeHidden();await expect(page.locator('[data-trip-notification-badge]')).toHaveCount(0);
 await page.evaluate(()=>dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user:{id:'A',user_metadata:{display_name:'דנה ישראלי',avatar_url:location.origin+'/assets/icons/travelmate-192.png'}}}})));
 await expect(avatar.locator('.has-image')).toHaveCount(1);await expect(avatar.locator('[data-trip-profile-avatar-image]')).toHaveCSS('background-size','cover');
 await page.screenshot({path:test.info().outputPath('native-header.png')});
});
