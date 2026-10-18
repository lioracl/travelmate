const {test, expect} = require('@playwright/test');
const path = require('node:path');

const {trip, open, previewOrigin} = require('./fixtures/overview-v3.cjs');

for (const width of [360,390,430,768]) for (const theme of ['light','dark']) {
  test(`V3 RTL layout ${width} ${theme}`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:844});
    await open(page,{theme});
    await expect(page.locator('#overview [data-city]')).toHaveText('רומא');
    await expect(page.locator('#overview [data-dates]')).toContainText('2026');
    await expect(page.locator('#overview .hero-back')).toBeVisible();
    await expect(page.locator('[data-weather-temperature]')).toHaveText('28°');
    await expect(page.locator('.trip-today-agenda li')).toHaveCount(3);
    await expect(page.locator('[data-overview-budget-title]')).toContainText('1,000');
    const links=page.locator('.tm-trip-dock>a');
    await expect(links).toHaveCount(3);
    await expect(page.locator('.ai-orb')).toHaveCount(1);
    await expect(page.locator('.tm-trip-dock')).toBeVisible();
    const rects=await page.locator('.tm-trip-dock>a,.tm-trip-dock>button,.tm-trip-dock .ai-orb').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
    for(const rect of rects){expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.right).toBeLessThanOrEqual(width);}
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
      const a=rects[i],b=rects[j];expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBe(true);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('.trip-today').evaluate(el=>el.clientWidth)).toBeGreaterThan(width-70);
    const palette=await page.locator('.trip-home-actions [data-overview-action]').evaluateAll(cards=>{
      function luminance(color){
        const channels=color.startsWith('#')?color.slice(1).match(/../g).map(n=>parseInt(n,16)):color.match(/[\d.]+/g).slice(0,3).map(Number);
        const rgb=channels.map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4)});
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      }
      function contrast(a,b){a=luminance(a);b=luminance(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
      return cards.map(card=>{
        const background=getComputedStyle(card).backgroundColor;
        const bookmark=card.querySelector('.overview-saved-accent');
        const savedSurface=getComputedStyle(card).getPropertyValue('--tm-overview-saved-surface').trim();
        return {role:card.dataset.overviewAction,background,icon:getComputedStyle(card.querySelector('i')).color,
          textContrast:contrast(getComputedStyle(card.querySelector('span')).color,background),
          iconContrast:contrast(getComputedStyle(card.querySelector('i')).color,background),
          savedContrast:bookmark?contrast(getComputedStyle(bookmark).color,savedSurface):null,
          savedLabelContrast:bookmark?contrast(getComputedStyle(card.querySelector('span')).color,savedSurface):null};
      });
    });
    expect(new Set(palette.map(p=>p.background)).size).toBe(palette.length);
    for(const card of palette){expect(card.textContrast,card.role+' label').toBeGreaterThanOrEqual(4.5);expect(card.iconContrast,card.role+' icon').toBeGreaterThanOrEqual(3);}
    const combined=palette.find(card=>card.role==='map-places');
    expect(combined.savedContrast).toBeGreaterThanOrEqual(3);expect(combined.savedLabelContrast).toBeGreaterThanOrEqual(4.5);
    await test.info().attach('Action palette contrast',{body:JSON.stringify(palette,null,2),contentType:'application/json'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(page.locator('.today-activities-expanded')).toHaveCSS('animation-name','none');
    expect(await page.locator('.weather-atmosphere [class]').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).animationName==='none'))).toBe(true);
    // Destination lookup is asynchronous and independent of trip hydration.
    await expect(page.locator('#overview')).toHaveAttribute('data-destination-image','ready',{timeout:20000});
    await page.locator('#overview').evaluate(async hero=>{
      const match=getComputedStyle(hero).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
      if(match){const image=new Image();image.src=match[1];await image.decode();}
    });
    await page.screenshot({path:path.join('.cache/v3',`overview-${width}-${theme}.png`),fullPage:true});
    if(width===390||width===430)await page.locator('.trip-home-actions').screenshot({path:path.join('.cache/v3',`actions-${width}-${theme}.png`)});
    expect(errors).toEqual([]);
  });
}

test('dock delegates views and overlays to History, More and real assistant',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.locator('[data-shell-view="plan"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view','plan');
  await expect(page).toHaveURL(/id=v3-review.*view=plan/);
  await page.goBack();await expect(page.locator('[data-shell-view="overview"]')).toHaveAttribute('aria-current','page');
  await page.locator('[data-shell-view="places"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','places');
  await page.locator('[data-shell-more]').click();await expect(page.locator('body')).toHaveClass(/mobile-menu-open/);
  await expect(page.locator('[data-shell-more]')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(page.locator('body')).not.toHaveClass(/mobile-menu-open/);
  await page.locator('[data-shell-view="overview"]').click();
  await page.locator('.trip-home-actions [data-budget-converter-open]').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view','budget');
  await expect(page.locator('[data-currency-converter]')).toBeVisible();
  await test.info().attach('Budget and converter',{body:await page.screenshot(),contentType:'image/png'});
  await page.goBack();await page.locator('.trip-home-actions a[href*="documents"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view','documents');
  await page.goBack();await page.locator('.ai-orb').click();
  await expect(page.locator('.ai-panel')).toBeVisible();
  await test.info().attach('MATE existing assistant',{body:await page.screenshot(),contentType:'image/png'});
  await page.goBack();await expect(page.locator('.ai-panel')).toBeHidden();
  await expect(page.locator('.tm-trip-dock .ai-orb')).toBeFocused();
});

