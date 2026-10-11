const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const sw=fs.readFileSync('sw.js','utf8');
test('stamped web deployment gives HTML, lazy assets, worker and diagnostics one exact SHA',()=>{
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'tm-web-stamp-'));const sha='c'.repeat(40);
 try{
  fs.mkdirSync(path.join(site,'assets'));fs.mkdirSync(path.join(site,'trip','custom'),{recursive:true});
  for(const name of ['index.html','trip/custom/index.html'])fs.writeFileSync(path.join(site,name),'<link href="assets/styles.css?v=20261011-02"><script src="'+(name.startsWith('trip')?'../../':'')+'assets/app.js?v=20261011-02" defer></script>');
  fs.writeFileSync(path.join(site,'sw.js'),sw);fs.writeFileSync(path.join(site,'assets','app.js'),"var appAssetVersion='20261011-02';");
  for(const name of ['styles.css','document-vault.js','budget-v2.js','native-widget-snapshot.js','budget-widget-actions.js'])fs.writeFileSync(path.join(site,'assets',name),'');
  execFileSync(process.execPath,['tools/stamp-web-build.mjs',site],{env:{...process.env,TRAVELMATE_WEB_BUILD_SHA:sha}});
  const build=JSON.parse(fs.readFileSync(path.join(site,'build-info.json')));assert.equal(build.sha,sha);assert.equal(build.version,fs.readFileSync('assets/about.js','utf8').match(/version: '([^']+)'/)[1]);
  const html=fs.readFileSync(path.join(site,'trip/custom/index.html'),'utf8');assert.ok(html.includes('../../assets/web-build.js?v='+sha));assert.ok(html.includes('app.js?v='+sha));assert.ok(!html.includes('20261011-02'));
  const worker=fs.readFileSync(path.join(site,'sw.js'),'utf8');assert.ok(worker.includes("const ASSET_VERSION='"+sha+"'"));assert.ok(worker.includes('./assets/document-vault.js'));assert.ok(worker.includes('./assets/budget-v2.js'));assert.ok(!worker.includes('./assets/native-widget-snapshot.js'));assert.ok(!worker.includes('./assets/budget-widget-actions.js'));
  const browser={};vm.runInNewContext(fs.readFileSync(path.join(site,'assets','web-build.js'),'utf8'),{window:browser,Object});assert.equal(browser.TravelMateWebBuild.sha,sha);assert.equal(browser.TravelMateWebBuild.cacheRevision,build.cacheRevision);
 }finally{fs.rmSync(site,{recursive:true,force:true});}
});
test('web build refuses non-SHA revision without changing the staged site',()=>{
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'tm-web-invalid-'));
 try{assert.throws(()=>execFileSync(process.execPath,['tools/stamp-web-build.mjs',site],{env:{...process.env,TRAVELMATE_WEB_BUILD_SHA:'latest'},stdio:'pipe'}));assert.deepEqual(fs.readdirSync(site),[]);}finally{fs.rmSync(site,{recursive:true,force:true});}
});
test('worker install waits for explicit update acceptance and activation removes only app caches',async()=>{
 const handlers={},deleted=[];let skipped=0;const sha=sw.match(/const ASSET_VERSION='([^']+)'/)[1],current='travelmate-smart-v266-'+sha;
 vm.runInNewContext(sw,{URL,Response,fetch:async()=>new Response(''),caches:{open:async()=>({addAll:async()=>{}}),keys:async()=>[current,'travelmate-smart-v265','travelmate-smart-v266-'+ 'a'.repeat(40),'user-documents'],delete:async name=>deleted.push(name)},self:{location:{origin:'https://test',href:'https://test/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{skipped++;},clients:{claim:async()=>{}}}});
 let pending;handlers.install({waitUntil:p=>pending=p});await pending;assert.equal(skipped,0);
 handlers.message({data:{type:'SKIP_WAITING'}});assert.equal(skipped,1);
 handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted.sort(),['travelmate-smart-v265','travelmate-smart-v266-'+'a'.repeat(40)]);assert.ok(!deleted.includes('user-documents'));
});
