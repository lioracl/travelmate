'use strict';
const {test,expect}=require('@playwright/test');
const home=require('./fixtures/all-trips-v3.cjs');
const {readability}=require('./fixtures/six-screen-v3.cjs');
async function gradientReadability(page,info,name){
 // Component-local, instantaneous paint proof. Shared canonical scrolling may
 // clip the entire card; this bounds contrast of its remaining visible glyphs.
 // It does not certify viewport visibility or arbitrary page-wide occlusion.
 const proof=await page.locator('#modal-destination [data-destination-choice]:visible').evaluateAll(cards=>cards.map(card=>{
  const issues=[],samples=[],check=(ok,reason)=>{if(!ok&&!issues.includes(reason))issues.push(reason);};
  const result=()=>({destination:card.dataset.destinationChoice,imageState:card.dataset.imageState,boundary:'SUPPORTED_CARD_PAINT_STACK_AT_CAPTURE',status:issues.length?'UNVERIFIED':'VERIFIED',minimum:4.5,issues,samples});
  const children=[...card.children],img=children[0],status=children[1],caption=children[2],mark=children[3];
  check(children.length===4&&img?.matches('img')&&status?.matches('span.destination-image-status')&&caption?.matches('span.destination-choice-caption')&&mark?.matches('span.destination-choice-check'),'unsupported card structure');
  if(issues.length)return result();
  const labels=[...caption.children];
  check(labels.length===2&&labels[0].matches('strong')&&labels[1].matches('span')&&labels.every(n=>n.children.length===0),'unsupported caption structure');
  check([card,caption].every(n=>[...n.childNodes].every(c=>c.nodeType!==Node.TEXT_NODE||!c.textContent.trim()))&&[status,mark].every(n=>n.children.length===0),'unsupported extra card content');
  const cs=getComputedStyle(card),shade=getComputedStyle(card,'::before'),cap=getComputedStyle(caption),photo=getComputedStyle(img),box=card.getBoundingClientRect();
  function unclippedStyle(s,where){
   check(['backdrop-filter','-webkit-backdrop-filter'].every(property=>!CSS.supports(property,'none')||s.getPropertyValue(property)==='none'),'unsupported backdrop filter: '+where);
   check(s.clipPath==='none'&&s.clip==='auto'&&s.maskImage==='none'&&['','none'].includes(s.getPropertyValue('-webkit-mask-image'))&&['','none'].includes(s.getPropertyValue('mask-border-source')),'unsupported clip or mask: '+where);
   check(s.visibility==='visible'&&s.opacity==='1'&&s.filter==='none'&&s.mixBlendMode==='normal'&&s.transform==='none'&&['','none'].includes(s.translate)&&['','none'].includes(s.rotate)&&['','none'].includes(s.scale)&&['','1','normal'].includes(s.zoom)&&s.perspective==='none','unsupported compositing: '+where);
  }
  function noPseudo(node,side,where){const s=getComputedStyle(node,side);check(s.display==='none'||s.content==='none'||s.content==='normal','unsupported pseudo overlay: '+where+side);}
  // No arbitrary extra elements or generated content may share the paint stack.
  for(const node of [card,...card.querySelectorAll('*')]){
   unclippedStyle(getComputedStyle(node),node===card?'card':node.className||node.tagName);
   if(node!==card)noPseudo(node,'::before',node.className||node.tagName);
   noPseudo(node,'::after',node===card?'card':node.className||node.tagName);
  }
  for(let node=card.parentElement;node;node=node.parentElement){
   const s=getComputedStyle(node);unclippedStyle(s,'ancestor '+node.tagName+'.'+node.className);noPseudo(node,'::before','ancestor');noPseudo(node,'::after','ancestor');
   // Only the existing form/dialog/backdrop/root may clip the whole isolated
   // card. Other local overflow clips are outside this narrow proof boundary.
   check((s.overflowX==='visible'&&s.overflowY==='visible')||node.matches('.destination-form,.destination-modal,#modal-destination,body,html'),'unsupported ancestor overflow clip');
  }
  check(cs.position==='relative'&&cs.isolation==='isolate'&&cs.zIndex==='auto'&&cs.overflowX==='hidden'&&cs.overflowY==='hidden'&&['top','right','bottom','left'].every(k=>parseFloat(cs.getPropertyValue('padding-'+k))===0),'unsupported isolated card stack');
  check(photo.position==='absolute'&&photo.zIndex==='auto'&&['top','right','bottom','left'].every(k=>parseFloat(photo[k])===0),'image is not below shade and caption');
  check(shade.position==='absolute'&&shade.zIndex==='1'&&shade.content==='""'&&['top','right','bottom','left'].every(k=>parseFloat(shade[k])===0)&&shade.backgroundSize==='auto'&&shade.backgroundPosition==='0% 0%'&&shade.backgroundRepeat==='repeat'&&shade.backgroundAttachment==='scroll','unsupported gradient geometry');
  unclippedStyle(shade,'shade');
  check(shade.backgroundColor==='rgba(0, 0, 0, 0)'&&shade.backgroundBlendMode==='normal'&&shade.boxShadow==='none'&&shade.outlineStyle==='none'&&['top','right','bottom','left'].every(k=>parseFloat(shade.getPropertyValue('border-'+k+'-width'))===0&&parseFloat(shade.getPropertyValue('padding-'+k))===0),'unsupported gradient paint');
  check([caption,...labels].every(n=>{const s=getComputedStyle(n);return s.outlineStyle==='none'&&s.textShadow==='none'&&s.boxShadow==='none'&&['','0px'].includes(s.getPropertyValue('-webkit-text-stroke-width'))&&['','none'].includes(s.getPropertyValue('-webkit-box-reflect'));}),'unsupported caption shadow paint');
  check(/^linear-gradient\(to top, rgba\(0, 0, 0, 0\.8\) 0px, rgba\(0, 0, 0, 0\.64\) 48px, rgba\(0, 0, 0, 0\) 72px\)$/.test(shade.backgroundImage),'unexpected gradient');
  check(cap.position==='absolute'&&cap.zIndex==='2'&&cap.backgroundColor==='rgba(0, 0, 0, 0)'&&cap.backgroundImage==='none'&&cap.overflowX==='visible'&&cap.overflowY==='visible','caption is not above shade without clipping');
  check(labels.every(n=>{const s=getComputedStyle(n);return s.position==='static'&&s.zIndex==='auto'&&s.overflowX==='visible'&&s.overflowY==='visible'&&s.backgroundImage==='none'&&s.backgroundColor==='rgba(0, 0, 0, 0)';}),'unsupported label paint');
  for(const node of [status,mark]){const s=getComputedStyle(node);check(s.position==='absolute'&&s.zIndex===(node===mark?'2':'auto'),'unsupported auxiliary paint order');check(s.boxShadow==='none'&&s.textShadow==='none'&&s.outlineStyle==='none'&&['','0px'].includes(s.getPropertyValue('-webkit-text-stroke-width'))&&['','none'].includes(s.getPropertyValue('-webkit-box-reflect')),'unsupported auxiliary paint coverage');}
  const bottom=box.bottom-parseFloat(cs.borderBottomWidth),left=box.left+parseFloat(cs.borderLeftWidth),right=box.right-parseFloat(cs.borderRightWidth),top=box.top+parseFloat(cs.borderTopWidth);
  const alpha=y=>y<=48?.8-(.16*y/48):y<=72?.64*(72-y)/24:0,luminance=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  check(cards.every(other=>other===card||!overlap(box,other.getBoundingClientRect())),'overlapping destination card stacks');
  // The supported uniform circular card radius must not cut any text rectangle.
  const radii=['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k=>cs[k]);
  check(radii.every(v=>/^\d+(?:\.\d+)?px$/.test(v)&&parseFloat(v)===18),'unsupported card clipping radius');
  const radius=18,inside=(x,y)=>{if(x<left||x>right||y<top||y>bottom)return false;const dx=Math.max(left+radius-x,0,x-(right-radius)),dy=Math.max(top+radius-y,0,y-(bottom-radius));return !dx||!dy||dx*dx+dy*dy<=radius*radius;};
  for(const text of labels){
   const s=getComputedStyle(text);check(s.color==='rgb(255, 255, 255)'&&s.webkitTextFillColor==='rgb(255, 255, 255)','foreground is not opaque white');
   const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);let node;
   while((node=walker.nextNode())){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);
    for(const r of range.getClientRects()){
     const distance=bottom-r.top,a=alpha(distance),ratio=1.05/(luminance(1-a)+.05);
     check(r.width>0&&r.height>0&&[[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]].every(([x,y])=>inside(x,y))&&distance>=0&&distance<=72,'glyph rectangle outside verified gradient/card clip');
     check([status,mark].every(n=>getComputedStyle(n).display==='none'||!overlap(r,n.getBoundingClientRect())),'auxiliary content overlaps glyphs');
     samples.push({text:node.textContent,top:r.top,bottom:r.bottom,distanceFromBottom:distance,minimumAlpha:a,worstCaseWhiteImageContrast:ratio});check(ratio>=4.5,'worst-case contrast below AA');
    }
   }
  }
  check(samples.length>=2,'missing measurable destination/country glyphs');return result();
 }));
 expect(proof.length).toBeGreaterThan(0);const file=info.outputPath(name+'-gradient-contrast.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify(proof,null,2)+'\n');await info.attach(name+'-gradient-contrast',{path:file,contentType:'application/json'});
 try{for(const card of proof){expect(card.status,JSON.stringify(card)).toBe('VERIFIED');for(const sample of card.samples)expect(sample.worstCaseWhiteImageContrast).toBeGreaterThanOrEqual(4.5);}}catch(error){error.gradientProof=proof;throw error;}
}
test.use({serviceWorkers:'block'});
test.afterEach(async({page},info)=>{
 const order=await page.evaluate(()=>window.recommendationEventOrder||null).catch(()=>null);if(!order)return;
 const file=info.outputPath('recommendation-event-order.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify(order,null,2)+'\n','utf8');await info.attach('recommendation-event-order',{path:file,contentType:'application/json'});
});
async function recordRecommendationEventOrder(page){
 await page.evaluate(()=>{
  const backdrop=document.querySelector('body>.navo-intelligence-backdrop'),wizard=document.getElementById('modal-destination'),launch=wizard.querySelector('.navo-trip-banner button');window.recommendationEventOrder=[];
  function record(phase,event){recommendationEventOrder.push({phase,eventPhase:event?.eventPhase??null,hidden:backdrop.hidden,inert:backdrop.inert,wizardInert:wizard.inert,wizardModal:wizard.getAttribute('aria-modal'),step:wizard.dataset.wizardStep,active:document.activeElement?.getAttribute('data-navo-close')!==null&&backdrop.contains(document.activeElement)?'recommendation-close':document.activeElement?.tagName});}
  function isLaunch(event){return launch.contains(event.target);}
  window.addEventListener('click',event=>{if(isLaunch(event))record('window-capture',event);},true);
  document.addEventListener('click',event=>{if(!isLaunch(event))return;record('document-capture-after-owner',event);queueMicrotask(()=>record('document-capture-checkpoint'));},true);
  launch.addEventListener('click',event=>record('target-after-canonical-open',event));
  document.addEventListener('click',event=>{if(isLaunch(event))record('document-bubble',event);});
  new MutationObserver(records=>records.forEach(change=>record('mutation-'+change.attributeName+'-old-'+change.oldValue))).observe(backdrop,{attributes:true,attributeOldValue:true,attributeFilter:['inert','hidden']});
 });
}
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
 if(guest){await expect(page.locator('body')).not.toHaveClass(/is-authenticated|has-cached-trips/);expect(await page.evaluate(()=>localStorage.getItem('travelmate-active-user'))).toBeNull();trigger=page.locator('.landing-intro').getByRole('button',{name:'טיול חדש',exact:true});}
 else trigger=page.locator('.tm-home-dock [data-modal="destination"]');
 await expect(trigger).toHaveCount(1);await expect(trigger).toBeVisible();if(guest){await expect(trigger).toHaveCSS('pointer-events','auto');await expect(page.locator('.landing-intro')).toHaveCSS('text-shadow','none');await expect(trigger).toHaveCSS('text-shadow','none');await readability(page,test.info(),'guest-create',['.landing-create-trip']);const box=await trigger.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}await trigger.click();
 const modal=page.locator('#modal-destination');await expect(modal).toHaveClass(/open/);await expect(modal.locator('[data-wizard-heading]')).toBeFocused();
 return{trigger,modal,form:modal.locator('[data-destination-form]'),next:modal.locator('[data-wizard-next]'),back:modal.locator('[data-wizard-back]'),confirm:modal.locator('.create-trip')};
}
async function step(ui,index){await expect(ui.form).toHaveAttribute('data-wizard-step',String(index));await expect(ui.modal.locator('[data-wizard-progress][aria-current="step"]')).toHaveCount(1);await expect(ui.modal.locator('[data-wizard-progress]').nth(index)).toHaveAttribute('aria-current','step');}
async function destination(ui,{country='איטליה',city='רומא'}={}){if(await ui.form.locator('[name=country]').isHidden())await ui.form.locator('[data-destination-manual]').click();await ui.form.locator('[name=country]').fill(country);await ui.form.locator('[name=city]').fill(city);await ui.next.click();await step(ui,1);}
async function dates(ui,start='2026-01-01',end=start){await ui.form.locator('[name=start]').fill(start);await ui.form.locator('[name=end]').fill(end);await ui.next.click();await step(ui,2);}
async function summary(ui,budget='2500'){await ui.form.locator('[name=budget]').fill(budget);await ui.next.click();await step(ui,3);}
async function counts(page){return page.evaluate(()=>({local:wizardQA.local.length,cloud:wizardQA.cloud.length,attach:wizardQA.attach}));}
async function expectZero(page){expect(await counts(page)).toEqual({local:0,cloud:0,attach:0});}
async function expectOverviewRoute(page,expectedId){
 await expect(page).toHaveURL(url=>url.origin==='http://127.0.0.1:4173'&&url.pathname==='/trip/custom/index.html'&&url.hash===''&&/^\d+$/.test(url.searchParams.get('id')||'')&&(!expectedId||url.searchParams.get('id')===expectedId)&&url.searchParams.get('view')==='overview'&&JSON.stringify([...url.searchParams.keys()].sort())==='["id","view"]');
 await expect(page.locator('body')).toHaveAttribute('data-trip-view','overview');
 await expect(page.locator('#overview [data-city]')).toBeVisible();
 expect(await page.evaluate(()=>history.state?.travelMateView)).toBe('overview');
}
async function captureNavigation(page){
 // Snapshot synchronously in the departing document; never hold its navigation
 // request while trying to evaluate that same document from the test runner.
 await page.evaluate(()=>{
  sessionStorage.removeItem('wizard-navigation-evidence');
  window.addEventListener('pagehide',()=>{
   const id=wizardQA.local.at(-1)?.id;
   if(!/^\d+$/.test(id||''))return;
   sessionStorage.setItem('wizard-navigation-evidence',JSON.stringify({id,local:wizardQA.local,cloud:wizardQA.cloud,attach:wizardQA.attach,trip:TravelMateCloud.getLocalTrips().find(t=>String(t.id)===id),pendingSave:wizardQA.intelligenceState?.pendingSave}));
  },{once:true});
 });
 return {async read(){
  await expectOverviewRoute(page);
  const evidence=await page.evaluate(()=>{
   const captured=JSON.parse(sessionStorage.getItem('wizard-navigation-evidence'));
   if(!captured)throw Error('Missing departing-document save evidence');
   return {...captured,arrivedId:new URL(location.href).searchParams.get('id'),arrivedTrip:TravelMateCloud.getLocalTrips().find(t=>String(t.id)===captured.id)};
  });
  expect(evidence.arrivedId).toBe(evidence.id);
  expect(evidence.arrivedTrip).toMatchObject(evidence.trip);
  await expect(page.locator('#overview [data-city]')).toHaveText(evidence.trip.city);
  return evidence;
 }};
}
for(const width of [390,430])for(const theme of ['light','dark'])test('four wizard steps, summary edit, cancel focus and C1 geometry '+width+'/'+theme,async({page},info)=>{
 await page.setViewportSize({width,height:900});await boot(page,{theme});
 await page.evaluate(()=>{for(const [side,value]of Object.entries({top:32,right:12,bottom:24,left:44}))document.documentElement.style.setProperty('--safe-area-inset-'+side,value+'px');});
 const ui=await openWizard(page);const historyLength=await page.evaluate(()=>history.length);await step(ui,0);await expect(ui.form.locator('[name=start]')).toBeHidden();await ui.form.evaluate(form=>{form.elements.start.value='';form.elements.end.value='';});
 await ui.form.locator('[data-destination-manual]').click();await ui.form.locator('[name=country]').fill('   ');await ui.next.click();await expect(ui.form.locator('[name=country]')).toBeFocused();await expect(ui.form.locator('[data-form-error]')).toBeVisible();await step(ui,0);await readability(page,info,'wizard-error',['#modal-destination [data-form-error]','#modal-destination [aria-current="step"] b']);
 await destination(ui,{city:'<img src=x onerror="window.wizardXss=1">'});await dates(ui);await summary(ui,'');
 await expect(ui.form.locator('[data-wizard-summary="destination"]')).toContainText('<img');await expect(ui.form.locator('[data-wizard-summary="destination"] img')).toHaveCount(0);expect(await page.evaluate(()=>window.wizardXss)).toBeUndefined();await expect(ui.form.locator('[data-wizard-summary="days"]')).toHaveText('יום אחד');await expect(ui.form.locator('[data-wizard-summary="budget"]')).toContainText('2,500');
 await ui.form.locator('[data-wizard-edit="0"]').click();await step(ui,0);await ui.form.locator('[name=city]').fill('Tokyo');await ui.next.click();await ui.next.click();await ui.next.click();await step(ui,3);await expect(ui.form.locator('[data-wizard-summary="destination"]')).toContainText('Tokyo');
 await ui.back.click();await step(ui,2);await expect(ui.form.locator('[name=budget]')).toHaveValue('');await ui.next.click();expect(await page.evaluate(()=>history.length)).toBe(historyLength);
 const centers=await ui.modal.locator('[data-wizard-progress]').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return b.x+b.width/2;}));for(let i=1;i<centers.length;i++)expect(centers[i]).toBeLessThan(centers[i-1]);
 for(const button of await ui.form.locator('button:visible').all()){const box=await button.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}
 const footer=await ui.confirm.boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(900-24);expect(footer.x).toBeGreaterThanOrEqual(44);expect(footer.x+footer.width).toBeLessThanOrEqual(width-12);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await readability(page,info,'wizard-summary',['#modal-destination [data-wizard-heading]','#modal-destination [data-wizard-summary="destination"]','#modal-destination [data-wizard-summary="budget"]']);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(ui.modal.locator('[data-wizard-progress]').first()).toHaveCSS('transition-duration','0s');
 const close=ui.modal.locator('[data-close]'),profile=ui.modal.locator('.tm-home-dock [data-cloud-account-open]'),firstDock=ui.modal.locator('.tm-home-dock [data-home-route="home"]');
 await close.focus();await page.keyboard.press('Shift+Tab');await expect(profile).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await ui.confirm.focus();await page.keyboard.press('Tab');await expect(firstDock).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(ui.confirm).toBeFocused();
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
 await page.evaluate(()=>wizardQA.resolve());await expectOverviewRoute(page);const evidence=await capture.read();expect(evidence.local).toHaveLength(1);expect(evidence.cloud).toHaveLength(1);expect(evidence.attach).toBe(1);expect(evidence.trip).toMatchObject({id:evidence.id,country:'איטליה',city:'רומא',days:1,budget:2500,ownerId:'alltrips-A'});await expect(page.locator('#overview [data-city]')).toHaveText('רומא');
});
for(const guest of [true,false])test((guest?'guest':'signed-in cached offline')+' local creation keeps canonical trip contract',async({page})=>{
 await boot(page,{guest,state:guest?'ready':'offline'});const capture=await captureNavigation(page),ui=await openWizard(page,guest);await destination(ui);await dates(ui);await summary(ui,'');await ui.confirm.click();await expectOverviewRoute(page);
 const evidence=await capture.read();expect(evidence.local).toHaveLength(1);expect(evidence.cloud).toHaveLength(0);expect(evidence.trip).toMatchObject({country:'איטליה',city:'רומא',days:1,budget:2500,type:'זוגי'});if(guest)expect(evidence.trip.ownerId).toBeUndefined();else expect(evidence.trip.ownerId).toBe('alltrips-A');
});
for(const mode of ['local-failure','missing-local','unavailable-local'])test(mode+' leaves error and no navigation/cloud save',async({page})=>{
 await boot(page,{mode});const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);const before=page.url();await ui.confirm.click();await expect(ui.form.locator('[data-form-error]')).toBeVisible();await expect(ui.confirm).toBeEnabled();expect(page.url()).toBe(before);expect(await counts(page)).toEqual(mode==='unavailable-local'?{local:0,cloud:0,attach:0}:{local:1,cloud:0,attach:1});
});
test('cloud failure keeps one saved trip and offers opening it without another save',async({page})=>{
 await boot(page,{mode:'cloud-failure'});const capture=await captureNavigation(page),ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await ui.confirm.click();await expect(ui.form.locator('[data-wizard-save-status]')).toContainText('לא הושלם');expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});await expect(ui.form.locator('[name=city]')).toBeDisabled();await expect(ui.back).toBeDisabled();await ui.confirm.click();await expectOverviewRoute(page);const evidence=await capture.read();expect(evidence.local).toHaveLength(1);expect(evidence.cloud).toHaveLength(1);
});
test('actual account change invalidates a pending completion and clears the draft; refresh does not',async({page})=>{
 await boot(page,{mode:'pending-cloud'});const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await page.evaluate(()=>allTripsQA.emit('alltrips-A'));await step(ui,3);await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');await ui.confirm.click();expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});const before=page.url();
 await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await step(ui,0);await expect(ui.form.locator('[name=city]')).toHaveValue('');await ui.form.locator('[data-destination-manual]').click();await ui.form.locator('[name=city]').fill('B draft');await page.evaluate(()=>wizardQA.resolve());await expect(ui.form.locator('[name=city]')).toHaveValue('B draft');expect(page.url()).toBe(before);expect(await counts(page)).toEqual({local:1,cloud:1,attach:1});
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
 await expectOverviewRoute(page,id);const evidence=await captured.read();expect(evidence.id).toBe(id);expect(evidence.local).toHaveLength(2);expect(evidence.cloud).toHaveLength(1);expect(evidence.attach).toBe(1);expect(evidence.pendingSave).toBe(false);expect(evidence.trip.ownerId).toBe('alltrips-A');expect(evidence.trip.aiNotes).toHaveLength(1);expect(evidence.trip.aiNotes[0].answer).toBe('Approved source recommendation');expect(evidence.trip.activities[0].id).toBe('canonical-activity');expect(evidence.trip.savedPlaces[0].id).toBe('canonical-place');expect(evidence.trip.dayNotes['2026-01-01']).toBe('Preserve canonical note');expect(evidence.trip.extraCanonicalField).toEqual({keep:true});
});

