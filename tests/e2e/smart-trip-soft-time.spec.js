const {test,expect}=require('@playwright/test');
// Browser-runtime integration with real Today, TripContext and Smart Trip modules.
// All external requests and GPS are controlled; no hidden legacy Smart card is exposed.
for(const width of [360,390,430])for(const theme of ['light','dark'])test(width+' RTL '+theme+' canonical Smart context stays advisory through Places navigation',async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'));
 let providerRequests=0;
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname.includes('overpass'))providerRequests++;return route.abort();});
 await page.addInitScript(theme=>{
  localStorage.setItem('travelmate-theme',theme);
  localStorage.setItem('travelmate-trips',JSON.stringify([{id:'smart-advisory-qa',city:'Controlled Smart QA',country:'Italy',type:'סולו',start:'2026-10-13',end:'2026-10-15',days:3,planInitialized:true,budget:500,expenses:[],savedPlaces:[],activities:[
   {id:'flex',date:'2026-10-13',time:'12:00',duration:60,scheduleMode:'flexible'},
   {id:'window',date:'2026-10-13',time:'12:10',scheduleMode:'window'},
   {id:'completed',date:'2026-10-13',time:'12:20',duration:60,scheduleMode:'fixed',done:true}
  ]}]));
  window.smartQaGpsCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(){window.smartQaGpsCalls++;throw Error('Unexpected automatic GPS');}}});
 },theme);
 await page.goto('/trip/custom/index.html?id=smart-advisory-qa&view=overview',{waitUntil:'domcontentloaded'});
 await expect(page.locator('body')).toHaveAttribute('data-trip-view','overview');
 await page.waitForFunction(()=>Boolean(window.TravelMateFeatures));
 await page.evaluate(()=>TravelMateFeatures.load('intelligence'));
 const actual=await page.evaluate(()=>{
  const trip=TravelMateTripStore.getTrip('smart-advisory-qa'),before=JSON.stringify(trip),now=new Date();
  const model=TravelMateToday.model(trip,now),suggestion=TravelMateSmartTripMode.buildSuggestion(trip,now,{}, {ready:false});
  const request=TravelMateTripContext.buildNearbyRequest({trip,now,position:{lat:32,lon:34}});
  return {current:model.currentOrNext,next:request.nextFixedActivity,available:request.availableMinutes,kind:suggestion.kind,href:suggestion.action.href,unchanged:before===JSON.stringify(trip),gps:window.smartQaGpsCalls};
 });
 expect(actual).toEqual({current:null,next:null,available:null,kind:'free-window',href:'#places',unchanged:true,gps:0});
 await page.getByRole('link',{name:'למצוא מקום',exact:true}).click();
 await expect(page.locator('body')).toHaveAttribute('data-trip-view','places');
 await expect(page.locator('[data-contextual-window-label]')).toBeHidden();
 expect(await page.evaluate(()=>window.smartQaGpsCalls)).toBe(0);expect(providerRequests).toBe(0);
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
});
