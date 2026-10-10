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
  function element(tag) {const el={tag,dataset:{},textContent:'',hidden:false,setAttribute(){},addEventListener(name,fn){this[name]=fn;},insertAdjacentElement(_,e){elements.push(e);},remove(){scripts.splice(scripts.indexOf(this),1);}}; elements.push(el);return el;}
  const form={querySelector:sel=>sel==='[data-security-captcha]'?elements.find(e=>e.dataset.securityCaptcha!==undefined):null,insertBefore(){}};
  const document={documentElement:{dataset:{theme:"dark"}},querySelector:sel=>sel==='[data-cloud-auth-form]'?form:sel==='script[data-travelmate-turnstile]'?scripts[0]:null,createElement:element,head:{appendChild:e=>scripts.push(e)}};
  const window={TRAVELMATE_SUPABASE:{turnstileSiteKey:'configured'}};
  const source=fs.readFileSync('assets/security-center.js','utf8');
  const context={window,document,captchaToken:'',captchaWidgetId:null};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function setupCaptcha()'),source.indexOf('  function armCaptcha()')),context);
  return {context,elements,scripts,start:()=>context.setupCaptcha(),install:()=>{window.turnstile={render:(_,o)=>{options=o;renders++;return 'widget';},reset(){}};},options:()=>options,renders:()=>renders};
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