// Deterministic SVG imagery proves rendering/lifecycle only, not real destination
// photography. The separate real-network evidence case records that distinction.
async function syntheticDiscoveryImages(page){
 await page.route('https://discovery-images.invalid/**',route=>route.request().url().includes('/broken')?route.abort():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="#8fc4e7"/><circle cx="450" cy="90" r="48" fill="#fff2c2"/><path d="M0 330 180 110 330 300 440 200 600 330V420H0Z" fill="#386686"/></svg>'}));
 await page.evaluate(()=>{
  window.discoveryImageQA={pending:[],mode:'pending',release(){this.pending.splice(0).forEach(({city,resolve})=>resolve('https://discovery-images.invalid/'+encodeURIComponent(city)+'.svg'));}};
  TravelMateDestinationImages.cached=()=>discoveryImageQA.mode==='broken'?'https://discovery-images.invalid/broken.jpg':'';
  TravelMateDestinationImages.resolve=city=>new Promise(resolve=>discoveryImageQA.pending.push({city,resolve}));
 });
}
async function discoveryCapture(page,info,name){
 const path=info.outputPath(name+'.png');await page.screenshot({path});await info.attach(name,{path,contentType:'image/png'});
}
for(const width of [390,430])for(const theme of ['light','dark'])test(`canonical dock inside wizard restores routes, same-hash, Profile and draft ${width}/${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await boot(page,{theme});
 await page.evaluate(()=>{const n=document.querySelector('.tm-home-dock');window.originalWizardDock={node:n,parent:n.parentNode,next:n.nextSibling,attrs:[...n.attributes].map(a=>[a.name,a.value])};});
 const ui=await openWizard(page),dock=ui.modal.locator('.tm-home-dock'),profile=dock.locator('[data-cloud-account-open]');
 await expect(dock).toHaveCount(1);await expect(dock).toBeVisible();await expect(dock).toHaveJSProperty('inert',false);
 expect(await page.evaluate(()=>originalWizardDock.node===document.querySelector('.tm-home-dock'))).toBe(true);
 const controls=dock.locator(':scope>a,:scope>button');await expect(controls).toHaveCount(5);
 const positions=await controls.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));expect(positions).toEqual([...positions].sort((a,b)=>b-a));
 await ui.form.locator('[data-destination-search]').fill('Rome');await ui.form.locator('[data-destination-choice="rome"]').click();await ui.next.scrollIntoViewIfNeeded();
 const button=await ui.next.boundingBox(),bar=await dock.boundingBox();expect(button.y+button.height).toBeLessThanOrEqual(bar.y);expect(bar.y+bar.height).toBeLessThanOrEqual(900);
 await ui.modal.locator('[data-close]').focus();await page.keyboard.press('Shift+Tab');await expect(profile).toBeFocused();await page.keyboard.press('Tab');await expect(ui.modal.locator('[data-close]')).toBeFocused();
 const length=await page.evaluate(()=>history.length);await dock.locator('[data-modal="destination"]').click();await expect(ui.modal).toHaveClass(/open/);await expect(ui.form.locator('[data-destination-search]')).toHaveValue('Rome');expect(await page.evaluate(()=>history.length)).toBe(length);
 await discoveryCapture(page,info,'dock-selected-keyboard-'+width+'-'+theme);
 async function restored(){expect(await page.evaluate(()=>{const o=originalWizardDock;return o.node===document.querySelector('.tm-home-dock')&&o.node.parentNode===o.parent&&o.node.nextSibling===o.next&&!o.node.hasAttribute('data-wizard-dock')&&!o.node.inert;})).toBe(true);await expect(ui.modal).not.toHaveClass(/open/);}
 for(const [route,hash]of [['home','#home'],['home','#home'],['trips','#active-trips'],['places','#home-places']]){
  await dock.locator('[data-home-route="'+route+'"]').click();await restored();await expect(page).toHaveURL(url=>url.hash===hash);await page.locator('.tm-home-dock [data-modal="destination"]').click();await expect(ui.form.locator('[data-destination-search]')).toHaveValue('Rome');
 }
 await profile.click();await restored();await expect(page.locator('[data-cloud-account-backdrop]')).toBeVisible();await expect(page.locator('[data-cloud-account-backdrop]')).toHaveJSProperty('inert',false);
 await page.keyboard.press('Escape');await expect(page.locator('.tm-home-dock [data-cloud-account-open]')).toBeFocused();await ui.trigger.click();await expect(ui.form.locator('[data-destination-search]')).toHaveValue('Rome');
 await page.goBack();await restored();await expect(page).toHaveURL(url=>url.hash==='#active-trips');await ui.trigger.click();await expect(ui.form.locator('[data-destination-search]')).toHaveValue('Rome');
 await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await expect(ui.form.locator('[data-destination-search]')).toHaveValue('');await expect(dock).toHaveJSProperty('inert',false);await expect(dock).toBeVisible();await expectZero(page);
 await page.keyboard.press('Escape');await restored();await expect(ui.trigger).toBeFocused();
});
for(const width of [390,430])for(const theme of ['light','dark'])test(`discovery states and rendered synthetic image evidence ${width}/${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await boot(page,{theme});await syntheticDiscoveryImages(page);const ui=await openWizard(page),cards=ui.form.locator('[data-destination-choice]'),search=ui.form.locator('[data-destination-search]');
 await info.attach('image-provenance',{body:Buffer.from('Deterministic SVG fixture; synthetic account; NOT genuine destination-photo or real-network proof. R07 is the layout reference.'),contentType:'text/plain'});
 await expect(cards).toHaveCount(6);await expect(ui.form.locator('[name=city]')).toBeHidden();await expect(ui.form.locator('[data-image-state="loading"]')).toHaveCount(6);await gradientReadability(page,info,'discovery-loading');await discoveryCapture(page,info,'discovery-loading-synthetic');
 const sheet=await ui.modal.locator('.destination-modal').boundingBox();expect(sheet.height).toBeGreaterThanOrEqual(899);expect(sheet.width).toBe(width);
 expect(await page.locator('.tm-home-dock').evaluate(n=>n.inert)).toBe(false);await expect(ui.modal.locator('.tm-home-dock')).toHaveCount(1);await expect(page.locator('.tm-home-dock')).toHaveCount(1);await expect(ui.modal.locator('.tm-home-dock')).toBeVisible();
 await page.evaluate(()=>{const late=document.createElement('button');late.id='discovery-late-background';late.textContent='Synthetic late utility';document.body.appendChild(late);});await expect(page.locator('#discovery-late-background')).toHaveJSProperty('inert',true);
 await page.evaluate(()=>discoveryImageQA.release());await expect(ui.form.locator('[data-image-state="ready"]')).toHaveCount(6);await discoveryCapture(page,info,'discovery-grid-synthetic');
 const imageLayout=await cards.evaluateAll(nodes=>nodes.map(node=>{const card=node.getBoundingClientRect(),photo=node.querySelector('img').getBoundingClientRect(),caption=node.querySelector('.destination-choice-caption').getBoundingClientRect();return{cardWidth:card.width,cardHeight:card.height,photoWidth:photo.width,photoHeight:photo.height,captionArea:caption.width*caption.height/(card.width*card.height)};}));for(const layout of imageLayout){expect(layout.photoWidth).toBeGreaterThanOrEqual(layout.cardWidth-4.1);expect(layout.photoHeight).toBeGreaterThanOrEqual(layout.cardHeight-4.1);expect(layout.captionArea).toBeLessThanOrEqual(.32);expect(layout.cardWidth/layout.cardHeight).toBeGreaterThanOrEqual(1.3);expect(layout.cardWidth/layout.cardHeight).toBeLessThanOrEqual(1.5);}
 const positions=await cards.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));expect(positions[0].y).toBe(positions[1].y);expect(positions[0].x).toBeGreaterThan(positions[1].x);expect(positions[2].y).toBeGreaterThan(positions[0].y);
 for(const box of positions){expect(box.w).toBeGreaterThanOrEqual(44);expect(box.h).toBeGreaterThanOrEqual(44);}
 const rome=cards.filter({hasText:'רומא'});await rome.click();await expect(rome).toHaveAttribute('aria-pressed','true');await expect(ui.form.locator('[data-destination-selection]')).toHaveText('היעד שנבחר: רומא, איטליה');await expectZero(page);await discoveryCapture(page,info,'discovery-selected-synthetic');
 await gradientReadability(page,info,'discovery-card-copy');await readability(page,info,'discovery-card-copy',['#modal-destination [data-destination-selection]']);
 await search.fill('Japan');await expect(ui.form.locator('[data-destination-choice]:visible')).toHaveCount(1);await expect(ui.form.locator('[name=city]')).toHaveValue('');await expect(ui.form.locator('[name=country]')).toHaveValue('');await discoveryCapture(page,info,'discovery-search-synthetic');
 await search.fill('Unknown destination');await expect(ui.form.locator('[data-destination-choice]:visible')).toHaveCount(0);await expect(ui.form.locator('[data-destination-empty]')).toBeVisible();await search.press('Enter');await expect(ui.form.locator('[data-destination-manual]')).toBeFocused();await step(ui,0);await discoveryCapture(page,info,'discovery-empty-synthetic');
 await ui.form.locator('[data-destination-manual]').click();await expect(ui.form.locator('[name=city]')).toBeFocused();await ui.form.locator('[name=city]').fill('יעד ידני ABC');await ui.form.locator('[name=country]').fill('מדינה מפורשת');await expect(ui.form.locator('[name=city]')).toBeVisible();await discoveryCapture(page,info,'discovery-manual-synthetic');await expectZero(page);
 await ui.next.click();await step(ui,1);await ui.back.click();await step(ui,0);await expect(ui.form.locator('[name=city]')).toHaveValue('יעד ידני ABC');
 await page.keyboard.press('Escape');await expect(ui.trigger).toBeFocused();expect(await page.locator('.tm-home-dock').evaluate(n=>n.inert)).toBe(false);await expect(page.locator('#discovery-late-background')).toHaveJSProperty('inert',false);await page.locator('#discovery-late-background').evaluate(n=>n.remove());await ui.trigger.click();await expect(search).toHaveValue('Unknown destination');await expect(ui.form.locator('[name=city]')).toHaveValue('יעד ידני ABC');
 await page.evaluate(()=>{discoveryImageQA.mode='broken';allTripsQA.emit('alltrips-B');});await expect(search).toHaveValue('');await expect(ui.form.locator('[name=city]')).toHaveValue('');await expect(ui.form.locator('[data-image-state="unavailable"]')).toHaveCount(6);await gradientReadability(page,info,'discovery-unavailable');await discoveryCapture(page,info,'discovery-image-error-synthetic');
 await cards.first().click();await expect(ui.form.locator('[name=country]')).toHaveValue('יפן');await expectZero(page);
 await ui.modal.locator('[data-close]').focus();await page.keyboard.press('Shift+Tab');await expect(ui.modal.locator('.tm-home-dock [data-cloud-account-open]')).toBeFocused();await page.keyboard.press('Tab');await expect(ui.modal.locator('[data-close]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('discovery keyboard, offline fallback, asymmetric safe areas and simulated IME at 360',async({page},info)=>{
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await boot(page,{state:'offline'});
 await page.evaluate(()=>{window.discoveryResolveCalls=0;TravelMateDestinationImages.cached=()=>'';TravelMateDestinationImages.resolve=()=>{discoveryResolveCalls++;return Promise.resolve('');};for(const [side,value]of Object.entries({top:28,right:12,bottom:20,left:24}))document.documentElement.style.setProperty('--safe-area-inset-'+side,value+'px');});
 const ui=await openWizard(page),cards=ui.form.locator('[data-destination-choice]');await expect(ui.form.locator('[data-image-state="unavailable"]')).toHaveCount(6);expect(await page.evaluate(()=>discoveryResolveCalls)).toBe(0);
 await cards.first().focus();await page.keyboard.press('ArrowLeft');await expect(cards.nth(1)).toBeFocused();await page.keyboard.press('ArrowDown');await expect(cards.nth(3)).toBeFocused();await page.keyboard.press('Space');await expect(cards.nth(3)).toHaveAttribute('aria-pressed','true');await expectZero(page);
 await expect(cards.first()).toHaveCSS('transition-duration','0s');await ui.next.scrollIntoViewIfNeeded();const button=await ui.next.boundingBox();expect(button.x).toBeGreaterThanOrEqual(24);expect(button.x+button.width).toBeLessThanOrEqual(348);expect(button.y+button.height).toBeLessThanOrEqual(780);
 // Deterministic visualViewport fixture, explicitly a simulated keyboard.
 await page.evaluate(()=>{const viewport=new EventTarget();viewport.height=420;viewport.offsetTop=0;Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});window.dispatchEvent(new Event('resize'));});
 await ui.form.locator('[data-destination-manual]').click();await ui.form.locator('[name=city]').fill('בדיקת מקלדת');await ui.next.scrollIntoViewIfNeeded();const ime=await ui.next.boundingBox();expect(ime.y+ime.height).toBeLessThanOrEqual(400);await discoveryCapture(page,info,'discovery-simulated-ime-offline');await expectZero(page);
 await page.keyboard.press('Escape');await expect(ui.trigger).toBeFocused();
});

