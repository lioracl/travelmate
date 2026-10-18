'use strict';
const {test,expect}=require('@playwright/test');
const home=require('./fixtures/all-trips-v3.cjs');
const {readability}=require('./fixtures/six-screen-v3.cjs');
test.use({serviceWorkers:'block'});
async function boot(page,{theme='light',guest=false,state='ready',mode='success',intelligence=true}={}){
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await home.open(page,{theme,guest,state});
 await page.evaluate(({mode,intelligence})=>{
  const cloud=window.TravelMateCloud,local=cloud.upsertLocalTrip;
  const qa=window.wizardQA={mode,local:[],cloud:[],attach:0,resolve:null,reject:null};
  cloud.upsertLocalTrip=function(trip){qa.local.push(JSON.parse(JSON.stringify(trip)));if(qa.mode==='local-failure')throw Error('Synthetic local quota failure');if(qa.mode==='missing-local')return undefined;if(qa.mode==='pending-local')return new Promise(resolve=>qa.resolve=()=>resolve(trip));return local.call(cloud,trip);};
  if(mode==='unavailable-local')delete cloud.upsertLocalTrip;
  cloud.saveTrip=function(trip,owner){qa.cloud.push({id:trip.id,owner});if(qa.mode==='cloud-failure')return Promise.reject(Error('Synthetic cloud unavailable'));if(qa.mode==='pending-cloud')return new Promise((resolve,reject)=>{qa.resolve=()=>resolve({saved:true});qa.reject=()=>reject(Error('Synthetic cloud failed'));});return Promise.resolve({saved:true});};
  if(intelligence)window.TravelMateTripIntelligence={attachPendingToTrip(){qa.attach++;return false;}};
 },{mode,intelligence});
}
async function openWizard(page,guest=false){
 let trigger;
 if(guest){await page.locator('[data-carousel-dots] button').nth(2).click();trigger=page.locator('.destination-slide.active [data-modal="destination"]');}
 else trigger=page.locator('.tm-home-dock [data-modal="destination"]');
 await expect(trigger).toHaveCount(1);await expect(trigger).toBeVisible();await trigger.click();
 const modal=page.locator('#modal-destination');await expect(modal).toHaveClass(/open/);await expect(modal.locator('[data-wizard-heading]')).toBeFocused();
 return{trigger,modal,form:modal.locator('[data-destination-form]'),next:modal.locator('[data-wizard-next]'),back:modal.locator('[data-wizard-back]'),confirm:modal.locator('.create-trip')};
}
async function step(ui,index){await expect(ui.form).toHaveAttribute('data-wizard-step',String(index));await expect(ui.modal.locator('[data-wizard-progress][aria-current="step"]')).toHaveCount(1);await expect(ui.modal.locator('[data-wizard-progress]').nth(index)).toHaveAttribute('aria-current','step');}
async function destination(ui,{country='איטליה',city='רומא'}={}){await ui.form.locator('[name=country]').fill(country);await ui.form.locator('[name=city]').fill(city);await ui.next.click();await step(ui,1);}
async function dates(ui,start='2026-01-01',end=start){await ui.form.locator('[name=start]').fill(start);await ui.form.locator('[name=end]').fill(end);await ui.next.click();await step(ui,2);}
async function summary(ui,budget='2500'){await ui.form.locator('[name=budget]').fill(budget);await ui.next.click();await step(ui,3);}
async function counts(page){return page.evaluate(()=>({local:wizardQA.local.length,cloud:wizardQA.cloud.length,attach:wizardQA.attach}));}
async function expectZero(page){expect(await counts(page)).toEqual({local:0,cloud:0,attach:0});}
async function captureNavigation(page){
 const result={value:null};
 await page.route('**/trip/custom/index.html?*',async route=>{
  const id=new URL(route.request().url()).searchParams.get('id');
  if(/^\d+$/.test(id||''))result.value=await page.evaluate(id=>({id,local:wizardQA.local,cloud:wizardQA.cloud,attach:wizardQA.attach,trip:TravelMateCloud.getLocalTrips().find(t=>String(t.id)===id)}),id);
  await route.continue();
 });return result;
}
for(const width of [390,430])for(const theme of ['light','dark'])test('four wizard steps, summary edit, cancel focus and C1 geometry '+width+'/'+theme,async({page},info)=>{
 await page.setViewportSize({width,height:900});await boot(page,{theme});
 await page.evaluate(()=>{for(const [side,value]of Object.entries({top:32,right:12,bottom:24,left:44}))document.documentElement.style.setProperty('--safe-area-inset-'+side,value+'px');});
 const ui=await openWizard(page);const historyLength=await page.evaluate(()=>history.length);await step(ui,0);await expect(ui.form.locator('[name=start]')).toBeHidden();await ui.form.evaluate(form=>{form.elements.start.value='';form.elements.end.value='';});
 await ui.form.locator('[name=country]').fill('   ');await ui.next.click();await expect(ui.form.locator('[name=country]')).toBeFocused();await expect(ui.form.locator('[data-form-error]')).toBeVisible();await step(ui,0);await readability(page,info,'wizard-error',['#modal-destination [data-form-error]','#modal-destination [aria-current="step"] b']);
 await destination(ui,{city:'<img src=x onerror="window.wizardXss=1">'});await dates(ui);await summary(ui,'');
 await expect(ui.form.locator('[data-wizard-summary="destination"]')).toContainText('<img');await expect(ui.form.locator('[data-wizard-summary="destination"] img')).toHaveCount(0);expect(await page.evaluate(()=>window.wizardXss)).toBeUndefined();await expect(ui.form.locator('[data-wizard-summary="days"]')).toHaveText('יום אחד');await expect(ui.form.locator('[data-wizard-summary="budget"]')).toContainText('2,500');
 await ui.form.locator('[data-wizard-edit="0"]').click();await step(ui,0);await ui.form.locator('[name=city]').fill('Tokyo');await ui.next.click();await ui.next.click();await ui.next.click();await step(ui,3);await expect(ui.form.locator('[data-wizard-summary="destination"]')).toContainText('Tokyo');
 await ui.back.click();await step(ui,2);await expect(ui.form.locator('[name=budget]')).toHaveValue('');await ui.next.click();expect(await page.evaluate(()=>history.length)).toBe(historyLength);
 const centers=await ui.modal.locator('[data-wizard-progress]').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return b.x+b.width/2;}));for(let i=1;i<centers.length;i++)expect(centers[i]).toBeLessThan(centers[i-1]);
 for(const button of await ui.form.locator('button:visible').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}
 const footer=await ui.confirm.boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(900-24);expect(footer.x).toBeGreaterThanOrEqual(44);expect(footer.x+footer.width).toBeLessThanOrEqual(width-12);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await readability(page,info,'wizard-summary',['#modal-destination [data-wizard-heading]','#modal-destination [data-wizard-summary="destination"]','#modal-destination [data-wizard-summary="budget"]']);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(ui.modal.locator('[data-wizard-progress]').first()).toHaveCSS('transition-duration','0s');
 await ui.modal.locator('[data-close]').focus();await page.keyboard.press('Shift+Tab');await expect(ui.confirm).toBeFocused();await page.keyboard.press('Tab');await expect(ui.modal.locator('[data-close]')).toBeFocused();
 await page.keyboard.press('Escape');await expect(ui.modal).not.toHaveClass(/open/);await expect(ui.trigger).toBeFocused();await expectZero(page);
 await ui.trigger.click();await step(ui,3);await expect(ui.form.locator('[data-wizard-summary="destination"]')).toContainText('Tokyo');await ui.modal.locator('[data-close]').click();await expect(ui.trigger).toBeFocused();await expectZero(page);
});
for(const stage of [0,1,2,3])test('cancel at wizard step '+stage+' is transient and overlay dismissal returns focus',async({page})=>{
 await boot(page);const ui=await openWizard(page);if(stage>0)await destination(ui);if(stage>1)await dates(ui);if(stage>2)await summary(ui);await expectZero(page);
 if(stage%2)await ui.modal.locator('[data-close]').click();else await ui.modal.click({position:{x:2,y:2}});
 await expect(ui.modal).not.toHaveClass(/open/);await expect(ui.trigger).toBeFocused();await expectZero(page);await ui.trigger.click();await step(ui,stage);await expectZero(page);
});
test('date boundaries, minimum/step/default budgets and hidden-field final revalidation',async({page})=>{
 await boot(page);const ui=await openWizard(page);await destination(ui);await ui.form.locator('[name=start]').fill('2026-01-01');await ui.form.locator('[name=end]').fill('2025-12-31');await ui.next.click();await step(ui,1);await expect(ui.form.locator('[name=end]')).toBeFocused();
 await ui.form.locator('[name=end]').fill('2026-03-02');await ui.next.click();await step(ui,1);await expect(ui.form.locator('[data-form-error]')).toContainText('60');
 await ui.form.locator('[name=end]').fill('2026-03-01');await ui.next.click();await step(ui,2);
 for(const value of ['50','125']){await ui.form.locator('[name=budget]').fill(value);await ui.next.click();await step(ui,2);await expect(ui.form.locator('[name=budget]')).toBeFocused();}
 await summary(ui,'100');await expect(ui.form.locator('[data-wizard-summary="days"]')).toHaveText('60 ימים');await expect(ui.form.locator('[data-wizard-summary="budget"]')).toContainText('100');
 await ui.form.locator('[name=city]').evaluate(node=>node.value=' ');await ui.confirm.click();await step(ui,0);await expect(ui.form.locator('[name=city]')).toBeFocused();await expectZero(page);
});
test('one local save and one cloud call across click/Enter, token refresh and pending completion',async({page})=>{
 await boot(page,{mode:'pending-cloud'});const capture=await captureNavigation(page),ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await ui.confirm.click();await page.keyboard.press('Enter');await page.evaluate(()=>document.querySelector('[data-destination-form]').requestSubmit());
 expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});await expect(ui.confirm).toBeDisabled();await page.evaluate(()=>allTripsQA.emit('alltrips-A'));await step(ui,3);await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');
 await page.evaluate(()=>wizardQA.resolve());await expect(page).toHaveURL(/trip\/custom\/index\.html\?id=\d+$/);expect(capture.value.local).toHaveLength(1);expect(capture.value.cloud).toHaveLength(1);expect(capture.value.attach).toBe(1);expect(capture.value.trip).toMatchObject({id:capture.value.id,country:'איטליה',city:'רומא',days:1,budget:2500,ownerId:'alltrips-A'});await expect(page.locator('#overview [data-city]')).toHaveText('רומא');
});
for(const guest of [true,false])test((guest?'guest':'signed-in cached offline')+' local creation keeps canonical trip contract',async({page})=>{
 await boot(page,{guest,state:guest?'ready':'offline'});const capture=await captureNavigation(page),ui=await openWizard(page,guest);await destination(ui);await dates(ui);await summary(ui,'');await ui.confirm.click();await expect(page).toHaveURL(/trip\/custom\/index\.html\?id=\d+$/);
 expect(capture.value.local).toHaveLength(1);expect(capture.value.cloud).toHaveLength(0);expect(capture.value.trip).toMatchObject({country:'איטליה',city:'רומא',days:1,budget:2500,type:'זוגי'});if(guest)expect(capture.value.trip.ownerId).toBeUndefined();else expect(capture.value.trip.ownerId).toBe('alltrips-A');
});
for(const mode of ['local-failure','missing-local','unavailable-local'])test(mode+' leaves error and no navigation/cloud save',async({page})=>{
 await boot(page,{mode});const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);const before=page.url();await ui.confirm.click();await expect(ui.form.locator('[data-form-error]')).toBeVisible();await expect(ui.confirm).toBeEnabled();expect(page.url()).toBe(before);expect(await counts(page)).toEqual(mode==='unavailable-local'?{local:0,cloud:0,attach:0}:{local:1,cloud:0,attach:1});
});
test('cloud failure keeps one saved trip and offers opening it without another save',async({page})=>{
 await boot(page,{mode:'cloud-failure'});const capture=await captureNavigation(page),ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await ui.confirm.click();await expect(ui.form.locator('[data-wizard-save-status]')).toContainText('לא הושלם');expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});await expect(ui.form.locator('[name=city]')).toBeDisabled();await expect(ui.back).toBeDisabled();await ui.confirm.click();await expect(page).toHaveURL(/trip\/custom\/index\.html\?id=\d+$/);expect(capture.value.local).toHaveLength(1);expect(capture.value.cloud).toHaveLength(1);
});
test('actual account change invalidates a pending completion and clears the draft; refresh does not',async({page})=>{
 await boot(page,{mode:'pending-cloud'});const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await page.evaluate(()=>allTripsQA.emit('alltrips-A'));await step(ui,3);await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');await ui.confirm.click();expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});const before=page.url();
 await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await step(ui,0);await expect(ui.form.locator('[name=city]')).toHaveValue('');await ui.form.locator('[name=city]').fill('B draft');await page.evaluate(()=>wizardQA.resolve());await expect(ui.form.locator('[name=city]')).toHaveValue('B draft');expect(page.url()).toBe(before);expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});
 expect(await page.evaluate(()=>TravelMateCloud.getCachedTrips().some(t=>t.ownerId==='alltrips-A'))).toBe(false);
});
test('optional intelligence decorator remains within its wizard step and does not attach before confirmation',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page,{intelligence:false});const ui=await openWizard(page);await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>window.TravelMateTripIntelligence);await page.evaluate(()=>{const attach=TravelMateTripIntelligence.attachPendingToTrip;TravelMateTripIntelligence.attachPendingToTrip=function(trip){wizardQA.attach++;return attach.call(this,trip);};});
 await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await destination(ui);await dates(ui);await expect(ui.form.locator('.navo-trip-types')).toBeVisible();await ui.back.click();await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await expectZero(page);expect(errors).toEqual([]);
});

