const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {execFileSync}=require('node:child_process');
test.use({serviceWorkers:'allow'});
for(const legacy of [false,true])test((legacy?'actual Preview migration':'future deployment')+' moves A to B by consent; keeps data and works offline',async({page,context},info)=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:568});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-pwa-test-'));
 const A=legacy?'7edd763b9132fac91b3287aaa593d2f107e4dbe6':'a'.repeat(40),B='b'.repeat(40),root=process.cwd();
 for(const sha of [A,B]){const dir=path.join(temp,sha);fs.mkdirSync(dir);if(legacy&&sha===A){const tar=path.join(temp,'preview.tar');execFileSync('git',['archive','--format=tar','--output='+tar,A,'index.html','sw.js','manifest.webmanifest','assets','trip']);execFileSync('tar',['-xf',tar,'-C',dir]);continue;}for(const name of ['index.html','sw.js','manifest.webmanifest'])fs.copyFileSync(path.join(root,name),path.join(dir,name));for(const name of ['assets','trip'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});execFileSync(process.execPath,['tools/stamp-web-build.mjs',dir],{env:{...process.env,TRAVELMATE_WEB_BUILD_SHA:sha}});}
 let current=A;
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
 const server=http.createServer((req,res)=>{let file=path.join(temp,current,decodeURIComponent(new URL(req.url,'http://local').pathname));if(file.endsWith(path.sep))file+='index.html';if(!file.startsWith(path.join(temp,current)+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  await page.goto(origin);if(legacy){expect(await page.evaluate(async()=>await(await fetch(document.querySelector('script[src*="assets/app.js"]').src)).text())).toBe(fs.readFileSync(path.join(temp,A,'assets','app.js'),'utf8'));}else await expect.poll(()=>page.evaluate(()=>window.TravelMateWebBuild?.sha)).toBe(A);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await page.evaluate(async()=>{
   localStorage.setItem('pwa-account-proof',JSON.stringify({user:'account-A',token:'synthetic-token'}));localStorage.setItem('travelmate-theme','dark');localStorage.setItem('pwa-doc-metadata-proof','private metadata');
   localStorage.setItem('travelmate-trips',JSON.stringify([{id:'pwa-trip',ownerId:'account-A',city:'תל אביב',country:'ישראל',start:'2026-10-11',days:3,end:'2026-10-13',type:'solo',planInitialized:true,dayNotes:{},activities:[{id:'a1',date:'2026-10-11',time:'10:00',title:'פעילות בדיקה',category:'attraction'}],savedPlaces:[{id:'p1',name:'מקום שמור',category:'attraction'}],expenses:[{id:'e1',amount:15,currency:'ILS'}]}]));
   await new Promise((resolve,reject)=>{const req=indexedDB.open('pwa-user-data-proof',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({owner:'account-A',name:'private'},'doc');tx.oncomplete=()=>{db.close();resolve();};};});
   const cache=await caches.open('unrelated-user-cache');await cache.put('/private-proof',new Response('untouched'));
  });
  await page.goto(origin+'/trip/custom/?id=pwa-trip&view=plan');await expect(page.locator('[data-activity-id="a1"]')).toBeVisible();
  const dataBefore=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>['travelmate-trips','travelmate-theme','pwa-account-proof','pwa-doc-metadata-proof'].includes(k)).map(k=>[k,localStorage.getItem(k)])));
  await page.evaluate(()=>{const input=document.createElement('textarea');input.id='update-entry-proof';document.body.appendChild(input);input.value='unsaved text';input.focus();});
  current=B;if(legacy){await page.reload();await expect.poll(()=>page.evaluate(()=>window.TravelMateWebBuild?.sha)).toBe(B);await page.evaluate(()=>{const input=document.createElement('textarea');input.id='update-entry-proof';document.body.appendChild(input);input.value='unsaved text';});}await page.waitForFunction(()=>!!window.TravelMateServiceWorkerRegistration);await page.evaluate(async()=>{await window.TravelMateServiceWorkerRegistration.update();});
  await expect(page.locator('[data-pwa-update]')).toBeVisible();await expect(page.locator('#update-entry-proof')).toHaveValue('unsaved text');expect(await page.evaluate(()=>TravelMateWebBuild.sha)).toBe(legacy?B:A);
  await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('[data-pwa-update]').click()]);await expect.poll(()=>page.evaluate(()=>window.TravelMateWebBuild?.sha)).toBe(B);await expect(page.locator('[data-pwa-update]')).toHaveCount(0);
  await page.evaluate(()=>TravelMateFeatures.load('about'));await page.evaluate(()=>document.querySelector('[data-about-open]').click());await expect(page.locator('.about-version')).toContainText(B);await expect(page.locator('[data-about-worker-cache]')).toHaveText('travelmate-smart-v266-'+B);await page.locator('.about-close').click();
  const dataAfter=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(dataBefore));
  // Canonical hydration can change syncStatus from pending to local; compare all stored user fields.
  const userData=value=>({...value,'travelmate-trips':JSON.parse(value['travelmate-trips']).map(({syncStatus,...trip})=>trip)});
  expect(userData(dataAfter)).toEqual(userData(dataBefore));
  await expect.poll(()=>page.evaluate(()=>window.TravelMateWebDiagnostics.activeCacheRevision)).toBe('travelmate-smart-v266-'+B);
  expect(await page.evaluate(async()=>await caches.keys())).toEqual(expect.arrayContaining(['unrelated-user-cache','travelmate-smart-v266-'+B]));expect(await page.evaluate(async()=>await caches.keys())).not.toContain('travelmate-smart-v266-'+A);expect((await page.evaluate(async()=>await caches.keys())).filter(k=>k.startsWith('travelmate-smart-'))).toEqual(['travelmate-smart-v266-'+B]);
  expect(await page.evaluate(async()=>await new Promise(resolve=>{const r=indexedDB.open('pwa-user-data-proof');r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents'),get=tx.objectStore('documents').get('doc');get.onsuccess=()=>{resolve(get.result);db.close();};};}))).toEqual({owner:'account-A',name:'private'});
  await context.setOffline(true);await page.close();const offline=await context.newPage();await offline.goto(origin+'/trip/custom/?id=pwa-trip');await expect.poll(()=>offline.evaluate(()=>window.TravelMateWebBuild?.sha)).toBe(B);
  for(const view of ['overview','plan','budget','places','documents']){await offline.goto(origin+'/trip/custom/?id=pwa-trip&view='+view);await expect(offline.locator('#'+view)).toBeVisible();if(view==='plan')await expect(offline.locator('[data-activity-id="a1"]')).toContainText('פעילות בדיקה');expect(await offline.evaluate(()=>TravelMateWebBuild.sha)).toBe(B);}
  await offline.evaluate(()=>{localStorage.setItem('pwa-account-proof',JSON.stringify({user:'account-B'}));});await offline.reload();expect(await offline.evaluate(()=>TravelMateTripStore.getTrip('pwa-trip','account-B'))).toBeNull();
  await info.attach('build-proof',{body:JSON.stringify({A,B,offlineViews:['overview','plan','budget','places','documents'],dataPreserved:true,APK:false}),contentType:'application/json'});
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
});