test('discovery ignores a late image response after account replacement and close/reopen',async({page})=>{
 await boot(page);await syntheticDiscoveryImages(page);const ui=await openWizard(page);
 await ui.form.locator('[data-destination-choice="rome"]').click();await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');
 await page.evaluate(()=>{window.oldDiscoveryImages=discoveryImageQA.pending.splice(0);allTripsQA.emit('alltrips-B');});await expect(ui.form.locator('[name=city]')).toHaveValue('');
 await page.evaluate(()=>oldDiscoveryImages.forEach(({resolve})=>resolve('https://discovery-images.invalid/stale-owner.svg')));
 await expect(ui.form.locator('img[src*="stale-owner"]')).toHaveCount(0);
 await page.keyboard.press('Escape');await page.evaluate(()=>discoveryImageQA.release());await ui.trigger.click();await expect(ui.form.locator('[data-image-state="loading"]')).toHaveCount(6);await expect(ui.form.locator('img[src*="stale-owner"]')).toHaveCount(0);
 await page.evaluate(()=>discoveryImageQA.release());await expect(ui.form.locator('[data-image-state="ready"]')).toHaveCount(6);await expectZero(page);
});

for(const theme of ['light','dark'])test('actual optional Preferences recommendation sheet coordinates nested focus and inert lifecycle '+theme,async({page},info)=>{
 await page.setViewportSize({width:390,height:900});await boot(page,{theme,intelligence:false});
 // Keep every production function unchanged. This test-only lexical seam primes
 // an approved synthetic response so opening the real sheet never generates.
 const fs=require('node:fs'),path=require('node:path'),original=fs.readFileSync(path.join(__dirname,'../../assets/trip-intelligence.js'),'utf8');
 const anchor='  window.TravelMateTripIntelligence =';expect(original.split(anchor)).toHaveLength(2);
 const primed=original.replace(anchor,'  window.primeWizardRecommendationFixture=function(){bindContext(formContext(document.querySelector("[data-destination-form]")));state.recommendation=recommendationFor(state.context,"Synthetic approved recommendation; no generation");state.fingerprint=fingerprint(state.context);state.stale=false;state.responseData={};};\n'+anchor);
 await page.route('**/assets/trip-intelligence.js*',route=>route.fulfill({contentType:'application/javascript',body:primed}));
 await page.evaluate(()=>{window.nestedRecommendationRequests=0;const prior=document.createElement('button');prior.id='nested-prior-inert';prior.inert=true;prior.textContent='Synthetic preexisting inert control';document.body.appendChild(prior);});
 const ui=await openWizard(page);await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>Boolean(window.primeWizardRecommendationFixture&&window.TravelMateTripIntelligence));
 await page.evaluate(()=>{window.TravelMateNavo={request(){nestedRecommendationRequests++;throw Error('Generation forbidden in nested modal regression');},formatResponse(){return '<p>Synthetic approved recommendation; no generation</p>';},responseIncomplete(){return false;}};});
 await destination(ui);await dates(ui);await step(ui,2);const launch=ui.form.locator('.navo-trip-banner button');await expect(launch).toBeVisible();
 await recordRecommendationEventOrder(page);
 const backdrop=page.locator('body>.navo-intelligence-backdrop'),sheet=backdrop.locator('.navo-intelligence-sheet'),close=sheet.locator('[data-navo-close]'),last=sheet.locator('[data-navo-ask]');
 await expect(backdrop).toHaveJSProperty('inert',true);
 async function openRecommendation(){await page.evaluate(()=>primeWizardRecommendationFixture());await launch.click();await expect(backdrop).toBeVisible();await expect(backdrop).toHaveJSProperty('inert',false);await expect(ui.modal).toHaveJSProperty('inert',true);await expect(ui.modal).toHaveAttribute('aria-modal','false');await expect(close).toBeFocused();await expect(page.locator('.tm-home-dock')).toHaveJSProperty('inert',true);const checkpoints=await page.evaluate(()=>recommendationEventOrder.filter(row=>row.phase==='document-capture-checkpoint'));expect(checkpoints.length).toBeGreaterThan(0);for(const row of checkpoints)expect(row.inert).toBe(false);}
 await openRecommendation();await expect(sheet.locator('[data-navo-content]')).toContainText('Synthetic approved recommendation');
 await close.focus();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 const pointer=await close.evaluate(node=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));});expect(pointer).toBe(true);
 await page.evaluate(()=>{const foreign=document.createElement('section');foreign.id='nested-unrelated-dialog';foreign.setAttribute('role','dialog');foreign.innerHTML='<button>Unrelated synthetic dialog</button>';document.body.appendChild(foreign);});await expect(page.locator('#nested-unrelated-dialog')).toHaveJSProperty('inert',true);
 await discoveryCapture(page,info,'canonical-recommendation-nested-'+theme);await close.click();await expect(backdrop).toBeHidden();await expect(backdrop).toHaveJSProperty('inert',true);await expect(ui.modal).toHaveJSProperty('inert',false);await expect(ui.modal).toHaveAttribute('aria-modal','true');await expect(launch).toBeFocused();await expect(ui.modal).toHaveClass(/open/);await expectZero(page);
 await openRecommendation();await page.keyboard.press('Escape');await expect(backdrop).toBeHidden();await expect(launch).toBeFocused();await step(ui,2);await expect(ui.modal).toHaveClass(/open/);await expectZero(page);
 await openRecommendation();
 // An external canonical wizard dismissal is intentionally programmatic here:
 // its button must remain inaccessible to pointer/keyboard under the child.
 await ui.modal.locator('[data-close]').evaluate(node=>node.click());await expect(backdrop).toBeHidden();await expect(ui.modal).not.toHaveClass(/open/);await expect(ui.modal).toHaveJSProperty('inert',false);await expect(ui.trigger).toBeFocused();await expect(page.locator('.tm-home-dock')).toHaveJSProperty('inert',false);await expect(page.locator('#nested-unrelated-dialog')).toHaveJSProperty('inert',false);await expect(page.locator('#nested-prior-inert')).toHaveJSProperty('inert',true);
 await ui.trigger.click();await step(ui,2);await openRecommendation();await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await step(ui,0);await expect(backdrop).toBeHidden();await expect(backdrop).toHaveJSProperty('inert',true);await expect(ui.modal).toHaveJSProperty('inert',false);await expect(ui.modal.locator('[data-wizard-heading]')).toBeFocused();await expect(ui.modal.locator('.tm-home-dock')).toHaveJSProperty('inert',false);await expect(page.locator('#nested-unrelated-dialog')).toHaveJSProperty('inert',true);
 expect(await page.evaluate(()=>nestedRecommendationRequests)).toBe(0);await expectZero(page);await page.keyboard.press('Escape');await expect(ui.trigger).toBeFocused();await expect(page.locator('#nested-prior-inert')).toHaveJSProperty('inert',true);
});

