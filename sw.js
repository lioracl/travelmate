const ASSET_VERSION='20261003-13';
const CACHE_SCHEMA='v266';
const CACHE_NAME='travelmate-smart-'+CACHE_SCHEMA+'-'+ASSET_VERSION;
const TRAVELMATE_CACHE_PATTERN=/^travelmate-smart-v\d+(?:-20\d{6}-\d+)?$/;
const CORE_PATHS=[
  './',
  './index.html',
  './trip/custom/index.html',
  './trip/italy-2028/index.html',
  './trip/japan-2027/index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/readable-glass.css',
  './assets/home.js',
  './assets/destination-images.js',
  './assets/home-organizer.css',
  './assets/custom-trip.js',
  './assets/cloud-sync.css',
  './assets/cloud-sync.js',
  './assets/trip-store.js',
  './assets/event-contracts.js',
  './assets/user-profile.js',
  './assets/fixed-reminders.css',
  './assets/fixed-reminders.js',
  './assets/supabase-config.js',
  './assets/mobile-menu.css',
  './assets/language.css',
  './assets/language.js',
  './assets/navigation-memory.css',
  './assets/navigation-memory.js',
  './assets/network-usage.css',
  './assets/network-usage.js',
  './assets/trip-redesign.css',
  './assets/trip-redesign.js',
  './assets/modal-system.css',
  './assets/theme.css',
  './assets/theme.js',
  './assets/weather-widget.css',
  './assets/weather-widget.js',
  './assets/app-icon.svg',
  './manifest.webmanifest'
];
const CORE=CORE_PATHS.map(path=>/\.(?:js|css|json)$/i.test(path)?path+'?v='+ASSET_VERSION:path);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>TRAVELMATE_CACHE_PATTERN.test(key)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
function reminderNotificationTarget(raw){try{const target=new URL(String(raw||''),self.location.origin),base=new URL('./',self.location.href);if(target.origin!==self.location.origin||!target.pathname.startsWith(base.pathname))return null;const relative=target.pathname.slice(base.pathname.length);if(!/^trip\/[^/]+\/(?:index\.html)?$/.test(relative)||!target.searchParams.get('id'))return null;target.searchParams.set('view','plan');target.hash='';return target}catch(error){return null}}
self.addEventListener('notificationclick',event=>{event.notification.close();const target=reminderNotificationTarget(event.notification&&event.notification.data&&event.notification.data.url);if(!target)return;event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const match=list.find(client=>{try{const current=new URL(client.url);return current.origin===target.origin&&current.pathname===target.pathname&&current.searchParams.get('id')===target.searchParams.get('id')}catch(error){return false}});if(!match)return clients.openWindow(target.href);const navigated=typeof match.navigate==='function'?match.navigate(target.href).catch(()=>match):Promise.resolve(match);return navigated.then(client=>client&&client.focus?client.focus():client)}))});
function persistResponse(event,request,response){
  if(!event||!response||!response.ok)return;
  const copy=response.clone();
  const task=caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));
  event.waitUntil(task);
}
async function networkFirst(request,event,ignoreSearch){
  const matchOptions=ignoreSearch?{ignoreSearch:true}:undefined;
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){
      persistResponse(event,request,response);
      return response;
    }
    if(response.status>=500){
      const hit=await caches.match(request,matchOptions);
      if(hit)return hit;
      throw new Error('http-'+response.status);
    }
    return response;
  }catch(error){
    return caches.match(request,matchOptions).then(hit=>hit||Promise.reject(error));
  }
}
async function cacheFirstVersioned(request,event){
  const hit=await caches.match(request);
  if(hit)return hit;
  const response=await fetch(request,{cache:'no-store'});
  persistResponse(event,request,response);
  return response;
}
// Canonical entry shells are independent of query strings and directory URLs.
// Online navigation caches new trip routes automatically; no future route list is needed.
async function navigationFallback(url){
  const base=new URL('./',self.location.href);
  const relative=url.pathname.startsWith(base.pathname)?url.pathname.slice(base.pathname.length):'';
  const trip=relative.match(/^trip\/([^/]+)(?:\/(?:index\.html)?)?$/);
  const entry=trip?new URL('trip/'+trip[1]+'/index.html',base):new URL('index.html',base);
  const hit=await caches.match(entry.href,{ignoreSearch:true});
  if(hit)return hit;
  // Never disguise an uncached trip as Home.
  return new Response('הטיול אינו זמין במצב לא מקוון. יש להתחבר כדי לטעון אותו.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const url=new URL(event.request.url);
  const freshAsset=/\.(?:js|css|json|webmanifest)$/i.test(url.pathname);
  const livePatchAsset=/\/assets\/phone-visual-qa\.css$/i.test(url.pathname);
  const versionedAsset=freshAsset&&url.searchParams.has('v');
  event.respondWith(event.request.mode==='navigate'
    ?networkFirst(event.request,event,true).catch(()=>navigationFallback(url))
    :livePatchAsset
      ?networkFirst(event.request,event,false)
    :versionedAsset
      ?cacheFirstVersioned(event.request,event)
    :freshAsset
      ?networkFirst(event.request,event,false)
    :caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      persistResponse(event,event.request,response);
      return response;
    }).catch(()=>caches.match(event.request)))
  );
});