test('Today expands and opens Plan; Weather opens and returns through History',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  const toggle=page.locator('.today-activities-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.today-activities-summary')).toBeVisible();
  await expect(page.locator('[data-next-title]')).not.toHaveText('');
  await expect(page.locator('.today-activities-expanded')).toBeHidden();
  await toggle.click();await expect(page.locator('.trip-today-agenda')).toBeVisible();
  await test.info().attach('Today expanded',{body:await page.screenshot(),contentType:'image/png'});
  await page.locator('.trip-today-actions .primary').click();
  await expect(page.locator('body')).toHaveAttribute('data-trip-view','plan');
  await page.goBack();await expect(page.locator('body')).toHaveAttribute('data-trip-view','overview');
  await page.locator('[data-weather-top-widget]').click();
  await expect(page.locator('#modal-weather-live')).toHaveClass(/open/);
  await expect(page.locator('.weather-live-grid')).toBeVisible();
  await test.info().attach('Weather forecast',{body:await page.screenshot(),contentType:'image/png'});
  await page.goBack();await expect(page.locator('#modal-weather-live')).not.toHaveClass(/open/);
  await expect(page.locator('[data-weather-top-widget]')).toBeFocused();
});

test('explicit All Trips exit preserves the normal public/account boundary',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await page.locator('#overview .hero-back').click();
  await expect(page).toHaveURL(previewOrigin+'/index.html#active-trips');
  await expect(page.locator('body')).toHaveClass(/home-page/);
  await expect(page.locator('[data-home-carousel]')).toBeVisible();await expect(page.locator('.landing-login')).toBeVisible();
  await expect(page.locator('.tm-home-header')).toBeHidden();await expect(page.locator('[data-home-dashboard]')).toBeHidden();await expect(page.locator('.tm-trip-dock')).toBeHidden();await expect(page.locator('[data-home-trip-browser]')).toBeHidden();
  await test.info().attach('All Trips normal entry',{body:await page.screenshot(),contentType:'image/png'});
});

test('fixture storage is confined to the local preview origin',async({page})=>{
  await open(page);
  expect(new URL(page.url()).origin).toBe(previewOrigin);
  await page.route('http://preview-outside.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated origin check</title>'}));
  await page.goto('http://preview-outside.invalid/');
  expect(await page.evaluate(()=>localStorage.getItem('travelmate-trips'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('travelmate-theme'))).toBeNull();
  expect(await page.evaluate(async()=>{try{return await(await fetch('https://api.open-meteo.com/v1/forecast')).json()}catch(_){return null}})).toBeNull();
});

test('weather loading and offline cache remain visibly distinct',async({page,context})=>{
  await open(page);
  await expect(page.locator('[data-weather-temperature]')).toHaveText('28°');
  let release;
  const held=new Promise(resolve=>{release=resolve});
  await page.route('**/api.open-meteo.com/**',async r=>{await held;await r.fulfill({json:{
    current:{temperature_2m:28,apparent_temperature:30,weather_code:2,is_day:1},
    hourly:{time:[]},daily:{time:['2026-10-17'],temperature_2m_max:[31],temperature_2m_min:[24],weather_code:[2],precipitation_probability_max:[0],wind_speed_10m_max:[9],uv_index_max:[4]}
  }})});
  await page.locator('[data-weather-top-widget]').click();
  await page.locator('[data-weather-refresh]').click();
  try{await expect(page.locator('.weather-loading')).toContainText('מרענן');}finally{release();}
  await expect(page.locator('.weather-live-grid')).toBeVisible();
  await page.unroute('**/api.open-meteo.com/**');
  await context.setOffline(true);
  await page.locator('[data-weather-refresh]').click();
  await expect(page.locator('[data-weather-top-widget]')).toHaveAttribute('data-weather-freshness','stale');
  await expect(page.locator('[data-weather-updated]')).toContainText('תחזית שמורה');
  await expect(page.locator('[data-weather-temperature]')).toHaveText('28°');
});

