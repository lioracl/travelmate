const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function cloudHarness() {
  let token = 'single-use'; let resets = 0;
  const calls = [];
  const auth = Object.fromEntries(['signInWithPassword','signUp','resend','resetPasswordForEmail'].map(name => [name, async (...args) => { calls.push({name,args}); return {data:{},error:null}; }]));
  const window = {TRAVELMATE_SUPABASE:{turnstileSiteKey:'configured'}, __travelMateSupabaseClient:{auth}, TravelMateSecurity:{getCaptchaToken:()=>token,resetCaptcha:()=>{token='';resets++;}},addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(fs.readFileSync('assets/cloud-sync.js','utf8'),{window,document:{},localStorage:{getItem:()=>null},setTimeout,clearTimeout,console});
  return {api:window.TravelMateCloud,auth,calls,setToken:t=>{token=t;},resets:()=>resets};
}
for (const method of ['signIn','signUp','resendSignup','resetPassword']) {
  test(method+' fails closed and forwards/reset tokens on success and failure',async()=>{
    const h=cloudHarness(); h.setToken('');
    await assert.rejects(h.api[method]('test@example.invalid','test-value','https://example.invalid'),{code:'CAPTCHA_REQUIRED'});
    assert.equal(h.calls.length,0);
    h.setToken('single-use'); await h.api[method]('test@example.invalid','test-value','https://example.invalid');
    assert.ok(JSON.stringify(h.calls[0].args).includes('single-use')); assert.equal(h.resets(),1);
    await assert.rejects(h.api[method]('test@example.invalid','test-value'),{code:'CAPTCHA_REQUIRED'});
    const sdkName=h.calls[0].name; h.auth[sdkName]=async()=>{throw Error('network');}; h.setToken('next');
    await assert.rejects(h.api[method]('test@example.invalid','test-value'),/network/); assert.equal(h.resets(),2);
  });
}
test('concurrent auth actions cannot replay the same token',async()=>{
  const h=cloudHarness(); let finish;
  h.auth.signInWithPassword=()=>new Promise(resolve=>{finish=resolve;});
  const first=h.api.signIn('test@example.invalid','test'); await Promise.resolve(); await Promise.resolve();
  await assert.rejects(h.api.resendSignup('test@example.invalid','https://example.invalid'),{code:'CAPTCHA_REQUIRED'});
  assert.equal(h.calls.length,0); finish({data:{}}); await first;
});
function captchaHarness() {
  const elements=[]; const scripts=[]; let options; let renders=0;
  function element(tag) {const el={tag,dataset:{},textContent:'',hidden:false,contentWindow:{messages:[],postMessage(data,origin){this.messages.push({data,origin});}},replaceChildren(...children){this.children=children;},setAttribute(){},addEventListener(name,fn){this[name]=fn;},insertAdjacentElement(_,e){elements.push(e);},remove(){scripts.splice(scripts.indexOf(this),1);}}; elements.push(el);return el;}
  const form={querySelector:sel=>sel==='[data-security-captcha]'?elements.find(e=>e.dataset.securityCaptcha!==undefined):null,insertBefore(){}};
  const document={documentElement:{dataset:{theme:"dark"}},querySelector:sel=>sel==='[data-cloud-auth-form]'?form:sel==='script[data-travelmate-turnstile]'?scripts[0]:null,createElement:element,head:{appendChild:e=>scripts.push(e)}};
  const listeners={}; const window={TRAVELMATE_SUPABASE:{turnstileSiteKey:'configured'},crypto:require('node:crypto').webcrypto,addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const source=fs.readFileSync('assets/security-center.js','utf8');
  const context={window,document,captchaToken:'',captchaWidgetId:null,nativeCaptchaReset:null,Uint8Array,setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function setupCaptcha()'),source.indexOf('  function armCaptcha()')),context);
  return {window,listeners,context,elements,scripts,start:()=>context.setupCaptcha(),install:()=>{window.turnstile={render:(_,o)=>{options=o;renders++;return 'widget';},reset(){}};},options:()=>options,renders:()=>renders};
}
test('failed script can be explicitly retried without duplicate widgets',()=>{
  const h=captchaHarness();h.start();assert.equal(h.scripts.length,1);h.scripts[0].onerror();
  const retry=h.elements.find(e=>e.tag==='button');assert.ok(retry,'An accessible retry control is required');assert.equal(retry.hidden,false);
  retry.click();assert.equal(h.scripts.length,1);h.install();h.scripts[0].onload();h.start();assert.equal(h.renders(),1);
});
test('expired and errored challenges clear the token; success clears the error',()=>{
  const h=captchaHarness();h.install();h.start();const o=h.options();
  o.callback('a');assert.equal(h.context.captchaToken,'a');o['expired-callback']();assert.equal(h.context.captchaToken,'');
  o.callback('b');o['error-callback']('110200');assert.equal(h.context.captchaToken,'');
  const status=h.elements.find(e=>e.tag==='p');assert.match(status.textContent,/110200/);o.callback('c');assert.equal(status.textContent,'');
});

test('native challenge rejects forged origins, sources and old frames after reset',()=>{
  const h=captchaHarness();h.window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};h.start();
  const frame=h.elements.find(e=>e.tag==='iframe');const nonce=new URL(frame.src).hash.slice(7);
  const event={origin:'https://lioracl.github.io',source:frame.contentWindow,data:{channel:'travelmate-captcha',nonce,type:'token',value:'valid'}};
  h.listeners.message({...event,origin:'https://evil.invalid'});assert.equal(h.context.captchaToken,'');
  h.listeners.message({...event,source:{}});assert.equal(h.context.captchaToken,'');
  h.listeners.message({...event,data:{...event.data,nonce:'wrong'}});assert.equal(h.context.captchaToken,'');
  h.listeners.message({...event,data:{...event.data,value:'x'.repeat(2049)}});assert.equal(h.context.captchaToken,'');
  h.listeners.message(event);assert.equal(h.context.captchaToken,'valid');
  h.listeners.message({...event,data:{...event.data,type:'expired'}});assert.equal(h.context.captchaToken,'');
  h.context.nativeCaptchaReset();h.listeners.message(event);assert.equal(h.context.captchaToken,'');
  assert.equal(h.scripts.length,0,'native parent must not render localhost Turnstile');
});
test('hosted challenge only initializes for its exact native parent and reports lifecycle',()=>{
  const messages=[],scripts=[];let listener,options;const nonce='a'.repeat(32);
  const parent={postMessage:(data,origin)=>messages.push({data,origin})};
  const window={parent,addEventListener:(_,fn)=>{listener=fn;},turnstile:{render:(_,o)=>{options=o;}}};
  const document={createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}};
  vm.runInNewContext(fs.readFileSync('auth/turnstile.js','utf8'),{window,document,location:{hash:'#nonce='+nonce},URLSearchParams});
  assert.equal(messages[0].origin,'https://localhost');
  const e={source:parent,origin:'https://localhost',data:{channel:'travelmate-captcha',nonce,type:'init',theme:'dark'}};
  listener({...e,origin:'https://evil.invalid'});listener({...e,source:{}});assert.equal(scripts.length,0);
  listener(e);listener(e);assert.equal(scripts.length,1);scripts[0].onload();assert.equal(options.theme,'dark');
  options.callback('single-use');options['expired-callback']();options['error-callback']('110200');
  assert.deepEqual(messages.map(m=>m.data.type),['ready','token','expired','error']);
  assert.ok(messages.every(m=>m.origin==='https://localhost'&&m.data.nonce===nonce));
});
