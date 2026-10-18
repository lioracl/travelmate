const {test,expect}=require('@playwright/test');
async function discoveryScrollEvidence(page,info,modal,width,theme){
 const form=modal.locator('[data-destination-form]'),heading=modal.locator('[data-wizard-heading]'),cards=modal.locator('[data-destination-choice]'),rows=[];
 const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 const persist=()=>{const file=info.outputPath('genuine-discovery-scroll-reachability.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify({width,theme,scope:'Separate top, individually centered cards and bottom; no one frame claims all content',rows},null,2)+'\n');};
 async function capture(mode){const path=info.outputPath('genuine-discovery-'+width+'-'+theme+'-'+mode+'.png');await page.screenshot({path});await info.attach('genuine-discovery-'+mode,{path,contentType:'image/png'});}
 await form.evaluate(n=>{n.scrollTop=0;});await frame();
 const top=await heading.boundingBox(),viewport=await form.boundingBox();rows.push({position:'top',heading:top,form:viewport,scrollTop:await form.evaluate(n=>n.scrollTop)});persist();expect(top.y).toBeGreaterThanOrEqual(viewport.y);expect(top.y+top.height).toBeLessThanOrEqual(viewport.y+viewport.height);await expect(heading).toBeVisible();
 await capture('top');
 async function measure(card,position){
  const row=await card.evaluate((node,position)=>{
   const form=node.closest('[data-destination-form]'),next=form.querySelector('[data-wizard-next]'),dock=document.querySelector('#modal-destination .tm-home-dock'),caption=node.querySelector('.destination-choice-caption'),f=form.getBoundingClientRect(),c=node.getBoundingClientRect(),label=caption.getBoundingClientRect(),cta=next.getBoundingClientRect(),nav=dock.getBoundingClientRect();
   const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}),limit=Math.min(f.bottom,cta.top-8,nav.top,innerHeight),hits=[];
   for(const [x,y]of [[label.left+1,label.top+1],[label.right-1,label.top+1],[label.left+1,label.bottom-1],[label.right-1,label.bottom-1]])hits.push(node.contains(document.elementFromPoint(x,y)));
   return{position,destination:node.dataset.destinationChoice,scrollTop:form.scrollTop,card:rect(c),caption:rect(label),form:rect(f),continue:rect(cta),dock:rect(nav),contentBottom:limit,hits};
  },position);
  rows.push(row);persist();expect(row.card.top).toBeGreaterThanOrEqual(row.form.top-.1);expect(row.card.bottom).toBeLessThanOrEqual(row.contentBottom+.1);expect(row.caption.top).toBeGreaterThanOrEqual(row.form.top);expect(row.caption.bottom).toBeLessThanOrEqual(row.contentBottom);expect(row.hits.every(Boolean),JSON.stringify(row)).toBe(true);
 }
 for(const card of await cards.all()){await card.evaluate(n=>n.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));await frame();await measure(card,'reachable-center');if(await card.getAttribute('data-destination-choice')==='rome')await capture('selected-center');}
 await form.evaluate(n=>{n.scrollTop=n.scrollHeight;});await frame();for(const index of [4,5])await measure(cards.nth(index),'bottom');
 rows.push({position:'bottom',scrollTop:await form.evaluate(n=>n.scrollTop),headingMayBeAboveScrollViewport:true});persist();await capture('bottom');
 const file=info.outputPath('genuine-discovery-scroll-reachability.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify({width,theme,scope:'Separate top, individually centered cards and bottom; no one frame claims all content',rows},null,2)+'\n');await info.attach('genuine-discovery-scroll-reachability',{path:file,contentType:'application/json'});
}
for(const theme of ['light','dark'])test('selected circular chip contrast proof rejects unsupported paint and restores '+theme,async({page},info)=>{
 await page.setViewportSize({width:430,height:900});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await require('./fixtures/all-trips-v3.cjs').open(page,{theme});
 await page.locator('.tm-home-dock [data-modal="destination"]').click();await page.locator('[data-destination-choice="rome"]').click();
 await circularSelectionReadability(page,info,'chip-valid-'+theme);
 for(const [id,css,reason]of [
  ['contrast','.destination-choice-check{background:#fff!important}','chip contrast below AA'],
  ['coverage','.destination-choice-check{font-size:40px!important;line-height:1!important}','chip glyph rectangle exceeds opaque circular coverage'],
  ['overlay','.destination-choice-check::after{content:"";position:absolute;inset:0;background:white;z-index:9;pointer-events:none}','unsupported pseudo overlay: destination-choice-check::after'],
  ['translucent','.destination-choice-check{background:rgba(15,100,232,.5)!important}','chip background is not proven opaque']
 ]){
  const style=await page.addStyleTag({content:css});let failure;
  try{await circularSelectionReadability(page,info,'chip-expected-unverified-'+id+'-'+theme);}catch(error){failure=error;}finally{await style.evaluate(n=>n.remove());}
  expect(failure?.chipProof,'must reject through structured chip/card proof').toBeDefined();expect(failure.chipProof[0].status).toBe('UNVERIFIED');expect(failure.chipProof[0].issues.some(issue=>issue.includes(reason)),JSON.stringify(failure.chipProof)).toBe(true);
  await circularSelectionReadability(page,info,'chip-restored-'+id+'-'+theme);
 }
});
async function circularSelectionReadability(page,info,name){
 let proof;
 try{await gradientReadability(page,info,name+'-card-paint');}
 catch(error){if(!error.gradientProof)throw error;proof=[{status:'UNVERIFIED',stage:'CARD_PAINT_SCOPE',minimum:4.5,issues:error.gradientProof.flatMap(card=>card.issues),cardPaintProof:error.gradientProof}];}
 if(!proof)proof=await page.locator('#modal-destination [data-destination-choice][aria-pressed="true"] .destination-choice-check').evaluateAll(chips=>chips.map(chip=>{
  // Shared card proof has verified isolated paint order, compositing, masks,
  // pseudo overlays and auxiliary ink bounds. This measures the opaque circle.
  const s=getComputedStyle(chip),box=chip.getBoundingClientRect(),issues=[],glyphs=[],check=(ok,reason)=>{if(!ok&&!issues.includes(reason))issues.push(reason);};
  const color=value=>{const m=/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(value);return m?{rgb:m.slice(1,4).map(Number),alpha:m[4]===undefined?1:Number(m[4])}:null;};
  const background=color(s.backgroundColor),foreground=color(s.color),fill=color(s.webkitTextFillColor);
  check(background&&background.alpha===1&&background.rgb.every(v=>v>=0&&v<=255),'chip background is not proven opaque');
  check(foreground&&fill&&foreground.alpha===1&&fill.alpha===1&&foreground.rgb.every((v,i)=>v===fill.rgb[i])&&foreground.rgb.every(v=>v===255),'chip foreground is not opaque white');
  check(s.position==='absolute'&&s.zIndex==='2'&&s.display==='grid'&&s.backgroundImage==='none'&&s.backgroundClip==='border-box'&&['top','right','bottom','left'].every(k=>parseFloat(s.getPropertyValue('border-'+k+'-width'))===0&&parseFloat(s.getPropertyValue('padding-'+k))===0),'unsupported chip paint geometry');
  check(Math.abs(box.width-28)<.1&&Math.abs(box.height-28)<.1&&Math.abs(box.width-box.height)<.1,'chip is not the supported 28px circle');
  const radius=(value,size)=>/^\d+(?:\.\d+)?%$/.test(value)?parseFloat(value)*size/100:/^\d+(?:\.\d+)?px$/.test(value)?parseFloat(value):NaN;
  const radii=['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(k=>{const tokens=s[k].trim().split(/\s+/);return{computed:s[k],x:radius(tokens[0],box.width),y:radius(tokens[1]||tokens[0],box.height)};});
  check(radii.every(r=>Math.abs(r.x-box.width/2)<.1&&Math.abs(r.y-box.height/2)<.1),'chip radius does not prove circular opaque coverage');
  const cx=box.left+box.width/2,cy=box.top+box.height/2,r=Math.min(box.width,box.height)/2;
  const walker=document.createTreeWalker(chip,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects()){
   const corners=[[rect.left,rect.top],[rect.right,rect.top],[rect.left,rect.bottom],[rect.right,rect.bottom]],inside=corners.every(([x,y])=>(x-cx)**2+(y-cy)**2<=r*r);
   check(rect.width>0&&rect.height>0&&inside,'chip glyph rectangle exceeds opaque circular coverage');glyphs.push({text:node.textContent,corners,inside});
  }}
  check(glyphs.length===1&&glyphs[0].text.trim()==='✓','missing canonical measured check glyph');
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=background&&foreground?(Math.max(luminance(background.rgb),luminance(foreground.rgb))+.05)/(Math.min(luminance(background.rgb),luminance(foreground.rgb))+.05):null;
  check(contrast!==null&&contrast>=4.5,'chip contrast below AA');
  return{status:issues.length?'UNVERIFIED':'VERIFIED',stage:'CIRCLE_GEOMETRY_CONTRAST',paintScopeVerified:true,minimum:4.5,background,foreground,contrast,box:{left:box.left,top:box.top,width:box.width,height:box.height},radii,glyphs,issues};
 }));
 const file=info.outputPath(name+'-circular-chip-contrast.json');require('node:fs').mkdirSync(require('node:path').dirname(file),{recursive:true});require('node:fs').writeFileSync(file,JSON.stringify(proof,null,2)+'\n');await info.attach(name+'-circular-chip-contrast',{path:file,contentType:'application/json'});
 try{expect(proof).toHaveLength(1);expect(proof[0].status,JSON.stringify(proof)).toBe('VERIFIED');expect(proof[0].contrast).toBeGreaterThanOrEqual(4.5);}catch(error){error.chipProof=proof;throw error;}
}
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
  await gradientReadability(page,info,'discovery-'+theme+'-'+accent);await circularSelectionReadability(page,info,'selection-'+theme+'-'+accent);await readability(page,info,'discovery-'+theme+'-'+accent,['#wizard-step-title','#modal-destination [data-destination-manual]','#modal-destination [data-destination-selection]','#modal-destination [data-wizard-next]']);
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
 await discoveryScrollEvidence(page,info,modal,width,theme);
 const imageEvidence={status,width,theme,dockBox,continueBox,syntheticAccount:true,imageFixtures:false,loaded:loaded.length,total:6,items:evidence};
 const evidencePath=info.outputPath('genuine-network-image-evidence.json');require('node:fs').mkdirSync(require('node:path').dirname(evidencePath),{recursive:true});require('node:fs').writeFileSync(evidencePath,JSON.stringify(imageEvidence,null,2)+'\n','utf8');await info.attach('genuine-network-image-evidence',{path:evidencePath,contentType:'application/json'});
 const path=info.outputPath('discovery-'+status.toLowerCase()+'-bottom-context.png');await page.screenshot({path});await info.attach('genuine-network-image-render',{path,contentType:'image/png'});
 // Network availability never controls whether a valid destination can proceed.
 await modal.locator('[data-destination-choice="rome"]').click();await modal.locator('[data-wizard-next]').click();await expect(modal.locator('[data-destination-form]')).toHaveAttribute('data-wizard-step','1');
 expect(await page.evaluate(()=>TravelMateCloud.getLocalTrips().filter(t=>/^\d+$/.test(t.id)).length)).toBe(0);
});
