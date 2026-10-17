const {expect}=require('@playwright/test');
const {open:openOverview,previewOrigin,trip}=require('./overview-v3.cjs');
const photo='https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=700&q=80';
const pois=[
 {type:'node',id:91001,lat:41.8902,lon:12.4922,tags:{name:'קולוסיאום · נתוני בדיקה',tourism:'attraction',image:photo,website:'https://example.org/controlled-place', 'addr:street':'Piazza del Colosseo'}},
 {type:'node',id:91002,lat:41.891,lon:12.493,tags:{name:'קפה הבדיקה',amenity:'cafe','addr:street':'Via di Test'}},
 {type:'node',id:91003,lat:41.91,lon:12.51,tags:{name:'מוזיאון בדיקה',tourism:'museum'}},
];
const record={...trip,id:'places-v3',activities:[],savedPlaces:[{id:'saved-controlled',sourceId:'osm:node:91999',source:'OpenStreetMap',name:'מקום שמור לבדיקת שחזור',category:'cafe',lat:41.892,lon:12.494,date:'',time:'',imageResolutionVersion:3}]};
async function open(page,{theme='light',gps='accepted',provider='ready',realMap=false}={}){
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.fallback();if(url.hostname.includes('overpass')){if(provider==='error')return route.abort();if(provider==='delayed')return new Promise(resolve=>{page.once('close',resolve)});return route.fulfill({json:{elements:provider==='empty'?[]:pois}});}if(url.hostname.includes('nominatim'))return route.fulfill({json:[{lat:'41.8902',lon:'12.4922',display_name:'Controlled Rome fixture'}]});if(url.hostname==='images.unsplash.com'||url.hostname==='cdnjs.cloudflare.com')return route.continue();if(realMap&&['unpkg.com','tiles.openfreemap.org'].includes(url.hostname))return route.continue();return route.abort();});
 await page.addInitScript(({gps,previewOrigin,realMap})=>{
  if(location.origin!==previewOrigin)return;
  window.placesGpsCalls=0;
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:gps==='unavailable'?undefined:{getCurrentPosition(resolve,reject){window.placesGpsCalls++;if(gps==='delayed'){window.finishPlacesGps=()=>resolve({coords:{latitude:41.8902,longitude:12.4922,accuracy:8}});return;}if(gps==='denied'){reject({code:1});return;}resolve({coords:{latitude:41.8902,longitude:12.4922,accuracy:8}});}}});
  if(realMap)return;
  // Controlled MapLibre test double, matching existing Nearby QA. No fake provider tiles.
  class MapMock{
   constructor(options){this.container=options.container;this.zoom=options.zoom;this.center={lat:options.center[1],lng:options.center[0]};this.events={};this.container.dataset.controlledMap='true';}
   addControl(){} on(event,fn){(this.events[event]||(this.events[event]=[])).push(fn);if(event==='style.load')queueMicrotask(fn);return this;}
   getStyle(){return {layers:[]}}setLayoutProperty(){}resize(){}easeTo(options){this.center={lat:options.center[1],lng:options.center[0]};this.zoom=options.zoom||this.zoom;}
   getZoom(){return this.zoom}getCenter(){return this.center}getBounds(){return {getSouth:()=>41.88,getNorth:()=>41.90,getWest:()=>12.48,getEast:()=>12.50}}emit(event){(this.events[event]||[]).forEach(fn=>fn({error:new Error('Controlled provider error')}))}
  }
  class MarkerMock{constructor(options){this.element=options.element}setLngLat(){return this}addTo(map){if(this.element)map.container.appendChild(this.element);return this}remove(){if(this.element)this.element.remove()}}
  window.maplibregl={Map:MapMock,Marker:MarkerMock,NavigationControl:class{},AttributionControl:class{},getRTLTextPluginStatus:()=> 'loaded',setRTLTextPlugin(){}};
 },{gps,previewOrigin,realMap});
 await openOverview(page,{theme,record,preserveTrip:true});
 await (page.viewportSize().width>1000?page.locator('.sidebar [data-view="places"]'):page.locator('[data-shell-view="places"]')).click();
 await expect(page.locator('.places-v3-views')).toBeVisible();
 await page.waitForFunction(()=>[...document.styleSheets].some(sheet=>sheet.href&&sheet.href.includes('nearby.css')));
}
async function search(page){await page.locator('[data-nearby-execute-search]').click();await expect(page.locator('[data-nearby-results]>.nearby-result')).toHaveCount(3);}
module.exports={open,search,record,pois,photo};