test('dismissal rejects a same-task hidden-form submit before observer delivery',async({page})=>{
 await boot(page);const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);
 await page.evaluate(()=>{document.querySelector('#modal-destination [data-close]').click();document.querySelector('[data-destination-form]').requestSubmit();});
 await expect(ui.modal).not.toHaveClass(/open/);await expectZero(page);await expect(ui.trigger).toBeFocused();
});
// Source functions execute unchanged with synthetic approved-response state.
function approvedRecommendationFixture(){
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'../..');
 const source=fs.readFileSync(path.join(root,'assets/trip-intelligence.js'),'utf8'),assistant=fs.readFileSync(path.join(root,'assets/ai-assistant.js'),'utf8');
 const mode=source.slice(source.indexOf('  var MODE ='),source.indexOf('  var newTripSessionId'));
 const preferences=source.slice(source.indexOf('  var declaredPreferences ='),source.indexOf('  function setDeclaredPreferences('));
 const helpers=source.slice(source.indexOf('  function declaredPreferenceLines('),source.indexOf('  function createSheet('));
 const metadata=source.slice(source.indexOf('  function noteMetadata('),source.indexOf('  function saveResponse('));
 const attach=source.slice(source.indexOf('  function attachPendingToTrip('),source.indexOf('  function formContext('));
 const append=assistant.slice(assistant.indexOf('  function appendAiNote('),assistant.indexOf('  function persistTripWithNote('));
 return '(function(){var state={pendingSave:true,recommendation:{body:"Approved source recommendation",generatedAt:"2026-10-18T00:00:00Z"},context:{},responseId:"approved-response-1"};'+mode+preferences+helpers+metadata+append+attach+'\nwindow.TravelMateNavo={appendNote:appendAiNote};wizardQA.intelligenceState=state;window.TravelMateTripIntelligence={attachPendingToTrip:function(trip){wizardQA.attach++;return attachPendingToTrip(trip);}};})();';
}
test('partial canonical write retry preserves actual consumed recommendation and richer record without duplicates',async({page})=>{
 await boot(page);await page.addScriptTag({content:approvedRecommendationFixture()});const captured=await captureNavigation(page),ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);
 await page.evaluate(()=>{const write=Storage.prototype.setItem;wizardQA.failedBackup=false;Storage.prototype.setItem=function(key,value){if(key==='travelmate-trips-user:alltrips-A'&&!wizardQA.failedBackup&&JSON.parse(value).some(t=>/^\d+$/.test(t.id))){wizardQA.failedBackup=true;throw Error('Synthetic account snapshot quota');}return write.call(this,key,value);};});
 await ui.confirm.click();await expect(ui.form.locator('[data-form-error]')).toBeVisible();await expect(ui.form.locator('[name=city]')).toBeDisabled();await expect(ui.back).toBeDisabled();for(const edit of await ui.form.locator('[data-wizard-edit]').all())await expect(edit).toBeDisabled();
 expect(await page.evaluate(()=>wizardQA.intelligenceState.pendingSave)).toBe(false);expect(await counts(page)).toEqual({local:1,cloud:0,attach:1});
 const id=await page.evaluate(()=>{const records=TravelMateCloud.getLocalTrips(),trip=records.find(t=>/^\d+$/.test(t.id));if(!trip||trip.aiNotes.length!==1)throw Error('Missing consumed recommendation in primary record');if(JSON.parse(localStorage.getItem('travelmate-trips-user:alltrips-A')).some(t=>t.id===trip.id))throw Error('Backup unexpectedly completed');trip.activities.push({id:'canonical-activity',title:'Preserve canonical activity'});trip.savedPlaces.push({id:'canonical-place'});trip.dayNotes['2026-01-01']='Preserve canonical note';trip.extraCanonicalField={keep:true};localStorage.setItem('travelmate-trips',JSON.stringify(records));return trip.id;});
 await page.keyboard.press('Escape');await ui.trigger.click();await step(ui,3);await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');await expect(ui.form.locator('[name=city]')).toBeDisabled();
 // Tampering with a disabled input cannot silently change the approved payload.
 await ui.form.locator('[name=city]').evaluate(n=>n.value='Changed after failure');await ui.confirm.click();await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');expect(await counts(page)).toEqual({local:1,cloud:0,attach:1});await ui.confirm.click();
 await expect(page).toHaveURL(new RegExp('trip/custom/index.html\\?id='+id+'$'));expect(captured.value.id).toBe(id);expect(captured.value.local).toHaveLength(2);expect(captured.value.cloud).toHaveLength(1);expect(captured.value.attach).toBe(1);expect(captured.value.trip.aiNotes).toHaveLength(1);expect(captured.value.trip.aiNotes[0].answer).toBe('Approved source recommendation');expect(captured.value.trip.activities[0].id).toBe('canonical-activity');expect(captured.value.trip.savedPlaces[0].id).toBe('canonical-place');expect(captured.value.trip.dayNotes['2026-01-01']).toBe('Preserve canonical note');expect(captured.value.trip.extraCanonicalField).toEqual({keep:true});
});
