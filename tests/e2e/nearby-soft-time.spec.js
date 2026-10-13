const { test, expect } = require('@playwright/test');
const pois = Array.from({length: 8}, (_, i) => ({type: 'node', id: 8000 + i, lat: 32 + i * .001, lon: 34, tags: {name: 'Controlled POI ' + i, amenity: 'cafe', opening_hours: i === 0 ? 'Tu 00:00-00:01' : '24/7'}}));
async function start(page, theme, fixed, response = 'pois') {
  await page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname.includes('overpass')) return response === 'failure' ? route.abort() : route.fulfill({json: {elements: response === 'empty' ? [] : pois}});
    if (url.hostname.includes('nominatim')) return route.fulfill({json: [{lat: '32', lon: '34', display_name: 'Controlled GPS mock'}]});
    return route.abort();
  });
  await page.addInitScript(({theme, fixed}) => {
    localStorage.setItem('travelmate-theme', theme);
    localStorage.setItem('travelmate-trips', JSON.stringify([{id:'qa-soft-time',city:'Controlled QA',country:'Israel',start:'2026-10-13',end:'2026-10-15',days:3,type:'סולו',budget:500,planInitialized:true,savedPlaces:[],activities:fixed?[{id:'fixed',title:'Controlled commitment',date:'2026-10-13',time:'12:20',scheduleMode:'fixed',lat:32,lon:34}]:[]}]));
    window.gpsMockCalls = 0;
    window.baseResultSnapshots=[];
    document.addEventListener('travelmate:nearby-results-rendered',event=>{const host=event.target;if(host.matches&&host.matches('[data-nearby-results]'))window.baseResultSnapshots.push({count:host.querySelectorAll('.nearby-result[data-place-id]').length,guided:host.querySelectorAll('[data-contextual-time-fit]').length});});
    Object.defineProperty(navigator, 'geolocation', {value: {getCurrentPosition(resolve) {window.gpsMockCalls++; resolve({coords:{latitude:32,longitude:34,accuracy:5}});}}});
    // Controlled map mock validates the existing marker/list wiring without loading a provider.
    class MapMock {
      constructor(options) {this.container=options.container;this.zoom=options.zoom;this.center={lat:32,lng:34};}
      addControl() {} on(name, fn) {if(name==='style.load')queueMicrotask(fn);return this;}
      getStyle() {return {layers:[]};} setLayoutProperty() {} resize() {} easeTo() {}
      getZoom() {return this.zoom;} getCenter() {return this.center;}
    }
    class MarkerMock {
      constructor(options) {this.element=options.element;}
      setLngLat() {return this;} addTo(map) {if(this.element)map.container.appendChild(this.element);return this;}
      remove() {if(this.element)this.element.remove();}
    }
    window.maplibregl={Map:MapMock,Marker:MarkerMock,NavigationControl:class {},AttributionControl:class {},getRTLTextPluginStatus:()=> 'loaded',setRTLTextPlugin(){}};
  }, {theme, fixed});
  await page.goto('/trip/custom/index.html?id=qa-soft-time&view=places',{waitUntil:'domcontentloaded'});
  const button=page.locator('[data-contextual-nearby-open]');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('[data-gps-consent]')).toBeVisible();
  await page.locator('[data-gps-once]').click();
}
for(const width of [360,390,430])for(const theme of ['light','dark']){
  test.describe(width+' RTL '+theme,()=>{
    test.use({viewport:{width,height:844}});
    test('zero green keeps every POI selectable and map/list synchronized',async({page})=>{
      const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await start(page,theme,true);
      const results=page.locator('[data-nearby-results]');
      await expect(results).toHaveAttribute('data-contextual-green-count','0');
      await expect(results.locator('.nearby-result[data-place-id]')).toHaveCount(8);
      await expect(results.locator('[data-contextual-time-fit="red"]')).toHaveCount(8);
      const ids=await results.locator('.nearby-result[data-place-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.placeId));
      await results.locator('[data-nearby-details]').first().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-nearby-map-shell]')).toBeVisible();
      await expect(page.locator('.tm-poi-marker')).toHaveCount(8);
      expect(await page.locator('.tm-poi-marker').evaluateAll(nodes=>nodes.map(n=>n.dataset.markerPlaceId))).toEqual(ids);
      await page.locator('[data-nearby-detail-close]').click();
      await page.locator('.tm-poi-marker').last().click();
      await expect(page.locator('[data-nearby-map-detail]')).toContainText('Controlled POI 7');
      expect(await page.evaluate(()=>window.gpsMockCalls)).toBe(1);
      expect(await page.evaluate(()=>window.baseResultSnapshots.some(snapshot=>snapshot.count===8&&snapshot.guided===0))).toBe(true);
      expect(await page.evaluate(()=>window.baseResultSnapshots.some(snapshot=>snapshot.count===8&&snapshot.guided===8))).toBe(true);
      await expect(page.locator('html')).toHaveAttribute('dir','rtl');
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
      expect(errors).toEqual([]);
    });
    test('first click without fixed commitment starts base search without time choice',async({page})=>{
      await start(page,theme,false);
      await expect(page.locator('[data-nearby-results] .nearby-result[data-place-id]')).toHaveCount(8);
      await expect(page.locator('[data-contextual-window-label]')).toBeHidden();
      await expect(page.locator('[data-contextual-time-fit]')).toHaveCount(8); // advisory result tags only
      await expect(page.locator('[data-nearby-results]')).toHaveAttribute('data-contextual-red-count','1');
      expect(await page.evaluate(()=>window.gpsMockCalls)).toBe(1);
    });
  });
}
for(const response of ['empty','failure'])test(response+' API result remains distinct from time guidance',async({page})=>{
  await start(page,'light',false,response);
  const status=page.locator('[data-nearby-status]');
  await expect(status).toContainText(response==='empty'?'לא נמצאו מקומות באזור הזה':'לא הצלחנו לטעון מקומות כרגע');
  await expect(page.locator('[data-nearby-results] .nearby-result')).toHaveCount(0);
});