for(const theme of ['light','dark'])test('actual Ask Mate continuation hands off to assistant and reopens the preserved wizard '+theme,async({page},info)=>{
 await page.setViewportSize({width:430,height:900});await boot(page,{theme,intelligence:false});
 // Only downstream generation transport is intercepted. Real recommendation,
 // openConversation, ask-ai, assistant setOpen, focus, history and account code run.
 await page.evaluate(()=>{window.continuationTransport=[];window.__travelMateSupabaseClient.functions={invoke:async(name,request)=>{continuationTransport.push({name,messages:request.body.messages,context:request.body.context});return{data:{answer:'Synthetic transport response '+continuationTransport.length,complete:true},error:null};}};});
 await page.evaluate(()=>TravelMateFeatures.ensureAssistant());await page.waitForFunction(()=>Boolean(window.__travelMateAiAssistantLoaded&&window.TravelMateNavo?.openConversation));
 const ui=await openWizard(page);await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>Boolean(window.TravelMateTripIntelligence&&document.querySelector('.navo-trip-banner button')));
 await ui.form.locator('[data-destination-search]').fill('Rome');await ui.form.locator('[data-destination-choice="rome"]').click();await ui.next.click();await step(ui,1);await dates(ui,'2026-11-01','2026-11-04');await ui.form.locator('[name=budget]').fill('1450');await ui.form.locator('[name=type]').selectOption('חברים');
 const launch=ui.form.locator('.navo-trip-banner button'),recommendations=page.locator('body>.navo-intelligence-backdrop'),ask=recommendations.locator('[data-navo-ask]');await recordRecommendationEventOrder(page);await launch.click();await expect(recommendations.locator('[data-navo-content]')).toContainText('Synthetic transport response 1');await expectZero(page);
 const baseURL=page.url(),baseHistory=await page.evaluate(()=>history.length);const panel=page.locator('#travelmate-ai-panel'),input=panel.locator('textarea');
 await ask.click();await expect(recommendations).toBeHidden();await expect(ui.modal).not.toHaveClass(/open/);await expect(panel).toBeVisible();await expect(panel).toHaveJSProperty('inert',false);await expect(input).toBeFocused();await expect(input).toHaveValue(/המשך את המלצות היעד/);expect(page.url()).toBe(baseURL);expect(await page.evaluate(()=>history.length)).toBe(baseHistory+1);expect(await page.evaluate(()=>history.state.travelMateOverlay)).toBe('ai');await expectZero(page);
 const controls=panel.locator('button:enabled:visible,a[href]:visible,input:enabled:visible,select:enabled:visible,textarea:enabled:visible,[tabindex]:not([tabindex="-1"]):visible');await controls.first().focus();await page.keyboard.press('Shift+Tab');await expect(controls.last()).toBeFocused();await page.keyboard.press('Tab');await expect(controls.first()).toBeFocused();
 const send=panel.locator('[data-ai-send]');const pointer=await send.evaluate(node=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));});expect(pointer).toBe(true);await input.fill('Synthetic typed continuation only');await send.click();await expect(panel.locator('[data-ai-chat]')).toContainText('Synthetic transport response 2');expect(await page.evaluate(()=>continuationTransport.length)).toBe(2);await expectZero(page);
 await discoveryCapture(page,info,'actual-assistant-continuation-'+theme);await page.goBack();await expect(panel).toBeHidden();await expect(page.locator('.ai-orb')).toBeFocused();await expect(page.locator('body')).not.toHaveClass(/ai-assistant-open/);expect(page.url()).toBe(baseURL);
 await ui.trigger.click();await step(ui,2);await expect(ui.form.locator('[name=city]')).toHaveValue('רומא');await expect(ui.form.locator('[name=country]')).toHaveValue('איטליה');await expect(ui.form.locator('[name=start]')).toHaveValue('2026-11-01');await expect(ui.form.locator('[name=end]')).toHaveValue('2026-11-04');await expect(ui.form.locator('[name=budget]')).toHaveValue('1450');await expect(ui.form.locator('[name=type]')).toHaveValue('חברים');await expect(ui.form.locator('[data-destination-search]')).toHaveValue('Rome');await expectZero(page);
 await launch.click();await expect(recommendations).toBeVisible();await ask.click();await expect(panel).toBeVisible();await expect(input).toBeFocused();await expect(input).toHaveValue(/המשך את המלצות/);await page.evaluate(()=>allTripsQA.emit('alltrips-B'));await expect(input).toHaveValue('');await expect(panel).toBeVisible();await expect(panel).toHaveJSProperty('inert',false);await input.fill('Synthetic B draft');await expect(input).toHaveValue('Synthetic B draft');await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(page.locator('.ai-orb')).toBeFocused();
 await ui.trigger.click();await step(ui,0);await expect(ui.form.locator('[name=city]')).toHaveValue('');await expect(ui.form.locator('[name=country]')).toHaveValue('');await expect(ui.form.locator('[data-destination-search]')).toHaveValue('');await expectZero(page);
 await info.attach('actual-continuation-boundary',{body:Buffer.from(JSON.stringify({realRecommendationAndAssistantSource:true,onlyGenerationTransportIntercepted:true,syntheticAccounts:true,microphoneActivated:false,transport:await page.evaluate(()=>continuationTransport)},null,2)),contentType:'application/json'});
});

