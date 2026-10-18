const {test,expect}=require('@playwright/test');
const {readability}=require('./fixtures/six-screen-v3.cjs');
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
 await expect(modal.locator('button[type=submit]')).toBeHidden();await close.focus();await page.keyboard.press('Shift+Tab');await expect(modal.locator('[data-wizard-next]')).toBeFocused();await page.keyboard.press('Tab');await expect(close).toBeFocused();
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
  await readability(page,info,'discovery-'+theme+'-'+accent,['#wizard-step-title','#modal-destination [data-destination-manual]','#modal-destination [data-destination-selection]','#modal-destination [data-wizard-next]','[data-destination-choice="rome"] .destination-choice-caption strong','[data-destination-choice="rome"] .destination-choice-caption>span','[data-destination-choice="rome"] .destination-choice-check']);
 }
 await expect(modal.locator('[data-destination-choice="rome"]')).toHaveCSS('transition-duration','0s');
 await page.screenshot({path:info.outputPath('discovery-five-accent-'+theme+'.png')});
});

test('discovery genuine-network image evidence records available photographs and explicit gaps',async({page},info)=>{
 await page.setViewportSize({width:390,height:900});
 await page.route('**/*',route=>{
  const host=new URL(route.request().url()).hostname;
  return host==='127.0.0.1'||/(^|\.)(wikipedia\.org|wikimedia\.org|unsplash\.com)$/.test(host)?route.continue():route.abort();
 });
 await require('./fixtures/all-trips-v3.cjs').open(page,{theme:'light'});
 await page.locator('.tm-home-dock [data-modal="destination"]').click();const modal=page.locator('#modal-destination');
 await expect(modal.locator('[data-destination-choice]')).toHaveCount(6);
 // The production adapter has a bounded 12-second image deadline. This does
 // not change baseline assertions/timeouts or pretend unavailable photos loaded.
 await expect(modal.locator('[data-image-state="loading"]')).toHaveCount(0,{timeout:15000});
 const evidence=await modal.locator('[data-destination-choice]').evaluateAll(nodes=>nodes.map(node=>({destination:node.dataset.destinationChoice,label:node.getAttribute('aria-label'),state:node.dataset.imageState,url:node.querySelector('img').currentSrc,width:node.querySelector('img').naturalWidth})));
 const loaded=evidence.filter(item=>item.state==='ready');for(const item of loaded){expect(item.width).toBeGreaterThan(0);expect(item.url).toMatch(/^https:\/\//);}
 const status=loaded.length?'GENUINE_NETWORK_IMAGES_RENDERED_REQUIRES_HUMAN_DESTINATION_REVIEW':'GENUINE_NETWORK_IMAGES_UNAVAILABLE';
 await info.attach('genuine-network-image-evidence',{body:Buffer.from(JSON.stringify({status,syntheticAccount:true,imageFixtures:false,loaded:loaded.length,total:6,items:evidence},null,2)),contentType:'application/json'});
 const path=info.outputPath('discovery-'+status.toLowerCase()+'.png');await page.screenshot({path});await info.attach('genuine-network-image-render',{path,contentType:'image/png'});
 // Network availability never controls whether a valid destination can proceed.
 await modal.locator('[data-destination-choice="rome"]').click();await modal.locator('[data-wizard-next]').click();await expect(modal.locator('[data-destination-form]')).toHaveAttribute('data-wizard-step','1');
 expect(await page.evaluate(()=>TravelMateCloud.getLocalTrips().filter(t=>/^\d+$/.test(t.id)).length)).toBe(0);
});
