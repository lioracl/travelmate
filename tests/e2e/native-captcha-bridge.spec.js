const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const security=fs.readFileSync('assets/security-center.js','utf8');
const setup=security.slice(security.indexOf('  function setupCaptcha()'),security.indexOf('  function armCaptcha()'));
const reset=security.slice(security.indexOf('  function resetCaptcha()'),security.indexOf('  window.TravelMateSecurity ='));
for(const width of [390,430,768,1440])for(const theme of ['light','dark'])test(`native hosted CAPTCHA bridge ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let failScript=false;
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='challenges.cloudflare.com')return failScript?route.abort():route.fulfill({contentType:'text/javascript',body:`window.turnstile={render:(selector,options)=>{window.qaOptions=options;const b=document.createElement('button');b.textContent='Complete test challenge';b.onclick=()=>options.callback('qa-one-shot');document.querySelector(selector).appendChild(b);}};`});
    if(u.origin==='https://lioracl.github.io'&&u.pathname.startsWith('/travelmate/auth/')){const file=u.pathname.endsWith('.js')?'auth/turnstile.js':'auth/turnstile.html';return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(file)});}
    if(u.origin==='https://localhost')return route.fulfill({contentType:'text/html',body:`<!doctype html><html dir="rtl" lang="he" data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:20px}form{max-width:400px}button{min-height:44px}</style><style>${fs.readFileSync('assets/security-center.css','utf8')}</style><form data-cloud-auth-form><button class="cloud-login-submit">להתחבר</button></form><script>window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};window.TRAVELMATE_SUPABASE={turnstileSiteKey:'configured'};var captchaToken='',captchaWidgetId=null,nativeCaptchaReset=null;${setup}\n${reset}\nwindow.TravelMateSecurity={getCaptchaToken:()=>captchaToken||undefined,resetCaptcha};setupCaptcha();</script></html>`});
    return route.abort();
  });
  await page.goto('https://localhost/qa');
  const challenge=page.frameLocator('iframe');await challenge.getByRole('button',{name:'Complete test challenge'}).click();
  await expect.poll(()=>page.evaluate(()=>TravelMateSecurity.getCaptchaToken())).toBe('qa-one-shot');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const themeInside=await challenge.locator('body').evaluate(()=>window.qaOptions.theme);expect(themeInside).toBe(theme);
  await page.evaluate(()=>{window.sdkCalls=[];window.__travelMateSupabaseClient={auth:{signInWithPassword:async data=>{sdkCalls.push(data);return {data:{}};}}};});
  await page.addScriptTag({content:fs.readFileSync('assets/cloud-sync.js','utf8')});
  await page.evaluate(()=>TravelMateCloud.signIn('qa@example.invalid','test-only'));
  expect(await page.evaluate(()=>sdkCalls[0].options.captchaToken)).toBe('qa-one-shot');
  expect(await page.evaluate(()=>TravelMateSecurity.getCaptchaToken())).toBeUndefined();
  failScript=true;await page.evaluate(()=>TravelMateSecurity.resetCaptcha());
  await expect(page.locator('.security-captcha-status')).toContainText('לא ניתן');
  const retry=page.getByRole('button',{name:'ניסיון נוסף לבדיקת האבטחה'});await expect(retry).toBeVisible();
  failScript=false;await retry.focus();await page.keyboard.press('Enter');await challenge.getByRole('button',{name:'Complete test challenge'}).click();
  await expect.poll(()=>page.evaluate(()=>TravelMateSecurity.getCaptchaToken())).toBe('qa-one-shot');
  expect(errors).toEqual([]);
  await page.screenshot({path:test.info().outputPath(`captcha-${width}-${theme}.png`)});
});