test('static and lazy stylesheet ownership is stable across feature navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  const styleSnapshot=()=>page.evaluate(()=>[...document.querySelectorAll('link[rel="stylesheet"]')].filter(x=>x.href.startsWith(location.origin)).map(x=>({file:new URL(x.href).pathname.split('/').pop(),loaded:!!x.sheet})));
  const initial=await styleSnapshot();
  expect(initial.every(x=>x.loaded)).toBe(true);
  await expect(page.locator('script[src*="trip-experience.js"]')).toHaveCount(0);
  await expect(page.locator('script[src*="auto-planner.js"]')).toHaveCount(0);
  await page.locator('[data-shell-view="plan"]').click();
  await expect(page.locator('.generated-day').first()).toBeAttached();
  await page.locator('[data-shell-view="overview"]').click();
  const loaded=await styleSnapshot();
  expect(loaded.filter(x=>x.file==='readable-glass.css')).toHaveLength(1);
  expect(loaded.filter(x=>x.file==='app-shell.css')).toHaveLength(1);
  expect(loaded.findIndex(x=>x.file==='plan-ux-polish.css')).toBeLessThan(loaded.findIndex(x=>x.file==='readable-glass.css'));
  await test.info().attach('Stylesheet order before and after lazy Plan',{body:JSON.stringify({initial,loaded},null,2),contentType:'application/json'});
});

test('weather error, unavailable images, and offline navigation remain honest',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/images.unsplash.com/**',r=>r.abort());
  await open(page,{weather:'error'});
  await expect(page.locator('[data-weather-summary]')).toContainText('לא הצלחנו');
  await expect(page.locator('[data-weather-temperature]')).toHaveText('--°');
  await page.locator('[data-weather-top-widget]').click();await expect(page.locator('#modal-weather-live')).toHaveClass(/open/);
  await page.goBack();
  await page.locator('[data-shell-view="plan"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','plan');
  await page.locator('[data-shell-view="overview"]').click();
  await context.setOffline(true);
  await page.locator('[data-shell-view="plan"]').click();await expect(page.locator('body')).toHaveAttribute('data-trip-view','plan');
  await page.goBack();await expect(page.locator('body')).toHaveAttribute('data-trip-view','overview');
  await expect(page.locator('#overview')).toBeVisible();
});

for(const phase of ['before','after','completed']) test(`canonical Today ${phase}`,async({page})=>{
  await page.setViewportSize({width:430,height:844});
  const record=structuredClone(trip);
  if(phase==='before'){record.start='2026-10-18';record.end='2026-10-20';}
  if(phase==='after'){record.start='2026-10-14';record.end='2026-10-16';}
  if(phase==='completed')record.activities.forEach(a=>a.done=true);
  await open(page,{record});
  if(phase==='before')await expect(page.locator('.trip-today')).toContainText('מחר יוצאים לדרך');
  if(phase==='after')await expect(page.locator('.trip-today')).toContainText('הטיול הסתיים');
  if(phase==='completed'){await expect(page.locator('.trip-today-row.is-complete')).toHaveCount(3);await expect(page.locator('.today-activities-summary')).toContainText('אין עוד פעילויות היום');}
});

test('stale weather is labelled with its saved time after provider failure',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page);
  await expect(page.locator('[data-weather-temperature]')).toHaveText('28°');
  await page.evaluate(()=>{
    Object.keys(localStorage).filter(key=>key.startsWith('travelmate-weather-forecast:')).forEach(key=>{
      const cached=JSON.parse(localStorage.getItem(key));cached.savedAt=Date.now()-86400000;
      localStorage.setItem(key,JSON.stringify(cached));
    });
  });
  await page.route('**/api.open-meteo.com/**',r=>r.abort());
  await page.locator('[data-weather-top-widget]').click();
  await page.locator('[data-weather-refresh]').click();
  await expect(page.locator('[data-weather-top-widget]')).toHaveAttribute('data-weather-freshness','stale');
  await expect(page.locator('small[data-weather-freshness]')).toContainText('תחזית שמורה');
  await expect(page.locator('small[data-weather-freshness]')).toContainText('לא ניתן לעדכן');
  await expect(page.locator('[data-weather-updated]')).toContainText('תחזית שמורה');
  await expect(page.locator('[data-weather-updated]')).not.toContainText('עודכן עכשיו');
});

test('keyboard, profile placement and alternate appearance preferences remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{localStorage.setItem('travelmate-surface-theme','warm-sand');});
  await open(page,{accent:'plum'});
  await page.waitForFunction(()=>document.documentElement.dataset.accent==='plum');
  await expect(page.locator('html')).toHaveAttribute('data-surface-theme','warm-sand');
  await page.locator('[data-shell-view="overview"]').focus();
  await page.keyboard.press('Tab');await expect(page.locator('[data-shell-view="plan"]')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('.tm-trip-dock .ai-orb')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('[data-shell-view="places"]')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('[data-shell-more]')).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('body')).toHaveClass(/mobile-menu-open/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>Boolean(window.TravelMateUserProfile));
  await page.evaluate(async()=>{
    // Keep the session and its profile event consistent, including pageshow refreshes.
    await window.TravelMateCloud.getSession();
    const user={id:'local-qa',user_metadata:{display_name:'דנה ישראלי'}};
    window.TravelMateCloud=Object.assign({},window.TravelMateCloud,{getSession:async()=>({user})});
    dispatchEvent(new CustomEvent('travelmate:profile-change',{detail:{user}}));
  });
  await expect(page.locator('#overview [data-trip-profile-avatar]')).toBeVisible();
  await expect(page.locator('#overview [data-trip-profile-avatar]')).toContainText('די');
  await expect(page.locator('[data-trip-profile-avatar]')).toHaveCount(1);
});
