const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash, generateKeyPairSync, sign} = require('node:crypto');
const input = import('../tools/verify-release-inputs.mjs');
const retention = import('../tools/retain-preview-ota.mjs');
const sha = 'e8513167165b0363a497199e83e176c868173923';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(NATIVE_SHA) {
  return {sha, preview: {sha, channel: 'preview', version: '3.0.0'}, pin: {repository: 'lioracl/travelmate', sha: NATIVE_SHA, nativeApiLevel: 2}, native: {nativeApiLevel: 2}, gradle: 'applicationId "com.travelmate.app"\nversionName "2.26.1"\nversionCode 22601', expectedVersion: '2.26.1', expectedCode: '22601', webVersion: '3.0.0'};
}
test('source-derived wrapper and web versions remain distinct', async () => {
  const {validate,NATIVE_SHA}=await input,r=validate(fixture(NATIVE_SHA));
  assert.equal(r.nativeVersion,'2.26.1');assert.equal(r.webVersion,'3.0.0');
});
test('wrong/injected SHA, deployed provenance, wrapper version/code/application ID and API reject', async () => {
  const {validate,NATIVE_SHA}=await input;
  for(const mutate of [
    f=>f.sha='preview',f=>f.sha=sha.slice(0,12),f=>f.sha=sha+';echo injected',
    f=>f.preview.sha='a'.repeat(40),f=>f.preview.channel='production',f=>f.preview.version='old',
    f=>f.pin.sha='b'.repeat(40),f=>f.pin.repository='other/repo',f=>f.pin.nativeApiLevel=1,
    f=>f.native.nativeApiLevel=1,f=>f.expectedVersion='2.21.1',f=>f.expectedCode='22101',
    f=>f.gradle=f.gradle.replace('com.travelmate.app','com.other.app')
  ]){const f=fixture(NATIVE_SHA);mutate(f);assert.throws(()=>validate(f));}
});
test('native-impact or unknown distribution fails closed against the fixed authorized API2 pin', async () => {
  const {requireCompatibleDistribution,NATIVE_SHA}=await input,pin=fixture(NATIVE_SHA).pin;
  assert.equal(requireCompatibleDistribution({distribution:'OTA_ONLY',reasons:[]},pin).nativeSha,NATIVE_SHA);
  for(const result of [{distribution:'APK_REQUIRED',reasons:[{path:'android/app/build.gradle'}]},{distribution:'UNKNOWN',reasons:[]},{distribution:'OTA_ONLY',reasons:[{path:'unknown'}]},{}])assert.throws(()=>requireCompatibleDistribution(result,pin));
  for(const broken of [{...pin,sha:'a'.repeat(40)},{...pin,nativeApiLevel:1},null])assert.throws(()=>requireCompatibleDistribution({distribution:'OTA_ONLY',reasons:[]},broken));
});
test('final Preview acceptance rejects a concurrently moved deployed SHA', async () => {
  const {verifyPreview}=await input;
  verifyPreview({sha,channel:'preview',version:'2.26.2'},sha,'2.26.2');
  assert.throws(()=>verifyPreview({sha:'a'.repeat(40),channel:'preview',version:'2.26.2'},sha,'2.26.2'));
});
test('permanent certificate and all existing signing inputs remain mandatory', async () => {
  const {certificate,signingReady}=await input;
  const env={TRAVELMATE_QA_KEYSTORE_BASE64:'fixture',TRAVELMATE_QA_STORE_PASSWORD:'fixture',TRAVELMATE_QA_KEY_ALIAS:'fixture',TRAVELMATE_QA_KEY_PASSWORD:'fixture',TRAVELMATE_QA_CERT_SHA256:'aa:'.repeat(31)+'aa'};
  assert.equal(signingReady(env),'a'.repeat(64));
  for(const key of Object.keys(env))assert.throws(()=>signingReady({...env,[key]:''}));
  assert.throws(()=>certificate('wrong-certificate'));
});
function signedFixture(origin, overrides={}) {
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const bundle=Buffer.from('PK immutable signed fixture bytes');
  const info={schemaVersion:1,sha,version:'2.26.2',nativeApiLevel:2,url:origin+sha+'/bundle.zip',sha256:digest(bundle),bundleSignature:sign('RSA-SHA256',bundle,privateKey).toString('base64'),...overrides};
  const payload=Buffer.from(JSON.stringify(info));
  const latest=Buffer.from(JSON.stringify({payload:payload.toString('base64'),signature:sign('RSA-SHA256',payload,privateKey).toString('base64')}));
  return {publicKey,privateKey,bundle,latest,expectedFiles:{manifestBytes:latest.length,manifestSha256:digest(latest),bundleBytes:bundle.length,bundleSha256:digest(bundle)}};
}
test('current pointer, immutable manifest and bundle are verified and retained byte-for-byte', async () => {
  const {validateCurrent,OTA_ORIGIN}=await retention,f=signedFixture(OTA_ORIGIN);
  assert.equal(validateCurrent(f.latest,f.latest,f.bundle,f.publicKey,sha,'2.26.2',f.expectedFiles).sha,sha);
});
test('tampered pointer/manifest/bundle, wrong signer/version/origin/path and independent size evidence reject', async () => {
  const {validateCurrent,OTA_ORIGIN}=await retention,f=signedFixture(OTA_ORIGIN);
  const check=(latest=f.latest,manifest=f.latest,bundle=f.bundle,key=f.publicKey,expected=f.expectedFiles)=>validateCurrent(latest,manifest,bundle,key,sha,'2.26.2',expected);
  for(const which of ['pointer','manifest','bundle']){
    const altered=Buffer.from(which==='bundle'?f.bundle:f.latest);altered[altered.length-3]^=1;
    assert.throws(()=>which==='pointer'?check(altered):which==='manifest'?check(f.latest,altered):check(f.latest,f.latest,altered));
  }
  assert.throws(()=>check(f.latest,f.latest,f.bundle,generateKeyPairSync('rsa',{modulusLength:2048}).publicKey));
  assert.throws(()=>check(f.latest,f.latest,f.bundle,f.publicKey,{...f.expectedFiles,bundleBytes:1}));
  for(const overrides of [{url:'https://evil.invalid/bundle.zip'},{url:OTA_ORIGIN+'../bundle.zip'},{sha:'a'.repeat(40)},{version:'2.21.1'},{nativeApiLevel:1}]){
    const bad=signedFixture(OTA_ORIGIN,overrides);
    assert.throws(()=>validateCurrent(bad.latest,bad.latest,bad.bundle,bad.publicKey,sha,'2.26.2',bad.expectedFiles));
  }
});
test('HTTPS reader rejects redirects, changed URLs, wrong paths, absent and oversized evidence', async () => {
  const {download,SITE,OTA_ORIGIN}=await retention;
  function response(url,body,status=200,redirected=false){const r=new Response(body,{status});Object.defineProperty(r,'url',{value:url});Object.defineProperty(r,'redirected',{value:redirected});return r;}
  assert.equal((await download(OTA_ORIGIN+'latest.json',100,{fetcher:async(url,options)=>{assert.equal(options.redirect,'error');return response(url,'fixture');}})).toString(),'fixture');
  await assert.rejects(()=>download('https://evil.invalid/latest.json',100));
  await assert.rejects(()=>download(SITE+'../outside',100));
  await assert.rejects(()=>download(SITE+'unknown.txt',100));
  await assert.rejects(()=>download(OTA_ORIGIN+'latest.json',100,{fetcher:async()=>response('https://evil.invalid/','x')}));
  await assert.rejects(()=>download(OTA_ORIGIN+'latest.json',100,{fetcher:async url=>response(url,'x',200,true)}));
  await assert.rejects(()=>download(OTA_ORIGIN+'latest.json',100,{fetcher:async url=>response(url,'missing',404)}));
  await assert.rejects(()=>download(OTA_ORIGIN+'latest.json',2,{fetcher:async url=>response(url,'large')}));
  await assert.rejects(()=>download(OTA_ORIGIN+'latest.json',100,{fetcher:async url=>response(url,'')}));
});
test('independent run/jobs provenance and listed extra OTA paths fail closed', async () => {
  const {validateRun,checkListing,SITE,OTA_ORIGIN,LEGACY,WORKFLOW_ID}=await retention;
  const run={id:LEGACY.id,head_sha:sha,workflow_id:WORKFLOW_ID,repository:{full_name:'lioracl/travelmate'},head_branch:'preview',path:'.github/workflows/deploy-pages.yml',event:'push',status:'completed',conclusion:'success'};
  const jobs={total_count:1,jobs:[{run_id:run.id,head_sha:sha,name:'deploy',status:'completed',conclusion:'success',steps:[{name:'Deploy to GitHub Pages',status:'completed',conclusion:'success'}]}]};
  validateRun(run,jobs);
  for(const bad of [null,{...run,conclusion:'failure'},{...run,event:'workflow_dispatch'},{...run,head_branch:'main'},{...run,repository:{full_name:'other/repo'}}])assert.throws(()=>validateRun(bad,jobs));
  assert.throws(()=>validateRun(run,{total_count:0,jobs:[]}));
  checkListing(null,OTA_ORIGIN,[]);
  checkListing(Buffer.from('<a href="../">parent</a><a href="latest.json">latest</a>'),OTA_ORIGIN,[SITE,OTA_ORIGIN+'latest.json']);
  assert.throws(()=>checkListing(Buffer.from('<a href="other/bundle.zip">extra</a>'),OTA_ORIGIN,[SITE,OTA_ORIGIN+'latest.json']));
  assert.throws(()=>checkListing(Buffer.from('unknown directory output'),OTA_ORIGIN,[]));
});
test('public API source bytes must match their Git blob identity',async()=>{
  const {contentAt}=await retention,bytes=Buffer.from('fixture source'),blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  const data={path:'assets/about.js',type:'file',encoding:'base64',content:bytes.toString('base64'),sha:blob};
  assert.equal((await contentAt(sha,data.path,async()=>Buffer.from(JSON.stringify(data)))).blob,blob);
  await assert.rejects(()=>contentAt(sha,data.path,async()=>Buffer.from(JSON.stringify({...data,sha:'a'.repeat(40)}))));
});
test('orchestration writes exactly current three files and final rechecks reject concurrent pointer/provenance moves',async()=>{
  const m=await retention,f=signedFixture(m.OTA_ORIGIN),site=fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-current-ota-'));
  const run={id:m.LEGACY.id,head_sha:sha,workflow_id:m.WORKFLOW_ID,repository:{full_name:'lioracl/travelmate'},head_branch:'preview',path:'.github/workflows/deploy-pages.yml',event:'push',status:'completed',conclusion:'success'};
  const jobs={total_count:1,jobs:[{run_id:run.id,head_sha:sha,name:'deploy',status:'completed',conclusion:'success',steps:[{name:'Deploy to GitHub Pages',status:'completed',conclusion:'success'}]}]};
  const build=Buffer.from(JSON.stringify({sha,channel:'preview',version:'2.26.2'}));
  let pointer=f.latest,activeRun=run,liveBuild=build;
  const get=async(url,max,options={})=>{
    if(url.includes('/runs?'))return Buffer.from(JSON.stringify({workflow_runs:[activeRun]}));
    if(url.endsWith('/jobs?per_page=100'))return Buffer.from(JSON.stringify(url.includes('/runs/'+run.id+'/')?jobs:{total_count:1,jobs:[{...jobs.jobs[0],run_id:activeRun.id,head_sha:activeRun.head_sha}]}));
    if(url===m.API+'actions/runs/'+m.LEGACY.id)return Buffer.from(JSON.stringify(run));
    if(url===m.SITE+'build-info.json')return liveBuild;
    if(url===m.OTA_ORIGIN+'latest.json')return pointer;
    if(url===m.OTA_ORIGIN+sha+'/manifest.json')return f.latest;
    if(url===m.OTA_ORIGIN+sha+'/bundle.zip')return f.bundle;
    if(options.optional404)return null;
    throw Error('Unexpected fixture request '+url);
  };
  const readSource=async(commit,relative)=>{
    if(commit==='c'.repeat(40) && relative==='.github/workflows/deploy-pages.yml')return {bytes:Buffer.from('local workflow')};
    if(commit==='c'.repeat(40) && relative==='tools/retain-preview-ota.mjs')return {bytes:Buffer.from('local tool')};
    if(relative==='.github/workflows/deploy-pages.yml')return {blob:m.LEGACY.workflowBlob,bytes:Buffer.from('verified source fixture')};
    if(relative==='ota-overlay.json')return {bytes:Buffer.from(JSON.stringify({repository:'lioracl/travelmate',sha:m.LEGACY.nativeSha,nativeApiLevel:2}))};
    if(relative==='tools/publish-ota.mjs')return {blob:m.LEGACY.publisherBlob};
    if(relative==='assets/about.js')return {bytes:Buffer.from("version: '2.26.2'")};
    throw Error('Unexpected source fixture');
  };
  const evidence=await m.retainCurrent({site,publicKey:f.publicKey,localWorkflow:Buffer.from('local workflow'),localTool:Buffer.from('local tool'),get,readSource,expectedFiles:f.expectedFiles});
  fs.writeFileSync(site+'.ota-retention-evidence.json',JSON.stringify(evidence));
  assert.deepEqual(fs.readdirSync(path.join(site,'ota')).sort(),[sha,'latest.json'].sort());
  for(const [relative,bytes] of [['latest.json',f.latest],[sha+'/manifest.json',f.latest],[sha+'/bundle.zip',f.bundle]])assert.deepEqual(fs.readFileSync(path.join(site,'ota',relative)),bytes);
  await m.recheckCurrent(site,get);
  pointer=Buffer.from('concurrent pointer');await assert.rejects(()=>m.recheckCurrent(site,get));pointer=f.latest;
  activeRun={...run,id:run.id+1};await assert.rejects(()=>m.recheckCurrent(site,get));activeRun=run;
  activeRun={...run,id:run.id+1,head_sha:'c'.repeat(40)};
  liveBuild=Buffer.from(JSON.stringify({sha:activeRun.head_sha,channel:'preview',version:'2.26.2'}));
  const nextSite=fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-next-preview-'));
  const next=await m.retainCurrent({site:nextSite,publicKey:f.publicKey,localWorkflow:Buffer.from('local workflow'),localTool:Buffer.from('local tool'),get,readSource,expectedFiles:f.expectedFiles});
  assert.equal(next.sourceDeploymentSha,activeRun.head_sha);
  assert.deepEqual(fs.readFileSync(path.join(nextSite,'ota/latest.json')),f.latest);
  await assert.rejects(()=>m.retainCurrent({site:fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-unknown-recipe-')),publicKey:f.publicKey,localWorkflow:Buffer.from('unknown workflow'),localTool:Buffer.from('local tool'),get,readSource,expectedFiles:f.expectedFiles}));
  await assert.rejects(()=>m.retainCurrent({site:fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-no-evidence-')),publicKey:f.publicKey,get:async()=>{throw Error('Absent live evidence');}}));
});
test('workflow boundaries prohibit auto OTA and broadened permissions; final state rechecks are adjacent to publication',()=>{
  const pages=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8'),apk=fs.readFileSync('.github/workflows/android-exact-preview-apk.yml','utf8');
  assert.doesNotMatch(pages,/publish-ota\.mjs|stage-native-web\.mjs|OTA_PRIVATE_KEY|RETENTION_SHA256|retention\.json/);
  assert.match(pages,/retain-preview-ota\.mjs --recheck _site/);
  assert(pages.indexOf('immediately before Pages publication')<pages.indexOf('id: deployment'));
  assert.doesNotMatch(apk,/^\s+(?:push|pull_request|workflow_run|workflow_call|schedule):/m);
  assert.doesNotMatch(apk,/publish-ota|OTA_PRIVATE_KEY|deploy-pages@|gh workflow|adb |contents: write|actions: write|pages: write/);
  assert.match(apk,/if: github.ref == 'refs\/heads\/preview'/);
  assert.match(apk,/ref: \$\{\{ inputs.web_sha \}\}/);
  assert.match(apk,/requireCompatibleDistribution/);
  assert.match(apk,/preview-build-info-final\.json/);
  for(const marker of ['test_android_signing.py','testDebugUnitTest','assembleDebug',':app:check','apksigner" verify','verify-android-signing.py','verify-android-apk.py','sha256sum','provenance.json'])assert(apk.includes(marker),marker);
  assert.doesNotMatch(apk,/run:.*\$\{\{ inputs\./);
  const jobEnvironment=apk.slice(apk.indexOf('    env:'),apk.indexOf('    steps:'));
  assert.doesNotMatch(jobEnvironment,/secrets\./);
  assert(apk.indexOf('echo "TRAVELMATE_QA_KEYSTORE=$KEYFILE"')<apk.indexOf('base64 --decode'));
  assert.match(apk,/trap 'rm -f -- "\$KEYFILE"' ERR/);
});
test('APK verifier retains resource/origin/widget checks and only permits two empty Capacitor files',()=>{
  const py=fs.readFileSync('tools/verify-android-apk.py','utf8');
  for(const marker of ['png_pixels','mipmap-anydpi-v26','travelmate_widget_info.xml','travelmate_live_today_widget_info.xml','localhost','stableQaCertificateVerified','nativeVersionCode','webVersion','set(staged).union(generated)','Nonempty generated Capacitor file','Duplicate APK entries','Private data or credentials in APK'])assert(py.includes(marker),marker);
  assert.doesNotMatch(py,/'2\.21\.1'|nativeApiLevel'\] == 1/);
});
test('actual Python APK verifier rejects SHA, version, API, certificate, extra files and byte drift', () => {
  const cp=require('node:child_process'),os=require('node:os'),path=require('node:path');
  const python=process.env.TRAVELMATE_TEST_PYTHON || 'python3';
  const probe=cp.spawnSync(python,['--version'],{encoding:'utf8'});
  assert.equal(probe.status,0,'Set TRAVELMATE_TEST_PYTHON to an available Python; verifier regression must execute');
  const target=fs.mkdtempSync(path.join(os.tmpdir(),'travelmate-pipeline-verifier-'));
  const verifier=path.resolve('tools/verify-android-apk.py');
  const script=String.raw`import json,pathlib,zipfile,sys,subprocess
root=pathlib.Path(sys.argv[1]); verifier=sys.argv[2]
wrapper=root/'wrapper'; (wrapper/'tools').mkdir(parents=True)
(wrapper/'tools/apk_png.py').write_text('def png_pixels(data): return data\n')
dist=wrapper/'dist'; dist.mkdir()
sha='e8513167165b0363a497199e83e176c868173923'
info={'sha':sha,'version':'3.0.0','nativeApiLevel':2}
contract={'webSha':sha,'webVersion':'3.0.0','nativeApiLevel':2,'nativeVersion':'2.26.1','nativeVersionCode':22601,'certificateSha256':'a'*64}
config={'appId':'com.travelmate.app','plugins':{'LiveUpdate':{'autoUpdateStrategy':'none','autoDeleteBundles':False}}}
(wrapper/'capacitor.config.json').write_text(json.dumps(config))
files=['index.html','sw.js','assets/security-center.js','assets/cloud-sync.js','assets/security-center.css','assets/weather-widget.js','assets/weather-widget.css','assets/phone-visual-qa.css','assets/native-widget-snapshot.js','trip/custom/index.html','manifest.webmanifest','assets/native-live-update.js']
for name in files:
 p=dist/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'fixture source')
(dist/'build-info.json').write_text(json.dumps(info))
(wrapper/'assets').mkdir();(wrapper/'assets/native-live-update.js').write_bytes(b'fixture source')
resources={}
for density in ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']:
 for icon in ['ic_launcher.png','ic_launcher_round.png','ic_launcher_foreground.png','ic_launcher_background.png']:
  rel='mipmap-'+density+'/'+icon
  p=wrapper/'android/app/src/main/res'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'fixture icon')
  resources['res/'+rel]=b'fixture icon'
for name in ['ic_launcher.xml','ic_launcher_round.xml']: resources['res/mipmap-anydpi-v26/'+name]=b'fixture adaptive'
for name in ['travelmate_widget_info.xml','travelmate_live_today_widget_info.xml']: resources['res/xml/'+name]=b'fixture provider'
(root/'contract.json').write_text(json.dumps(contract))
(root/'badging.txt').write_text("package: name='com.travelmate.app' versionCode='22601' versionName='2.26.1'\nsdkVersion:'26'\ntargetSdkVersion:'36'\n")
cert={'certificateSha256':'a'*64,'stableQaCertificateVerified':True}
def run(change=None):
 packaged={'assets/public/'+p.relative_to(dist).as_posix():p.read_bytes() for p in dist.rglob('*') if p.is_file()}
 packaged['assets/capacitor.config.json']=json.dumps(config).encode()
 packaged['assets/public/cordova.js']=b''
 packaged['assets/public/cordova_plugins.js']=b''
 packaged.update(resources)
 c=dict(cert)
 if change: change(packaged,c)
 (root/'cert.json').write_text(json.dumps(c))
 apk=root/'fixture.apk'
 with zipfile.ZipFile(apk,'w') as z:
  for name,value in packaged.items(): z.writestr(name,value)
 result=subprocess.run([sys.executable,verifier,str(apk),str(wrapper),str(root/'contract.json'),str(root/'badging.txt'),str(root/'cert.json'),str(root/'report.json')],capture_output=True,text=True)
 return result
result=run()
assert result.returncode==0,result.stderr
for key,value in [('sha','b'*40),('version','2.21.1'),('nativeApiLevel',1)]:
 def mutate(p,c):
  b=dict(info);b[key]=value;p['assets/public/build-info.json']=json.dumps(b).encode()
 assert run(mutate).returncode!=0,key
for mutate in [
 lambda p,c:c.update(certificateSha256='b'*64),
 lambda p,c:c.update(stableQaCertificateVerified=False),
 lambda p,c:p.update({'assets/public/extra.txt':b'extra'}),
 lambda p,c:p.pop('assets/public/index.html'),
 lambda p,c:p.pop('assets/public/cordova.js'),
 lambda p,c:p.pop('assets/public/cordova_plugins.js'),
 lambda p,c:p.update({'assets/public/cordova.js':b'nonempty'}),
 lambda p,c:p.update({'assets/public/cordova_plugins.js':b'nonempty'}),
 lambda p,c:p.update({'assets/public/assets/cloud-sync.js':b'tampered'}),
 lambda p,c:p.update({'assets/private/user.db':b'private'}),
 lambda p,c:p.update({'assets/capacitor.config.json':json.dumps(dict(config,server={'url':'https://example.invalid'})).encode()})
]:
 assert run(mutate).returncode!=0,'Expected actual verifier rejection'
(root/'badging.txt').write_text("package: name='com.travelmate.app' versionCode='22101' versionName='2.21.1'\nsdkVersion:'26'\ntargetSdkVersion:'36'\n")
assert run().returncode!=0,'Old native version accepted'
print('PASS actual Python verifier: fixture success and 15 rejection cases')
`;
  const code=script;
  const result=cp.spawnSync(python,['-c',code,target,verifier],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
