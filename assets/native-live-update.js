(function(root){
  'use strict';
  var UPDATE_URL='https://lioracl.github.io/travelmate/ota/latest.json';
  function bytes(value){return Uint8Array.from(atob(value),function(c){return c.charCodeAt(0)});}
  async function verifyManifest(envelope,contract,subtle){
    var pem=contract.publicKey.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
    var key=await subtle.importKey('spki',bytes(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(envelope.signature),bytes(envelope.payload)))throw Error('OTA_METADATA_SIGNATURE');
    var manifest=JSON.parse(new TextDecoder().decode(bytes(envelope.payload)));
    if(manifest.schemaVersion!==1||!Number.isInteger(manifest.nativeApiLevel)||manifest.nativeApiLevel<1||manifest.nativeApiLevel>contract.nativeApiLevel)throw Error('OTA_INCOMPATIBLE');
    if(!/^[a-f0-9]{40}$/.test(manifest.sha)||!/^[a-f0-9]{64}$/.test(manifest.sha256)||!manifest.version||!manifest.bundleSignature)throw Error('OTA_METADATA');
    if(manifest.url!=='https://lioracl.github.io/travelmate/ota/'+manifest.sha+'/bundle.zip')throw Error('OTA_URL');
    return manifest;
  }
  async function check(deps){
    var contract=await deps.bridge.getRuntimeContract();
    var response=await deps.fetch(UPDATE_URL,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('OTA_UNAVAILABLE');
    var manifest=await verifyManifest(await response.json(),contract,deps.subtle);
    var current=await deps.live.getCurrentBundle();
    var blocked=await deps.live.getBlockedBundles();
    if(manifest.sha===(current.bundleId||deps.sha)||(blocked.bundleIds||[]).includes(manifest.sha))return 'unchanged';
    var next=await deps.live.getNextBundle();
    if(next.bundleId===manifest.sha)return 'staged';
    // The plugin enforces RSA signature verification natively. Independently verify
    // the signed metadata's SHA-256 too (the plugin uses signature OR checksum).
    var download=await deps.fetch(manifest.url,{cache:'no-store',signal:AbortSignal.timeout(60000)});
    if(!download.ok)throw Error('OTA_DOWNLOAD');
    var digest=await deps.subtle.digest('SHA-256',await download.arrayBuffer());
    var hex=Array.from(new Uint8Array(digest),function(x){return x.toString(16).padStart(2,'0')}).join('');
    if(hex!==manifest.sha256)throw Error('OTA_CHECKSUM');
    await deps.live.downloadBundle({bundleId:manifest.sha,url:manifest.url,artifactType:'zip',checksum:manifest.sha256,signature:manifest.bundleSignature});
    await deps.live.setNextBundle({bundleId:manifest.sha});
    return 'staged'; // Never reload: native plugin selects this on the next cold start.
  }
  if(typeof module==='object'&&module.exports){module.exports={verifyManifest:verifyManifest,check:check};return;}
  var cap=root.Capacitor;if(!cap||!cap.isNativePlatform||!cap.isNativePlatform())return;
  var live=cap.Plugins.LiveUpdate||cap.registerPlugin('LiveUpdate');
  var bridge=cap.Plugins.TravelMateWidgetBridge||cap.registerPlugin('TravelMateWidgetBridge');
  async function start(){
    // Core shell readiness does not depend on auth or remote feature content.
    if(!document.querySelector('main')||!root.TravelMateFeatures)return;
    await live.ready();
    root.TravelMateNativeUpdate={status:'checking',sha:root.TravelMateWebBuild&&root.TravelMateWebBuild.sha};
    try{root.TravelMateNativeUpdate.status=await check({live:live,bridge:bridge,fetch:root.fetch.bind(root),subtle:root.crypto.subtle,sha:root.TravelMateNativeUpdate.sha});}
    catch(error){root.TravelMateNativeUpdate.status='unavailable';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){start().catch(function(){})},{once:true});else start().catch(function(){});
})(typeof window==='object'?window:globalThis);