// Later-step presentation evidence uses synthetic account/data fixtures only.
async function laterStepEvidence(page,info,ui,name){
 const visible=ui.form.locator('input:visible,select:visible,button:visible');
 const measurements=await visible.evaluateAll(nodes=>nodes.filter(n=>!n.closest('.navo-native-trip-type')).map(n=>{const r=n.getBoundingClientRect();return{name:n.name||n.textContent.trim(),width:r.width,height:r.height};}));
 for(const r of measurements){expect(r.width,JSON.stringify(r)).toBeGreaterThanOrEqual(44);expect(r.height,JSON.stringify(r)).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.tm-home-dock')).toHaveCount(1);
 await expect(ui.form).toHaveCSS('direction','rtl');
 const selectors=['#modal-destination [data-wizard-heading]','#modal-destination .trip-wizard-intro p','#modal-destination .trip-wizard-hint:visible','#modal-destination .trip-wizard-summary dt:visible','#modal-destination [data-wizard-summary="destination"]:visible','#modal-destination [data-wizard-summary="preferences"]:visible','#modal-destination .trip-wizard-summary bdi:visible','#modal-destination .trip-wizard-summary small:visible','#modal-destination .trip-wizard-summary p:visible','#modal-destination .trip-wizard-edit button:visible','#modal-destination .navo-date-display:visible','#modal-destination .navo-trip-types button span:visible','#modal-destination .navo-trip-banner strong:visible','#modal-destination .navo-trip-banner p:visible','#modal-destination .navo-trip-banner button:visible','#modal-destination .trip-wizard-back:visible','#modal-destination .trip-wizard-next:visible','#modal-destination .create-trip:visible'];
 // Filter absent/hidden controls only; every existing rendered match is measured.
 const present=[];for(const selector of selectors)if(await page.locator(selector).count())present.push(selector);
 await readability(page,info,name,present);
 const out=info.outputPath(name+'-controls.json');require('node:fs').mkdirSync(require('node:path').dirname(out),{recursive:true});require('node:fs').writeFileSync(out,JSON.stringify({scope:'Synthetic account; browser rendering evidence, not real device/auth',measurements},null,2));await info.attach(name+'-controls',{path:out,contentType:'application/json'});
 await ui.form.evaluate(n=>n.scrollTop=0);await discoveryCapture(page,info,name+'-top');
}
for(const width of [390,430])for(const theme of ['light','dark'])test('later steps presentation and native fallback '+width+'/'+theme,async({page},info)=>{
 await page.setViewportSize({width,height:900});await boot(page,{theme});const ui=await openWizard(page);
 const firstIntro=await ui.form.locator('.trip-wizard-intro p').textContent();
 await destination(ui,{city:'Rome רומא'});await expect(ui.form.locator('.trip-wizard-intro p')).toContainText('יום היציאה');
 for(const name of ['start','end']){await expect(ui.form.locator('[name='+name+']')).toHaveAttribute('type','date');await expect(ui.form.locator('[name='+name+']')).toHaveAttribute('dir','ltr');}
 await laterStepEvidence(page,info,ui,'later-step2-'+width+'-'+theme);
 await dates(ui,'2026-01-01','2026-03-01');await expect(ui.form.locator('.trip-wizard-intro p')).toContainText('תקציב כולל באירו');
 await expect(ui.form.locator('[name=type]')).toBeVisible();expect(await ui.form.locator('[name=type] option').allTextContents()).toEqual(['זוגי','משפחתי','חברים','סולו']);
 await ui.form.locator('[name=type]').selectOption({label:'חברים'});await laterStepEvidence(page,info,ui,'later-step3-'+width+'-'+theme);
 await summary(ui,'');await expect(ui.form.locator('.trip-wizard-intro p')).toContainText('בדקו את פרטי הטיול');await expect(ui.form.locator('[data-wizard-summary=days]')).toHaveText('60 ימים');await expect(ui.form.locator('[data-wizard-summary=budget]')).toContainText('2,500');await expect(ui.form.locator('[data-wizard-summary=destination]')).toHaveAttribute('dir','auto');
 await laterStepEvidence(page,info,ui,'later-step4-'+width+'-'+theme);await expectZero(page);
 await ui.form.locator('[data-wizard-edit="2"]').click();await expect(ui.form.locator('[name=budget]')).toHaveValue('');await expect(ui.form.locator('[name=type]')).toHaveValue('חברים');await ui.back.click();await expect(ui.form.locator('[name=end]')).toHaveValue('2026-03-01');await ui.back.click();await expect(ui.form.locator('.trip-wizard-intro p')).toHaveText(firstIntro);await expectZero(page);
});
for(const theme of ['light','dark'])test('later steps safe areas, 360 and simulated keyboard '+theme,async({page},info)=>{
 await page.setViewportSize({width:360,height:800});await page.emulateMedia({reducedMotion:'reduce'});await boot(page,{theme});await page.evaluate(()=>{for(const [side,value]of Object.entries({top:28,right:12,bottom:20,left:24}))document.documentElement.style.setProperty('--safe-area-inset-'+side,value+'px');});
 const ui=await openWizard(page);await destination(ui);
 for(const index of [1,2,3]){
  await step(ui,index);await expect(ui.modal.locator('[data-wizard-progress]').first()).toHaveCSS('transition-duration','0s');
  await page.evaluate(()=>{const viewport=new EventTarget();viewport.height=420;viewport.offsetTop=0;Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});window.dispatchEvent(new Event('resize'));});
  const action=index===3?ui.confirm:ui.next;await action.scrollIntoViewIfNeeded();const b=await action.boundingBox();expect(b.x).toBeGreaterThanOrEqual(24);expect(b.x+b.width).toBeLessThanOrEqual(348);expect(b.y+b.height).toBeLessThanOrEqual(400);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);
  await laterStepEvidence(page,info,ui,'later-step'+(index+1)+'-simulated-keyboard-'+theme);
  if(index===1)await dates(ui);else if(index===2)await summary(ui);
 }
 await expectZero(page);await page.keyboard.press('Escape');await expect(ui.trigger).toBeFocused();
});
for(const loadAt of ['before-open','destination','dates','summary'])test('later-step decorator hooks loaded at '+loadAt,async({page},info)=>{
 await boot(page,{theme:'dark',intelligence:false});
 async function load(){await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>window.TravelMateTripIntelligence);}
 if(loadAt==='before-open')await load();const ui=await openWizard(page);if(loadAt==='destination')await load();await destination(ui);if(loadAt==='dates')await load();await dates(ui);await summary(ui);if(loadAt==='summary')await load();
 await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await expect(ui.form.locator('.navo-trip-banner')).toBeHidden();
 expect(await ui.form.evaluate(f=>['country','city'].every(n=>f.elements[n].closest('label').parentElement===f)&&f.querySelector('.create-trip').parentElement===f&&f.querySelector('[data-wizard-back]').parentElement===f)).toBe(true);
 await ui.back.click();await expect(ui.form.locator('.navo-trip-types')).toBeVisible();await expect(ui.form.locator('.navo-trip-banner')).toBeVisible();await expect(ui.form.locator('.navo-trip-types button')).toHaveCount(4);
 await ui.form.locator('.navo-trip-types button').filter({hasText:'סולו'}).click();await expect(ui.form.locator('[name=type]')).toHaveValue('סולו');await laterStepEvidence(page,info,ui,'later-decorated-preferences-'+loadAt);
 await ui.back.click();await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await expect(ui.form.locator('.navo-trip-banner')).toBeHidden();await expect(ui.form.locator('.navo-date-display')).toHaveCount(2);await laterStepEvidence(page,info,ui,'later-decorated-dates-'+loadAt);
 await ui.back.click();await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await expect(ui.form.locator('.navo-trip-banner')).toBeHidden();await expectZero(page);
});
for(const theme of ['light','dark'])for(const mode of ['local-failure','pending-cloud'])test('later-step saving and retry evidence '+theme+'/'+mode,async({page},info)=>{
 await page.setViewportSize({width:390,height:900});await boot(page,{theme,mode});const ui=await openWizard(page);await destination(ui);await dates(ui);await summary(ui);await ui.confirm.click();
 if(mode==='local-failure'){await expect(ui.form.locator('[data-form-error]')).toBeVisible();await expect(ui.confirm).toHaveText('ניסיון שמירה נוסף');await expect(ui.back).toBeDisabled();await readability(page,info,'prepared-retry',['#modal-destination [data-form-error]']);await discoveryCapture(page,info,'later-prepared-retry-'+theme);await page.evaluate(()=>wizardQA.mode='success');const captured=await captureNavigation(page);await ui.confirm.click();await expectOverviewRoute(page);const e=await captured.read();expect(e.local).toHaveLength(2);expect(e.local[0].id).toBe(e.local[1].id);expect(e.attach).toBe(1);}
 else{await expect(ui.confirm).toHaveText('שומר…');await expect(ui.confirm).toHaveAttribute('aria-busy','true');await discoveryCapture(page,info,'later-saving-'+theme);await page.evaluate(()=>wizardQA.reject());await expect(ui.form.locator('[data-wizard-save-status]')).toContainText('לא הושלם');await expect(ui.confirm).toHaveText('פתיחת הטיול שנשמר');await readability(page,info,'saved-sync-failure',['#modal-destination [data-wizard-save-status]']);await discoveryCapture(page,info,'later-saved-sync-failure-'+theme);const captured=await captureNavigation(page);await ui.confirm.click();await expectOverviewRoute(page);const e=await captured.read();expect(e.local).toHaveLength(1);expect(e.cloud).toHaveLength(1);}
});


