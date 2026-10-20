const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
// Synthetic transport only: real home/cloud code, isolated local cache, no server/auth claim.
async function boot(page, width) {
  await page.setViewportSize({width,height:900});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173') return route.abort();
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) return route.abort();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,'index.html');
    if (!fs.existsSync(file)) return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'});
  });
  const notices = [];
  page.on('dialog', async dialog => {notices.push(dialog.message());await dialog.accept();});
  await page.addInitScript(() => {
    const record = owner => ({id:'trip-'+owner,ownerId:owner,city:'טיול '+owner,country:'איטליה',start:'2026-10-21',end:'2026-10-24',days:4,isActive:true,budget:1000,budgetCurrency:'EUR',activities:[],expenses:[],savedPlaces:[],dayNotes:{},cloudRevision:1,cloudUpdatedAt:'2026-10-20T00:00:00Z',syncStatus:'synced'});
    localStorage.setItem('travelmate-active-user','A');
    localStorage.setItem('travelmate-trips',JSON.stringify([record('A')]));
    for (const owner of ['A','B']) localStorage.setItem('travelmate-trips-user:'+owner,JSON.stringify([record(owner)]));
    let owner='A';const callbacks=[];
    const session=()=>owner?{user:{id:owner,email:'synthetic@example.invalid',user_metadata:{}}}:null;
    window.dateQA={calls:[],pending:[],mode:'success',
      emit(next,event=next?'SIGNED_IN':'SIGNED_OUT'){owner=next;callbacks.forEach(fn=>fn(event,session()));},
      release(){this.pending.splice(0).forEach(resolve=>resolve());},
      caches(){return Object.fromEntries(['A','B'].map(id=>[id,JSON.parse(localStorage.getItem('travelmate-trips-user:'+id))]));}
    };
    window.__travelMateSupabaseClient={auth:{
      getSession:async()=>({data:{session:session()},error:null}),
      onAuthStateChange(fn){callbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}};},
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}})}
    },from(){return {select(){return {order:async()=>({data:JSON.parse(localStorage.getItem('travelmate-trips-user:'+owner)||'[]').map(t=>({id:t.id,user_id:owner,city:t.city,country:t.country,start_date:t.start,end_date:t.end,days:t.days,budget:t.budget,payload:t,revision:t.cloudRevision,updated_at:t.cloudUpdatedAt})),error:null})};}};},
    rpc:async(name,params)=>{
      if(name==='list_travel_trip_tombstones')return {data:[],error:null};
      if(name!=='save_travel_trip')throw new Error('Unexpected synthetic RPC: '+name);
      dateQA.calls.push({name,params});
      const mode=dateQA.mode;
      if(mode==='defer')await new Promise(resolve=>dateQA.pending.push(resolve));
      if(mode==='fail')return {error:new Error('Synthetic save failure')};
      return {data:[{result_status:'saved',result_revision:2,result_updated_at:'2026-10-20T19:00:00Z'}],error:null};
    }};
  });
  await page.goto('http://127.0.0.1:4173/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveClass(/is-authenticated/);
  await expect(page.locator('[data-trip-id="trip-A"] [data-trip-edit-dates]')).toBeVisible();
  return notices;
}
async function edit(page,id='trip-A') {
  await page.locator('[data-trip-id="'+id+'"] [data-trip-edit-dates]').click();
  await page.locator('.trip-date-editor [name=start]').fill('2026-10-22');
  await page.evaluate(()=>{dateQA.retained=document.querySelector('.trip-date-editor');});
}
for (const width of [360,390,430]) {
  test('Hebrew RTL '+width+': account switch cancels stale dates before any cache or RPC write',async({page})=>{
    const notices=await boot(page,width);await edit(page);
    await expect(page.locator('html')).toHaveAttribute('dir','rtl');
    const bounds=await page.locator('.trip-date-editor').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    await page.evaluate(()=>dateQA.emit('B'));
    await expect(page.locator('.trip-date-editor')).toHaveCount(0);
    await page.evaluate(()=>dateQA.retained.dispatchEvent(new Event('submit',{cancelable:true})));
    const state=await page.evaluate(()=>({caches:dateQA.caches(),calls:dateQA.calls}));
    expect(state.caches.B.map(t=>t.ownerId)).toEqual(['B']);
    expect(state.caches.A[0].start).toBe('2026-10-21');expect(state.calls).toHaveLength(0);
    expect(notices).toEqual(['עריכת התאריכים בוטלה כי החשבון או הטיול השתנו. יש לפתוח את הטיול מחדש.']);
  });
}
for (const sequence of [[null,'B'],['B','A'],[null,'A']]) {
  test('auth epoch '+JSON.stringify(sequence)+' cannot revive a retained date form',async({page})=>{
    await boot(page,390);await edit(page);
    for(const owner of sequence){
      await page.evaluate(owner=>dateQA.emit(owner),owner);
      await expect.poll(()=>page.evaluate(()=>localStorage.getItem('travelmate-active-user'))).toBe(owner);
    }
    await page.evaluate(()=>dateQA.retained.dispatchEvent(new Event('submit',{cancelable:true})));
    expect(await page.evaluate(()=>dateQA.calls.length)).toBe(0);
    expect(await page.evaluate(()=>dateQA.caches().A[0].start)).toBe('2026-10-21');
  });
}
test('same-account refresh retains draft; repeated submit has one RPC',async({page})=>{
  await boot(page,390);await edit(page);
  await page.evaluate(()=>dateQA.emit('A','TOKEN_REFRESHED'));
  await expect(page.locator('.trip-date-editor [name=start]')).toHaveValue('2026-10-22');
  await page.evaluate(()=>{dateQA.retained.dispatchEvent(new Event('submit',{cancelable:true}));dateQA.retained.dispatchEvent(new Event('submit',{cancelable:true}));});
  await expect.poll(()=>page.evaluate(()=>dateQA.calls.length)).toBe(1);
  expect(await page.evaluate(()=>dateQA.caches().A[0].start)).toBe('2026-10-22');
});
test('Back cancels retained form and leaves trip dates unchanged',async({page})=>{
  await boot(page,390);
  await page.evaluate(()=>history.pushState({synthetic:true},'', '#date-test'));
  await edit(page);
  await page.goBack();
  await expect(page.locator('.trip-date-editor')).toHaveCount(0);
  await page.evaluate(()=>dateQA.retained.dispatchEvent(new Event('submit',{cancelable:true})));
  expect(await page.evaluate(()=>dateQA.calls.length)).toBe(0);
  expect(await page.evaluate(()=>dateQA.caches().A[0].start)).toBe('2026-10-21');
});
test('deferred A completion cannot touch B cache or reopen editor',async({page})=>{
  await boot(page,390);await edit(page);await page.evaluate(()=>{dateQA.mode='defer';});
  await page.locator('.trip-date-editor-save').click();
  await expect.poll(()=>page.evaluate(()=>dateQA.pending.length)).toBe(1);
  await page.evaluate(()=>dateQA.emit('B'));
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('travelmate-active-user'))).toBe('B');
  const before=await page.evaluate(()=>dateQA.caches().B);
  await page.evaluate(()=>dateQA.release());
  await expect(page.locator('.trip-date-editor')).toHaveCount(0);
  expect(await page.evaluate(()=>dateQA.caches().B)).toEqual(before);
});
test('failure retains local dates and reopening retries without changing B',async({page})=>{
  await boot(page,390);await edit(page);await page.evaluate(()=>{dateQA.mode='fail';});
  await page.locator('.trip-date-editor-save').click();
  await expect.poll(()=>page.evaluate(()=>dateQA.caches().A[0].syncStatus)).toBe('failed');
  await page.evaluate(()=>{dateQA.mode='success';});await edit(page);
  await page.locator('.trip-date-editor-save').click();
  await expect.poll(()=>page.evaluate(()=>dateQA.caches().A[0].syncStatus)).toBe('synced');
  expect(await page.evaluate(()=>dateQA.caches().B[0].start)).toBe('2026-10-21');
  expect(await page.evaluate(()=>dateQA.calls.length)).toBe(2);
});
