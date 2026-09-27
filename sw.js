const CACHE_NAME='travelmate-smart-v254';
const ASSET_VERSION='20260927-25';
const CORE_PATHS=[
  './',
  './index.html',
  './trip/custom/index.html',
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
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>/^travelmate-smart-v\d+$/.test(key)&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
function persistResponse(event,request,response){
  if(!event||!response||!response.ok)return;
  const task=caches.open(CACHE_NAME).then(cache=>cache.put(request,response.clone()));
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
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const url=new URL(event.request.url);
  const freshAsset=/\.(?:js|css|json|webmanifest)$/i.test(url.pathname);
  const versionedAsset=freshAsset&&url.searchParams.has('v');
  event.respondWith(event.request.mode==='navigate'
    ?networkFirst(event.request,event,true).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||(url.pathname.includes('/trip/custom/')?caches.match('./trip/custom/index.html'):caches.match('./index.html'))))
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