// V10 review: computed boundaries and reachability are independent of top captures.
async function laterBoundaryEvidence(page,info,name,selectors){
 const rows=[];for(const selector of selectors)for(const node of await page.locator(selector).all()){
  const row=await node.evaluate(n=>{
   const s=getComputedStyle(n),host=getComputedStyle(n.closest('.destination-modal'));
   const rgb=v=>{const m=/^rgb\((\d+), (\d+), (\d+)\)$/.exec(v);return m?m.slice(1).map(Number):null;};
   const luminance=c=>c.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
   const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
   const inside=rgb(s.backgroundColor),outside=rgb(host.backgroundColor),colors=['Top','Right','Bottom','Left'].map(side=>rgb(s['border'+side+'Color']));
   const supported=inside&&outside&&colors.every(Boolean)&&s.opacity==='1'&&s.backgroundImage==='none'&&host.backgroundImage==='none'&&host.opacity==='1'&&s.filter==='none'&&s.mixBlendMode==='normal'&&['Top','Right','Bottom','Left'].every(side=>s['border'+side+'Style']==='solid'&&parseFloat(s['border'+side+'Width'])>=1);
   return{name:n.name||n.textContent.trim(),status:supported?'VERIFIED':'UNVERIFIED',inside:s.backgroundColor,outside:host.backgroundColor,borders:colors,ratios:supported?colors.flatMap(c=>[contrast(c,inside),contrast(c,outside)]):[]};
  });rows.push(row);
 }
 const file=info.outputPath(name+'-boundaries.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify(rows,null,2));await info.attach(name+'-boundaries',{path:file,contentType:'application/json'});
 expect(rows.length).toBeGreaterThan(0);for(const row of rows){expect(row.status,JSON.stringify(row)).toBe('VERIFIED');for(const ratio of row.ratios)expect(ratio,JSON.stringify(row)).toBeGreaterThanOrEqual(3);}
}
async function laterControlReachability(page,info,ui,name){
 const rows=[];for(const control of await ui.form.locator('input:visible,select:visible,button:visible').all()){
  if(await control.evaluate(n=>Boolean(n.closest('.navo-native-trip-type'))))continue;
  await control.evaluate(n=>n.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  const row=await control.evaluate(n=>{
   const box=n.getBoundingClientRect(),form=n.closest('form').getBoundingClientRect(),dock=document.querySelector('#modal-destination .tm-home-dock').getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
   return{name:n.name||n.textContent.trim(),left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,formTop:form.top,formBottom:form.bottom,dockTop:dock.top,viewportHeight:innerHeight,hit:hit===n||n.contains(hit)};
  });rows.push(row);
  const file=info.outputPath(name+'-reachability.json');require('node:fs').writeFileSync(file,JSON.stringify({scope:'Each control separately scrolled into view; top screenshot does not prove all controls are visible together',rows},null,2));
  expect(row.width).toBeGreaterThanOrEqual(44);expect(row.height).toBeGreaterThanOrEqual(44);expect(row.top).toBeGreaterThanOrEqual(row.formTop-.5);expect(row.bottom).toBeLessThanOrEqual(Math.min(row.formBottom,row.dockTop,row.viewportHeight)+.5);expect(row.hit,JSON.stringify(row)).toBe(true);
 }
 await info.attach(name+'-reachability',{path:info.outputPath(name+'-reachability.json'),contentType:'application/json'});
}
for(const width of [390,430])for(const theme of ['light','dark'])test('decorated preferences full presentation matrix '+width+'/'+theme,async({page},info)=>{
 await page.setViewportSize({width,height:900});await boot(page,{theme,intelligence:false});const ui=await openWizard(page);
 await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>window.TravelMateTripIntelligence);
 await destination(ui);await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await laterBoundaryEvidence(page,info,'dates-'+width+'-'+theme,['#modal-destination [name=start]','#modal-destination [name=end]']);
 await dates(ui);await expect(ui.form.locator('.navo-trip-types')).toBeVisible();await expect(ui.form.locator('.navo-trip-banner')).toBeVisible();await expect(ui.form.locator('.navo-trip-types button')).toHaveCount(4);
 await ui.form.locator('.navo-trip-types button').filter({hasText:'סולו'}).click();await expect(ui.form.locator('[name=type]')).toHaveValue('סולו');
 const name='decorated-preferences-'+width+'-'+theme;
 await laterStepEvidence(page,info,ui,name);await laterBoundaryEvidence(page,info,name,['#modal-destination [name=budget]','#modal-destination .navo-trip-types button:not(.is-selected)']);await laterControlReachability(page,info,ui,name);
 await ui.next.click();await expect(ui.form.locator('[data-wizard-summary=preferences]')).toHaveText('סולו');await expect(ui.form.locator('.navo-trip-types')).toBeHidden();await expect(ui.form.locator('.navo-trip-banner')).toBeHidden();await expectZero(page);
});

for(const theme of ['light','dark'])test('preferences recommendation actual action ink across all C1 accents '+theme,async({page},info)=>{
 await page.setViewportSize({width:390,height:900});await boot(page,{theme,intelligence:false});const ui=await openWizard(page);
 await page.evaluate(()=>TravelMateFeatures.load('intelligence'));await page.waitForFunction(()=>window.TravelMateTripIntelligence);await destination(ui);await dates(ui);
 const button=ui.form.locator('.navo-trip-banner button');await expect(button).toBeVisible();
 for(const accent of ['ocean','plum','pink','sunset','emerald']){
  await page.evaluate(accent=>TravelMateTheme.setAccent(accent),accent);
  for(const interaction of ['rest','hover-focus']){
   if(interaction==='hover-focus'){await button.hover();await button.focus();}
   const paint=await button.evaluate(n=>{const s=getComputedStyle(n),root=getComputedStyle(document.documentElement);return{color:s.color,fill:s.webkitTextFillColor,background:s.backgroundColor,action:root.getPropertyValue('--tm-action-primary').trim(),onAction:root.getPropertyValue('--tm-text-on-action').trim()};});
   const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(', ')+')';
   expect(paint.background).toBe(rgb(paint.action));expect(paint.color).toBe(rgb(paint.onAction));expect(paint.fill).toBe(paint.color);
   await readability(page,info,'preferences-action-'+theme+'-'+accent+'-'+interaction,['#modal-destination .navo-trip-banner button:visible']);
  }
  await page.mouse.move(0,0);await ui.form.locator('[data-wizard-heading]').focus();
 }
 await expectZero(page);await ui.back.click();await expect(button).toBeHidden();await ui.back.click();await expect(button).toBeHidden();await expectZero(page);
});
