const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('ordinary web, PWA, backend and repository infrastructure changes are OTA_ONLY',async()=>{
  const {classify}=await import('../tools/classify-distribution.mjs');
  const paths=['index.html','assets/about.js','assets/styles.css','sw.js','manifest.webmanifest','assets/icons/icon.png','tests/native-example.test.js','docs/native-guide.md','supabase/functions/example/index.ts','.github/workflows/deploy-pages.yml','tools/stamp-web-build.mjs','AGENTS.md'];
  assert.equal(classify(paths.map(path=>({path}))).distribution,'OTA_ONLY');
});

test('native projects, overlays, bridges and compatibility metadata require APK',async()=>{
  const {classify}=await import('../tools/classify-distribution.mjs');
  const nativePaths=['android/app/src/main/res/icon.png','ios/App/Info.plist','android\\build.gradle','capacitor.config.ts','ota-overlay.json','assets/native-live-update.js','assets/budget-widget-actions.js','plugins/example/index.js','native-api.json','shell-compatibility.json','App.swift','AndroidManifest.xml'];
  for(const path of nativePaths) assert.equal(classify([{path}]).distribution,'APK_REQUIRED',path);
});

test('native dependency/API additions fail closed without treating diagnostics as native work',async()=>{
  const {classify}=await import('../tools/classify-distribution.mjs');
  assert.equal(classify([{path:'assets/example.js',added:'+import x from "@capacitor/geolocation"'}]).distribution,'APK_REQUIRED');
  assert.equal(classify([{path:'assets/example.js',added:'+registerPlugin("Example")'}]).distribution,'APK_REQUIRED');
  assert.equal(classify([{path:'package.json',changed:'+"@capacitor/geolocation": "8"'}]).distribution,'APK_REQUIRED');
  assert.equal(classify([{path:'package.json',changed:'+"lodash": "5"'}]).distribution,'OTA_ONLY');
  assert.equal(classify([{path:'assets/about.js',added:'+if(build.nativeApiLevel) show(build.nativeApiLevel)'}]).distribution,'OTA_ONLY');
});

test('unknown OTA bases fail closed and Preview verifies before deployment',async()=>{
  const {classifyGitRange,OTA_BASE}=await import('../tools/classify-distribution.mjs');
  assert.match(OTA_BASE,/^[a-f0-9]{40}$/);
  assert.throws(()=>classifyGitRange('0000000000000000000000000000000000000000'),/known OTA compatibility base/);
  const workflow=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
  assert.equal((workflow.match(/Classify cumulative distribution/g)||[]).length,1);
  assert(workflow.indexOf('Classify cumulative distribution')<workflow.indexOf('Run regression tests'));
  assert(workflow.includes('needs: verify'));
  assert(workflow.includes('TRAVELMATE_WEB_CHANNEL: preview'));
  assert(!workflow.includes('github.event.before'));
});

function runAbout(overrides={}) {
  let html='';
  const window={addEventListener(){},setTimeout(){},location:{hostname:'localhost',protocol:'http:'},matchMedia(){return {matches:false};},...overrides};
  const document={readyState:'complete',querySelector(){return null;},querySelectorAll(){return [];},body:{insertAdjacentHTML(_,value){html=value;},classList:{add(){},remove(){}}},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('assets/about.js','utf8'),{window,document});
  return {html,status:window.TravelMateSystemStatus()};
}

test('About system status distinguishes runtime and never invents native metadata',()=>{
  const browser=runAbout();
  assert.equal(browser.status.runtime,'דפדפן');
  assert.equal(browser.status.nativeApiLevel,null);
  assert.match(browser.html,/מצב המערכת/);

  const pwa=runAbout({navigator:{standalone:true}});
  assert.equal(pwa.status.runtime,'PWA מותקנת');

  const nativeBase={Capacitor:{isNativePlatform(){return true;}}};
  const native=runAbout(nativeBase);
  assert.equal(native.status.runtime,'מעטפת Native');
  assert.equal(native.status.nativeApiLevel,null);
  assert.doesNotMatch(native.html,/רמת API של Native/);

  const build={sha:'a'.repeat(40),version:'2.22.1',channel:'preview',nativeApiLevel:2,cacheRevision:'travelmate-test'};
  const nativeStamped=runAbout({...nativeBase,TravelMateWebBuild:build});
  assert.equal(nativeStamped.status.channel,'Preview');
  assert.equal(nativeStamped.status.nativeApiLevel,2);
  assert.match(nativeStamped.html,/רמת API של Native: 2/);

  const webStamped=runAbout({TravelMateWebBuild:build});
  assert.equal(webStamped.status.channel,'Preview');
  assert.equal(webStamped.status.nativeApiLevel,null);
  assert.doesNotMatch(webStamped.html,/רמת API של Native/);
});


test('OTA acceptance boundary stays API2 while the unaccepted API3 candidate requires an APK',async()=>{const {OTA_BASE,classify}=await import('../tools/classify-distribution.mjs');assert.equal(OTA_BASE,'81ff06343c49b9a395661f54bfc873a3ccb85644');const overlay=JSON.parse(fs.readFileSync('ota-overlay.json','utf8'));assert.equal(overlay.sha,'623ae0ef2d6a655368f2be704a4ccdef8924b7af');assert.equal(overlay.nativeApiLevel,3);assert.equal(classify([{path:'android/app/src/main/java/com/travelmate/app/TravelMateVoicePlugin.java'}]).distribution,'APK_REQUIRED')});
