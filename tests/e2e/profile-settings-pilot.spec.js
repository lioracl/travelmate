const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
// Real index, AppShell, app loader, Home, Settings, Profile, Theme and preferences.
// Only Cloud/provider/auth boundary is synthetic. No live HTTP/SW/device claim.
test.use({serviceWorkers:'block'});
test.describe.configure({retries:0});
async function boot(page, {query='profile', user='A', theme='light', failTrips=false, holdAccount=false, long=false}={}) {
  let release, held;
  const gate = new Promise(resolve => release=resolve);
  const arrived = new Promise(resolve => held=resolve);
  await page.addInitScript(({user,theme,failTrips,long})=>{
    localStorage.setItem('travelmate-theme',theme);
    localStorage.setItem('travelmate-active-user',user || '');
    let current=user, cacheUnavailable=failTrips;
    const callbacks=[], forbidden=[], calls=[];
    const session=()=>current ? {user:{id:current,email:current+'@example.invalid',user_metadata:{display_name:long ? ('Synthetic '+current+' long name ').repeat(12) : 'Synthetic '+current,travelmate_preferences:{learningEnabled:false,interests:['nature','food'],pace:'balanced'}}}} : null;
    const trips=()=>{if(cacheUnavailable)throw new Error('SYNTHETIC_CACHE_UNAVAILABLE');return [];};
    const emit=next=>{current=next;localStorage.setItem('travelmate-active-user',next||'');callbacks.forEach(fn=>fn(next?'SIGNED_IN':'SIGNED_OUT',session()));};
    window.pilotQA={emit,forbidden,calls,setCacheUnavailable:value=>cacheUnavailable=value};
    window.TravelMateCloud={
      getSession:async()=>session(),getCachedTrips:trips,getLocalTrips:()=>[],
      onAuthChange:async fn=>{callbacks.push(fn);return {};},
      listMfaFactors:async()=>({data:{totp:[]}}),getAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}}),
      getClient:async()=>{throw new Error('SYNTHETIC_NO_ADMIN_CLIENT');},
      cacheChangeType:()=>'',authRedirectUrl:()=>location.href,
      validateAvatarFile:()=>({}),syncLocalTrips:async()=>[],
      signOut:async()=>{emit(null);return {error:null};}
    };
    if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia=async()=>{forbidden.push('microphone');throw new Error('NO_REAL_MIC');};
    if(navigator.geolocation) navigator.geolocation.getCurrentPosition=()=>{forbidden.push('GPS');throw new Error('NO_REAL_GPS');};
  },{user,theme,failTrips,long});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname.endsWith('/cloud-sync.js'))return route.fulfill({contentType:'text/javascript',body:'/* Synthetic Cloud boundary is installed before actual app boot. */'});
    if(holdAccount && url.pathname.endsWith('/security-center.js')){held();await gate;}
    const rel=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    const ext=path.extname(file), type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[ext]||'application/octet-stream';
    return route.fulfill({contentType:type,body:fs.readFileSync(file)});
  });
  await page.goto('/index.html'+(query?'?v12pilot='+query:''),{waitUntil:'domcontentloaded'});
  return {release,arrived};
}
async function openProfile(page) {
  await expect(page.locator('body')).toHaveClass(/is-authenticated/);
  await expect.poll(()=>page.evaluate(()=>Boolean(TravelMateFeatures && TravelMateAppShell))).toBe(true);
  const visible=await page.locator('[data-cloud-account-backdrop]').isVisible();
  if(!visible)await page.locator('.home-profile-launcher').click();
  await expect(page.locator('[data-v12-pilot="profile"]')).toBeVisible();
}
for(const width of [360,390,430,768]) for(const theme of ['light','dark']) {
  test('pilot real-owner roundtrip '+width+' '+theme,async({page},info)=>{
    await page.setViewportSize({width,height:900});await boot(page,{theme});await openProfile(page);
    const panel=page.locator('[data-v12-pilot="profile"]');
    await expect(panel.locator('[data-pilot-dock]')).toHaveCount(1);
    await expect(panel.locator('[data-smart-profile-name]')).toContainText('Synthetic A');
    await page.evaluate(()=>{pilotQA.edit=document.querySelector('[data-cloud-account] [data-profile-wizard-open]');});
    await info.attach('profile-runtime',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await panel.locator('.tm121-profile-cover [data-pilot-action="settings"]').click();
    const settings=page.locator('[data-v12-pilot="settings"]');
    await expect(settings).toBeVisible();
    await expect(settings.locator('.tm121-settings-cards > .tm121-card')).toHaveCount(6);
    await expect(settings.locator('[data-pilot-dock]')).toHaveCount(1);
    await expect(page.locator('[data-cloud-account-backdrop]')).toBeHidden();
    await settings.locator('[data-theme-choice="'+(theme==='light'?'dark':'light')+'"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='light'?'dark':'light');
    await info.attach('settings-runtime',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await settings.locator('[data-security-close]').click();
    await expect(page.locator('[data-security-dialog]')).toBeHidden();
    const mobileMenu=page.locator('[data-mobile-menu]');
    if(await mobileMenu.isVisible())await expect(mobileMenu).toBeFocused();
    else await expect(page.locator('.home-profile-launcher')).toBeFocused();
    await openProfile(page);
    expect(await page.evaluate(()=>pilotQA.edit===document.querySelector('[data-cloud-account] [data-profile-wizard-open]'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-cloud-account-backdrop]')).toBeHidden();
    await expect(page.locator('.home-profile-launcher')).toBeFocused();
    expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
    expect(await page.locator('[data-v12-pilot]').count()).toBe(0);
  });
  test('pilot Profile and Settings long text at 200 percent root font '+width+' '+theme,async({page},info)=>{
    await page.setViewportSize({width,height:640});await boot(page,{theme,long:true});await openProfile(page);
    const originalFont=await page.locator('html').evaluate(n=>parseFloat(getComputedStyle(n).fontSize));
    await page.addStyleTag({content:'html{font-size:'+(originalFont*2)+'px}'});
    expect(await page.locator('html').evaluate(n=>parseFloat(getComputedStyle(n).fontSize))).toBeCloseTo(originalFont*2,5);
    const panel=page.locator('[data-v12-pilot="profile"]');
    async function checkBounds(target) {
      const size=await target.evaluate(n=>({scroll:n.scrollWidth,width:n.clientWidth}));
      expect(size.scroll).toBeLessThanOrEqual(size.width+1);
      const buttons=await target.locator('[data-pilot-dock] button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
      expect(buttons.every(n=>n>=44)).toBe(true);
    }
    await checkBounds(panel);
    await info.attach('profile-200-percent',{body:await page.screenshot(),contentType:'image/png'});
    await panel.locator('.tm121-profile-cover [data-pilot-action="settings"]').click();
    const settings=page.locator('[data-v12-pilot="settings"]');
    await expect(settings).toBeVisible();
    await checkBounds(settings);
    const changedTheme=theme==='light'?'dark':'light';
    await settings.locator('[data-theme-choice="'+changedTheme+'"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme',changedTheme);
    await info.attach('settings-200-percent',{body:await page.screenshot(),contentType:'image/png'});
    await settings.locator('[data-security-close]').click();
    await expect(page.locator('[data-security-dialog]')).toBeHidden();
    await openProfile(page);
    await checkBounds(panel);
    await panel.locator('[data-cloud-account-close]').click();
    await expect(page.locator('[data-cloud-account-backdrop]')).toBeHidden();
    await expect(page.locator('.home-profile-launcher')).toBeFocused();
    expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
    await info.attach('long-text-closed',{body:await page.screenshot(),contentType:'image/png'});
  });
}
test('default-off keeps original owner and no pilot DOM',async({page})=>{
 await boot(page,{query:''});await expect(page.locator('body')).toHaveClass(/is-authenticated/);
 await page.locator('.home-profile-launcher').click();await expect(page.locator('[data-cloud-account-backdrop]')).toBeVisible();
 expect(await page.evaluate(()=>TravelMateAppShell.pilot)).toBeUndefined();await expect(page.locator('[data-v12-pilot]')).toHaveCount(0);
});
test('account ABA during actual lazy module load does not replay a stale initial open',async({page})=>{
 const pending=await boot(page,{holdAccount:true});await pending.arrived;
 await page.evaluate(()=>{pilotQA.emit('B');pilotQA.emit('A');});
 pending.release();
 await expect.poll(()=>page.evaluate(()=>TravelMateAppShell.pilot.snapshot().pending)).toBe(false);
 await expect(page.locator('[data-cloud-account-backdrop]')).toBeHidden();
 await openProfile(page);await page.evaluate(()=>pilotQA.emit(null));
 await expect(page.locator('[data-cloud-account-backdrop]')).toBeHidden();await expect(page.locator('[data-v12-pilot]')).toHaveCount(0);
});
test('signed out direct route retains real authentication form',async({page})=>{
 await boot(page,{user:null});
 await expect.poll(()=>page.evaluate(()=>TravelMateAppShell.pilot.snapshot().pending)).toBe(false);
 if(!await page.locator('[data-cloud-account-backdrop]').isVisible())await page.locator('.landing-login').click();
 await expect(page.locator('[data-cloud-auth-form]')).toBeVisible();
 await expect(page.locator('[data-v12-pilot="profile"]')).toHaveCount(0);
 expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
});
test('unavailable owner cache preserves existing controls and explicit read error',async({page})=>{
 await boot(page);await openProfile(page);
 await page.locator('[data-cloud-account-close]').click();
 await page.evaluate(()=>pilotQA.setCacheUnavailable(true));
 await openProfile(page);
 await expect(page.locator('[data-pilot-gap="profile-trips-empty"]')).toHaveText('לא ניתן לקרוא את רשימת הטיולים כעת.');
 await expect(page.locator('[data-v12-pilot="profile"] [data-profile-wizard-open]')).toBeEnabled();
 await expect(page.locator('[data-v12-pilot="profile"] .tm121-metric strong')).toHaveText(['—','—','—','—']);
 expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
});
test('existing profile editor receives normal click and presentation releases background',async({page})=>{
 await boot(page);await openProfile(page);
 await page.locator('[data-v12-pilot="profile"] [data-profile-wizard-open]').click();
 await expect(page.locator('[data-cloud-account-backdrop]')).toBeVisible();
 await expect(page.locator('[data-v12-pilot]')).toHaveCount(0);
 await expect(page.locator('.profile-wizard-backdrop')).toBeVisible();
 expect(await page.locator('[data-cloud-account-backdrop]').evaluate(n=>n.inert)).toBe(true);
 await page.locator('[data-profile-wizard-close]').click();
 await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();
 await expect(page.locator('[data-v12-pilot="profile"]')).toBeVisible();
 await expect(page.locator('[data-v12-pilot="profile"] [data-profile-wizard-open]')).toBeFocused();
 await expect(page.locator('[data-pilot-dock]')).toHaveCount(1);
 await page.locator('[data-cloud-account-close]').click();
 expect(await page.locator('main').evaluate(n=>n.inert)).toBe(false);
 expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
});
test('read-only preference storage preserves the actual saved value and reports failed save',async({page})=>{
 await boot(page);await openProfile(page);
 await page.locator('[data-v12-pilot="profile"] [data-pilot-action="settings"]').click();
 const settings=page.locator('[data-v12-pilot="settings"]');await expect(settings).toBeVisible();
 const before=await page.evaluate(()=>TravelMateSettings.getVoicePreferences().enabled);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('travelmate-settings:'))throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,key,value);};});
 await settings.locator('[data-voice-enabled]').setChecked(!before);
 await expect(settings.locator('[data-voice-enabled]')).toBeChecked({checked:before});
 expect(await page.evaluate(()=>TravelMateSettings.getVoicePreferences().enabled)).toBe(before);
 await expect(settings.locator('[data-voice-settings-status]')).toContainText('ההעדפה לא נשמרה');
 expect(await page.evaluate(()=>pilotQA.forbidden)).toEqual([]);
});
test('empty canonical cache has truthful empty cards and reload uses existing account owner',async({page})=>{
 await boot(page);await openProfile(page);
 await expect(page.locator('[data-pilot-gap="profile-trips-empty"]')).toContainText('אין טיולים');
 await page.reload();await openProfile(page);
 await expect(page.locator('[data-smart-profile-name]')).toContainText('Synthetic A');
 await expect(page.locator('[data-pilot-dock]')).toHaveCount(1);
});
