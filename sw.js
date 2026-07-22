const CACHE_NAME='travelmate-smart-v33';
const CORE=[
  './',
  './index.html',
  './trip/custom/index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/home.js',
  './assets/destination-images.js',
  './assets/home-organizer.css',
  './assets/custom-trip.js',
  './assets/cloud-sync.css',
  './assets/cloud-sync.js',
  './assets/supabase-config.js',
  './assets/mobile-menu.css',
  './assets/document-vault.css',
  './assets/document-vault.js',
  './assets/auto-planner.css',
  './assets/auto-planner.js',
  './assets/nearby.css',
  './assets/nearby.js',
  './assets/place-planner.css',
  './assets/travel-services.css',
  './assets/travel-services.js',
  './assets/smart-hub.css',
  './assets/smart-hub.js',
  './assets/weather-widget.css',
  './assets/weather-widget.js',
  './assets/ai-assistant.css',
  './assets/ai-assistant.js',
  './assets/about.css',
  './assets/about.js',
  './assets/trip-experience.css',
  './assets/trip-experience.js',
  './assets/network-usage.css',
  './assets/network-usage.js',
  './assets/collaboration.css',
  './assets/chat-place-sharing.css',
  './assets/collaboration.js',
  './assets/navigation-memory.css',
  './assets/navigation-memory.js',
  './assets/transport-planner.css',
  './assets/transport-planner.js',
  './assets/place-directions.css',
  './assets/place-sharing.css',
  './assets/place-directions.js',
  './assets/app-icon.svg',
  './manifest.webmanifest'
];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy))}
    return response;
  }catch(error){
    return caches.match(request).then(hit=>hit||caches.match(request,{ignoreSearch:true})).then(hit=>hit||Promise.reject(error));
  }
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const url=new URL(event.request.url);
  const freshAsset=/\.(?:js|css|json|webmanifest)$/i.test(url.pathname);
  event.respondWith(event.request.mode==='navigate'
    ?networkFirst(event.request).catch(()=>caches.match('./index.html'))
    :freshAsset
      ?networkFirst(event.request)
    :caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      if(response.ok){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match(event.request,{ignoreSearch:true})))
  );
});
