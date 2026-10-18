const {test,expect}=require('@playwright/test');
for(const theme of ['light','dark'])test('gradient AA bound is verified on white imagery and fails closed without its shade '+theme,async({page},info)=>{
 await page.setViewportSize({width:390,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await require('./fixtures/all-trips-v3.cjs').open(page,{theme});
 await page.route('https://white-image.invalid/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="white"/></svg>'}));
 await page.evaluate(()=>{TravelMateDestinationImages.cached=()=> 'https://white-image.invalid/white.svg';});
 await page.locator('.tm-home-dock [data-modal="destination"]').click();await expect(page.locator('[data-image-state="ready"]')).toHaveCount(6);
 await gradientReadability(page,info,'white-image-'+theme);await page.screenshot({path:info.outputPath('synthetic-white-image-'+theme+'.png')});
 const adversaries=[
  ['elevated-image','#modal-destination .destination-choice img{position:absolute!important;z-index:3!important}','image is not below shade and caption'],
  ['occluding-card-after','#modal-destination .destination-choice::after{content:"";position:absolute;inset:0;background:white;z-index:5;pointer-events:none}','unsupported pseudo overlay: card::after'],
  ['occluding-caption-after','#modal-destination .destination-choice-caption::after{content:"";position:absolute;inset:0;background:white;z-index:5;pointer-events:none}','unsupported pseudo overlay: destination-choice-caption::after'],
  ['occluding-ancestor-after','#modal-destination .destination-modal::after{content:"";position:absolute;inset:0;background:white;z-index:5;pointer-events:none}','unsupported pseudo overlay: ancestor::after'],
  ['clipped-caption','#modal-destination .destination-choice-caption{clip-path:inset(0 0 50% 0)!important}','unsupported clip or mask: destination-choice-caption'],
  ['masked-caption','#modal-destination .destination-choice-caption{mask-image:linear-gradient(transparent,black)!important}','unsupported clip or mask: destination-choice-caption'],
  ['clipped-card','#modal-destination .destination-choice{clip-path:inset(0 0 50% 0)!important}','unsupported clip or mask: card'],
  ['masked-ancestor','#modal-destination .destination-modal{mask-image:linear-gradient(transparent,black)!important}','unsupported clip or mask: ancestor'],
  ['clipped-ancestor','#modal-destination .destination-modal{clip-path:inset(0 0 50% 0)!important}','unsupported clip or mask: ancestor'],
  ['blended-shade','#modal-destination .destination-choice::before{background-color:white!important;background-blend-mode:screen!important}','unsupported gradient paint'],
  ['inset-shade-shadow','#modal-destination .destination-choice::before{box-shadow:inset 0 0 0 100px white!important}','unsupported gradient paint'],
  ['auxiliary-shadow','#modal-destination .destination-choice-check{display:grid!important;box-shadow:0 0 0 100px white!important}','unsupported auxiliary paint coverage'],
  ['text-stroke','#modal-destination .destination-choice-caption strong{-webkit-text-stroke-width:5px!important}','unsupported caption shadow paint'],
  ['caption-backdrop-filter','#modal-destination .destination-choice-caption{backdrop-filter:brightness(10)!important;-webkit-backdrop-filter:brightness(10)!important}','unsupported backdrop filter: destination-choice-caption'],
  ['low-opacity-shade','#modal-destination .destination-choice::before{opacity:.1!important}','unsupported compositing: shade']
 ];
 for(const [id,css,reason]of adversaries){
  const bad=await page.addStyleTag({content:css});let failure;
  try{await gradientReadability(page,info,'expected-unverified-'+id+'-'+theme);}catch(error){failure=error;}finally{await bad.evaluate(n=>n.remove());}
  expect(failure?.gradientProof,'adversarial style must fail through the structured proof, not an unrelated exception').toBeDefined();
  expect(failure.gradientProof.length).toBe(6);for(const card of failure.gradientProof){expect(card.status).toBe('UNVERIFIED');expect(card.issues.some(issue=>issue.includes(reason)),JSON.stringify(card)).toBe(true);}
  await gradientReadability(page,info,'restored-after-'+id+'-'+theme);
 }
});
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
for(const width of [390,430,768,1440])for(const theme of ['light','dark'])test(`New Trip theme and dialog accessibility ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(theme=>{localStorage.setItem('travelmate-theme',theme);localStorage.setItem('travelmate-active-user','new-trip-owner');localStorage.setItem('travelmate-trips',JSON.stringify([{id:'new-trip-qa',ownerId:'new-trip-owner',city:'QA',country:'Italy',start:'2026-10-10',end:'2026-10-12',days:3,activities:[],savedPlaces:[]}]))},theme);
 await page.goto('/');const trigger=page.getByRole('button',{name:'טיול חדש',exact:true});await trigger.click();
 const modal=page.locator('#modal-destination');await expect(modal).toBeVisible();await expect(modal).toHaveAccessibleName('טיול חדש');await expect(modal).toHaveAttribute('aria-labelledby','destination-title');await expect(modal.locator('#destination-title')).toHaveText('טיול חדש');
 const heading=modal.getByRole('heading',{name:'לאן רוצים לטוס?',exact:true});await expect(heading).toHaveAttribute('id','wizard-step-title');await expect(heading).toBeFocused();await expect(modal.locator('[data-wizard-progress][aria-current="step"]')).toHaveCount(1);
 const close=modal.getByRole('button',{name:'ביטול וסגירת טיול חדש',exact:true});await expect(close).toBeVisible();
 const surface=await modal.locator('.destination-modal').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,direction:getComputedStyle(el).direction,overflow:document.documentElement.scrollWidth>innerWidth}));
 expect(surface.bg).toBe(theme==='light'?'rgb(255, 255, 255)':'rgb(24, 50, 73)');expect(surface.direction).toBe('rtl');expect(surface.overflow).toBe(false);
 const progress=modal.locator('[data-wizard-progress-label]');await expect(progress).toHaveCSS('background-color','rgba(0, 0, 0, 0)');const muted=theme==='light'?'rgb(88, 113, 142)':'rgb(185, 207, 220)';await expect(progress).toHaveCSS('color',muted);await expect(progress).toHaveCSS('-webkit-text-fill-color',muted);
 await readability(page,test.info(),'new-trip-initial',['#destination-title','#wizard-step-title','#modal-destination [data-wizard-progress-label]','#modal-destination [data-wizard-next]']);
 await expect(modal.locator('button[type=submit]')).toBeHidden();await close.focus();await page.keyboard.press('Shift+Tab');await expect(modal.locator('.tm-home-dock [data-cloud-account-open]')).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
 await page.screenshot({path:test.info().outputPath(`new-trip-${width}-${theme}.png`)});
 await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(trigger).toBeFocused();
});

for(const theme of ['light','dark'])test('discovery C1 text and selection contrast across five accents '+theme,async({page},info)=>{
 await page.setViewportSize({width:430,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await require('./fixtures/all-trips-v3.cjs').open(page,{theme});await page.locator('.tm-home-dock [data-modal="destination"]').click();
 const modal=page.locator('#modal-destination');await expect(modal.locator('[data-wizard-heading]')).toBeFocused();await modal.locator('[data-destination-choice="rome"]').click();
 for(const accent of ['ocean','plum','pink','sunset','emerald']){
  await page.evaluate(accent=>TravelMateTheme.setAccent(accent),accent);
  await gradientReadability(page,info,'discovery-'+theme+'-'+accent);await readability(page,info,'discovery-'+theme+'-'+accent,['#wizard-step-title','#modal-destination [data-destination-manual]','#modal-destination [data-destination-selection]','#modal-destination [data-wizard-next]','[data-destination-choice="rome"] .destination-choice-check']);
 }
 await expect(modal.locator('[data-destination-choice="rome"]')).toHaveCSS('transition-duration','0s');
 await page.screenshot({path:info.outputPath('discovery-five-accent-'+theme+'.png')});
});

for(const width of [390,430])for(const theme of ['light','dark'])test('discovery genuine-network image evidence records available photographs and explicit gaps '+width+'/'+theme,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname;
  return host==='127.0.0.1'||/(^|\.)(wikipedia\.org|wikimedia\.org|unsplash\.com)$/.test(host)?route.continue():route.abort();
 });
 await require('./fixtures/all-trips-v3.cjs').open(page,{theme});
 await page.locator('.tm-home-dock [data-modal="destination"]').click();const modal=page.locator('#modal-destination');
 await expect(modal.locator('[data-destination-choice]')).toHaveCount(6);
 // The production adapter has a bounded 12-second image deadline. This does
 // not change baseline assertions/timeouts or pretend unavailable photos loaded.
 await expect(modal.locator('[data-image-state="loading"]')).toHaveCount(0,{timeout:15000});
 const evidence=await modal.locator('[data-destination-choice]').evaluateAll(nodes=>nodes.map(node=>{const img=node.querySelector('img'),card=node.getBoundingClientRect(),photo=img.getBoundingClientRect(),caption=node.querySelector('.destination-choice-caption').getBoundingClientRect();return{destination:node.dataset.destinationChoice,label:node.getAttribute('aria-label'),state:node.dataset.imageState,url:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight,rendered:{cardWidth:card.width,cardHeight:card.height,photoWidth:photo.width,photoHeight:photo.height,captionWidth:caption.width,captionHeight:caption.height,captionAreaRatio:caption.width*caption.height/(card.width*card.height)}};}));
 const loaded=evidence.filter(item=>item.state==='ready');for(const item of loaded){expect(item.width).toBeGreaterThan(0);expect(item.url).toMatch(/^https:\/\//);}
 const status=loaded.length?'GENUINE_NETWORK_IMAGES_RENDERED_REQUIRES_HUMAN_DESTINATION_REVIEW':'GENUINE_NETWORK_IMAGES_UNAVAILABLE';
 await gradientReadability(page,info,'genuine-'+width+'-'+theme);await modal.locator('[data-destination-choice="rome"]').click();await modal.locator('[data-wizard-next]').scrollIntoViewIfNeeded();const continueBox=await modal.locator('[data-wizard-next]').boundingBox(),dockBox=await modal.locator('.tm-home-dock').boundingBox();expect(continueBox.y+continueBox.height).toBeLessThanOrEqual(dockBox.y);expect(dockBox.y+dockBox.height).toBeLessThanOrEqual(900);await expect(modal.locator('.tm-home-dock')).toBeVisible();
 const imageEvidence={status,width,theme,dockBox,continueBox,syntheticAccount:true,imageFixtures:false,loaded:loaded.length,total:6,items:evidence};
 const evidencePath=info.outputPath('genuine-network-image-evidence.json');require('node:fs').mkdirSync(require('node:path').dirname(evidencePath),{recursive:true});require('node:fs').writeFileSync(evidencePath,JSON.stringify(imageEvidence,null,2)+'\n','utf8');await info.attach('genuine-network-image-evidence',{path:evidencePath,contentType:'application/json'});
 const path=info.outputPath('discovery-'+status.toLowerCase()+'.png');await page.screenshot({path});await info.attach('genuine-network-image-render',{path,contentType:'image/png'});
 // Network availability never controls whether a valid destination can proceed.
 await modal.locator('[data-destination-choice="rome"]').click();await modal.locator('[data-wizard-next]').click();await expect(modal.locator('[data-destination-form]')).toHaveAttribute('data-wizard-step','1');
 expect(await page.evaluate(()=>TravelMateCloud.getLocalTrips().filter(t=>/^\d+$/.test(t.id)).length)).toBe(0);
});
