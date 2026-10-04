const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const wizard=fs.readFileSync('assets/profile-wizard.js','utf8');
const profile=fs.readFileSync('assets/user-profile.js','utf8');
const css=['styles.css','cloud-sync.css','profile-wizard.css','home-organizer.css','phone-visual-qa.css','language.css','network-usage.css','theme.css','readable-glass.css'].map(file=>fs.readFileSync('assets/'+file,'utf8')).join('\n');

async function fixture(page,theme='light'){
  page.wizardErrors=[];page.on('pageerror',error=>page.wizardErrors.push(error.message));
  await page.route(/https?:\/\/(?!127\.0\.0\.1:4173)/,route=>route.abort());
  await page.route('**/wizard-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="he" dir="rtl" data-theme="${theme}" data-surface-theme="classic"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="home-page"><section class="cloud-account-backdrop"><section class="cloud-account"><button data-profile-wizard-open>עריכת פרופיל</button></section></section></html>`}));
  await page.goto('/wizard-fixture');
  await page.evaluate(()=>{
    window.user={id:'A',email:'a@example.invalid',user_metadata:{display_name:'שם קיים',travelmate_preferences:{pace:'relaxed',interests:['nature'],learningEnabled:false}}};window.calls=[];window.profileEvents=[];window.activeUrls=new Set();
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=value=>{const url=create(value);activeUrls.add(url);return url};URL.revokeObjectURL=url=>{activeUrls.delete(url);revoke(url)};
    const bitmap=createImageBitmap;window.decoded=[];window.createImageBitmap=async(...args)=>{const result=await bitmap(...args);decoded.push({width:result.width,height:result.height,options:args[1]});return result};
    window.TravelMateCloud={getSession:async()=>({user:window.user}),uploadAvatar:async(file,options)=>{calls.push({kind:'avatar',owner:options.ownerId,size:file.size,type:file.type,style:options.style});const result=await bitmap(file);calls[calls.length-1].dimensions=[result.width,result.height];result.close();if(window.avatarWait)await new Promise(resolve=>window.finishAvatar=resolve);return{data:{user:{id:options.ownerId,user_metadata:{}}},error:null}},updateProfileForOwner:async(owner,name,preferences)=>{calls.push({kind:'profile',owner,name,preferences});return{data:{user:{id:owner,user_metadata:{display_name:name,travelmate_preferences:preferences}}},error:null}}};
    addEventListener('travelmate:profile-change',event=>profileEvents.push(event.detail.user.id));
  });
  await page.addScriptTag({content:profile});await page.addScriptTag({content:wizard});
}
test.afterEach(async({page})=>{expect(page.wizardErrors||[]).toEqual([])});
async function picture(page,{orientation=1,large=false}={}){
  const base64=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=1600;const c=canvas.getContext('2d');c.fillStyle='#e6a032';c.fillRect(0,0,1600,1600);c.fillStyle='#2472b8';c.fillRect(1600,0,1600,1600);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));const bytes=new Uint8Array(await blob.arrayBuffer());return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))});
  let bytes=Buffer.from(base64,'base64');
  if(orientation!==1){const exif=Buffer.from([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);bytes=Buffer.concat([bytes.subarray(0,2),exif,bytes.subarray(2)])}
  if(large){const padded=Buffer.alloc(20*1024*1024);bytes.copy(padded);bytes=padded}
  return{name:'portrait.jpg',mimeType:'image/jpeg',buffer:bytes};
}
async function open(page){await page.locator('[data-profile-wizard-open]').click();await expect(page.locator('[data-profile-gallery]')).toBeEnabled()}
async function styles(page,file){await page.locator('[data-profile-gallery]').setInputFiles(file);await expect(page.locator('[data-profile-next]')).toBeEnabled();await page.locator('[data-profile-next]').click();await expect(page.locator('[name="avatarStyle"]')).toHaveCount(4);await expect(page.locator('[data-profile-next]')).toBeEnabled()}
async function bounded(page){expect(await page.locator('.profile-wizard').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(await page.locator('.profile-wizard').evaluate(n=>getComputedStyle(n).direction)).toBe('rtl')}
for(const width of [390,430])for(const theme of ['light','dark'])test(`wizard real canvas, keyboard, preferences and offline at ${width} ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:844});await fixture(page,theme);await open(page);await bounded(page);expect(await page.locator('.cloud-account-backdrop').evaluate(n=>n.inert)).toBe(true);expect(await page.locator('.profile-wizard-backdrop').evaluate(n=>Number(getComputedStyle(n).zIndex))).toBeGreaterThan(await page.locator('.cloud-account-backdrop').evaluate(n=>Number(getComputedStyle(n).zIndex)));
  const colors=await page.locator('.profile-wizard').evaluate(n=>({surface:getComputedStyle(n).backgroundColor,text:getComputedStyle(n).color}));if(theme==='dark')expect(colors.surface).not.toBe('rgb(255, 255, 255)');
  await styles(page,await picture(page,{orientation:6,large:width===390&&theme==='light'}));await bounded(page);
  expect(await page.evaluate(()=>decoded[0])).toMatchObject({width:1024,height:2048});
  const crop=await page.locator('[data-profile-crop]').evaluate(canvas=>{const c=canvas.getContext('2d');return{top:Array.from(c.getImageData(256,16,1,1).data),bottom:Array.from(c.getImageData(256,496,1,1).data)}});expect(crop.top[0]).toBeGreaterThan(crop.bottom[0]);expect(crop.bottom[2]).toBeGreaterThan(crop.top[2]);
  const images=await page.locator('.profile-style-card img').evaluateAll(async images=>Promise.all(images.map(async img=>{const bytes=await(await fetch(img.src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',')})));
  expect(new Set(images).size).toBe(4);
  await page.locator('[name="avatarStyle"][value="warm"]').focus();await page.keyboard.press('Space');await expect(page.locator('[value="warm"]')).toBeChecked();
  await page.locator('[data-profile-next]').click();await page.keyboard.press('Shift+Tab');await expect(page.locator('[data-profile-save]')).toBeFocused();await expect(page.locator('[name="displayName"]')).toHaveValue('שם קיים');await expect(page.locator('[name="learningEnabled"]')).not.toBeChecked();
  for(const value of ['culture','food','history','shopping','nightlife'])await page.locator('[name="interests"][value="'+value+'"]').check();await page.locator('[name="interests"][value="photography"]').click();await expect(page.locator('[name="interests"]:checked')).toHaveCount(6);await expect(page.locator('[name="interests"][value="photography"]')).not.toBeChecked();
  await page.locator('[name="displayName"]').fill('שם חדש');await page.locator('[name="pace"]').selectOption('active');await page.locator('[data-profile-back]').click();await page.locator('[data-profile-next]').click();await expect(page.locator('[name="pace"]')).toHaveValue('active');await bounded(page);await page.screenshot({path:test.info().outputPath('review-'+width+'-'+theme+'.png')});
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'))});await expect(page.locator('[data-profile-save]')).toBeDisabled();expect(await page.evaluate(()=>calls.length)).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'))});await page.locator('[data-profile-save]').focus();await page.keyboard.press('Tab');await expect(page.locator('[data-profile-wizard-close]')).toBeFocused();
  await page.locator('[data-profile-save]').click();await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();
  expect(await page.evaluate(()=>calls)).toEqual([expect.objectContaining({kind:'avatar',owner:'A',style:'warm',dimensions:[512,512],size:expect.any(Number)}),expect.objectContaining({kind:'profile',owner:'A',name:'שם חדש',preferences:expect.objectContaining({pace:'active',learningEnabled:false})})]);
  expect(await page.evaluate(()=>activeUrls.size)).toBe(0);await expect(page.locator('[data-profile-wizard-open]')).toBeFocused();
});
test('invalid extension and invalid image decode cannot advance',async({page})=>{
  await fixture(page);await open(page);const file=await picture(page);await page.locator('[data-profile-gallery]').setInputFiles({...file,name:'spoof.png'});await expect(page.locator('[data-profile-wizard-status]')).toHaveAttribute('role','alert');await expect(page.locator('[data-profile-next]')).toBeDisabled();
  await page.locator('[data-profile-gallery]').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,0])});await expect(page.locator('[data-profile-next]')).toBeDisabled();expect(await page.evaluate(()=>activeUrls.size)).toBe(0);
});
test('logout during asynchronous style generation releases URLs and cannot repaint a new session',async({page})=>{
  await fixture(page);await open(page);await page.locator('[data-profile-gallery]').setInputFiles(await picture(page));await expect(page.locator('[data-profile-next]')).toBeEnabled();
  await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){original.call(this,blob=>window.finishBlob=()=>cb(blob),...args)}});
  await page.locator('[data-profile-next]').click();await page.waitForFunction(()=>window.finishBlob);
  await page.evaluate(()=>dispatchEvent(new CustomEvent('travelmate:home-auth',{detail:{authenticated:false}})));await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();await page.evaluate(()=>finishBlob());
  await open(page);await expect(page.locator('[data-profile-styles]')).toBeEmpty();await expect(page.locator('[data-profile-next]')).toBeDisabled();expect(await page.evaluate(()=>activeUrls.size)).toBe(0);
});
test('account switch during upload never publishes a stale profile or updates successor preferences',async({page})=>{
  await fixture(page);await open(page);await styles(page,await picture(page));await page.locator('[data-profile-next]').click();await page.evaluate(()=>window.avatarWait=true);await page.locator('[data-profile-save]').click();await page.waitForFunction(()=>window.finishAvatar);
  await page.evaluate(()=>{window.user={id:'B',email:'b@example.invalid',user_metadata:{}};dispatchEvent(new CustomEvent('travelmate:home-auth',{detail:{authenticated:true}}))});await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();await open(page);await page.evaluate(()=>finishAvatar());
  expect(await page.evaluate(()=>profileEvents)).toEqual([]);expect(await page.evaluate(()=>calls.filter(c=>c.kind==='profile'))).toEqual([]);await expect(page.locator('[name="displayName"]')).toHaveValue('b');
});
test('closing while login inspection is pending invalidates its response',async({page})=>{
  await fixture(page);await page.evaluate(()=>TravelMateCloud.getSession=()=>new Promise(resolve=>window.finishLogin=()=>resolve({user:window.user})));await page.locator('[data-profile-wizard-open]').click();await page.waitForFunction(()=>window.finishLogin);await page.keyboard.press('Escape');await page.evaluate(()=>finishLogin());await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
});

test('Image fallback retains a bounded orientation-correct crop',async({page})=>{
  await fixture(page);await open(page);const file=await picture(page,{orientation:6});await page.evaluate(()=>window.createImageBitmap=undefined);await styles(page,file);
  const pixels=await page.locator('[data-profile-crop]').evaluate(canvas=>{const c=canvas.getContext('2d');return [c.getImageData(256,16,1,1).data[0],c.getImageData(256,496,1,1).data[0]]});expect(pixels[0]).toBeGreaterThan(pixels[1]);await page.keyboard.press('Escape');await expect(page.locator('.profile-wizard-backdrop')).toBeHidden();expect(await page.evaluate(()=>activeUrls.size)).toBe(0);
});
test('partial preference failure preserves saved avatar and reports uncertainty',async({page})=>{
  await fixture(page);await open(page);await styles(page,await picture(page));await page.locator('[data-profile-next]').click();await page.evaluate(()=>TravelMateCloud.updateProfileForOwner=async()=>({error:new Error('PROFILE_NETWORK_FAILURE')}));await page.locator('[data-profile-save]').click();await expect(page.locator('[data-profile-wizard-status]')).toContainText('התמונה נשמרה');await expect(page.locator('[data-profile-wizard-status]')).toHaveAttribute('role','alert');await expect(page.locator('.profile-wizard-backdrop')).toBeVisible();expect(await page.evaluate(()=>profileEvents)).toEqual(['A']);await page.keyboard.press('Escape');expect(await page.evaluate(()=>activeUrls.size)).toBe(0);
});
