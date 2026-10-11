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
  const elements=[]; const scripts=[]; let options; let renders=0; const timers=[];
  function element(tag) {const el={tag,dataset:{},textContent:'',hidden:false,contentWindow:{messages:[],postMessage(data,origin){this.messages.push({data,origin});}},replaceChildren(...children){this.children=children;},setAttribute(){},addEventListener(name,fn){this[name]=fn;},insertAdjacentElement(_,e){elements.push(e);},remove(){scripts.splice(scripts.indexOf(this),1);}}; elements.push(el);return el;}
  const form={querySelector:sel=>sel==='[data-security-captcha]'?elements.find(e=>e.dataset.securityCaptcha!==undefined):null,insertBefore(){}};
  const document={documentElement:{dataset:{theme:"dark"}},querySelector:sel=>sel==='[data-cloud-auth-form]'?form:sel==='script[data-travelmate-turnstile]'?scripts[0]:null,createElement:element,head:{appendChild:e=>scripts.push(e)}};
  const listeners={}; const window={TRAVELMATE_SUPABASE:{turnstileSiteKey:'configured'},crypto:require('node:crypto').webcrypto,addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const source=fs.readFileSync('assets/security-center.js','utf8');
  const context={window,document,captchaToken:'',captchaWidgetId:null,nativeCaptchaReset:null,captchaController:null,Uint8Array,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function setupCaptcha()'),source.indexOf('  function armCaptcha()')),context);
  return {window,listeners,context,elements,scripts,timers,start:()=>context.setupCaptcha(),install:()=>{window.turnstile={render:(_,o)=>{options=o;renders++;return 'widget';},reset(){}};},options:()=>options,renders:()=>renders};
}
test('failed script can be explicitly retried without duplicate widgets',()=>{
  const h=captchaHarness();h.start();assert.equal(h.scripts.length,1);h.scripts[0].onerror();
  const retry=h.elements.find(e=>e.tag==='button');assert.ok(retry,'An accessible retry control is required');assert.equal(retry.hidden,false);
  retry.click();assert.equal(h.scripts.length,1);h.install();h.scripts[0].onload();h.start();assert.equal(h.renders(),1);
});
test('expired and errored challenges clear the token; success clears the error',()=>{
  const h=captchaHarness();h.install();h.start();const o=h.options();
  o.callback('a');assert.equal(h.context.captchaToken,'a');o['expired-callback']();assert.equal(h.context.captchaToken,'');
  h.elements.find(e=>e.tag==='button').click();const fresh=h.options();fresh.callback('b');fresh['error-callback']('110200');assert.equal(h.context.captchaToken,'');
  const status=h.elements.find(e=>e.tag==='p');assert.match(status.textContent,/110200/);fresh.callback('c');assert.match(status.textContent,/110200/);h.elements.find(e=>e.tag==='button').click();h.options().callback('c');assert.equal(status.textContent,'');
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
  h.context.captchaController.restart();h.listeners.message(event);assert.equal(h.context.captchaToken,'');
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

for(const terminal of ['error','timeout','close'])test('native rejects late token after '+terminal+' and accepts only fresh retry',()=>{
 const h=captchaHarness();h.window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};h.start();
 const send=(frame,type='token')=>h.listeners.message({origin:'https://lioracl.github.io',source:frame.contentWindow,data:{channel:'travelmate-captcha',nonce:new URL(frame.src).hash.slice(7),type,value:'old'}});
 const old=h.elements.find(e=>e.tag==='iframe');send(old);assert.equal(h.context.captchaToken,'old');
 if(terminal==='error')send(old,'error');else if(terminal==='timeout')h.timers[0]();else h.context.captchaController.pause();
 send(old);assert.equal(h.context.captchaToken,'');
 if(terminal==='close'){h.context.captchaController.restart();send(old);assert.equal(h.context.captchaToken,'');h.context.captchaController.resume();}else h.elements.find(e=>e.tag==='button').click();
 const fresh=h.elements.filter(e=>e.tag==='iframe').at(-1);assert.notEqual(fresh.src,old.src);send(old);assert.equal(h.context.captchaToken,'');send(fresh);assert.equal(h.context.captchaToken,'old');
});

test('web close invalidates old widget callbacks and does not restart while hidden',()=>{
 const h=captchaHarness();h.install();h.start();const old=h.options();old.callback('a');h.context.captchaController.pause();old.callback('late');assert.equal(h.context.captchaToken,'');h.context.captchaController.restart();assert.equal(h.renders(),1);h.context.captchaController.resume();assert.equal(h.renders(),2);old.callback('stale');assert.equal(h.context.captchaToken,'');h.options().callback('fresh');assert.equal(h.context.captchaToken,'fresh');
});
test('account modal close and reopen call the canonical CAPTCHA lifecycle',async()=>{
 const source=fs.readFileSync('assets/home.js','utf8'),calls=[];
 const context={window:{TravelMateSecurity:{pauseCaptcha:()=>calls.push('pause'),resumeCaptcha:()=>calls.push('resume')}},accountBackdrop:{setAttribute(){}},accountPanel:{querySelector:()=>({focus(){}})},document:{body:{classList:{add(){},remove(){}}}},lastAccountOpenButton:null};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function openAccountModal('),source.indexOf('  accountOpenButtons.forEach')),context);
 await context.openAccountModal();context.closeAccountModal();await context.openAccountModal();assert.deepEqual(calls,['resume','pause','resume']);
});
for(const outcome of ['reject','error','success'])test('resend '+outcome+' restores button or preserves success cooldown',async()=>{
 const source=fs.readFileSync('assets/home.js','utf8');const start=source.indexOf("  accountPanel.querySelector('[data-cloud-resend]')"),end=source.indexOf("  accountPanel.querySelector('[data-cloud-signout]')",start);let handler;const timers=[],messages=[];
 const context={accountPanel:{querySelector:()=>({addEventListener:(_,fn)=>{handler=fn;}})},authForm:{elements:{email:{reportValidity:()=>true,value:'qa@example.invalid'}}},cloud:{authRedirectUrl:()=>'',resendSignup:async()=>{if(outcome==='reject')throw Object.assign(Error('captcha'),{code:'CAPTCHA_REQUIRED'});return{error:outcome==='error'?Error('network'):null};}},setMessage:(...args)=>messages.push(args),authMessage:e=>e.message,setTimeout:fn=>timers.push(fn)};
 vm.runInNewContext(source.slice(start,end),context);const button={disabled:false};await handler({currentTarget:button});assert.equal(button.disabled,outcome==='success');assert.equal(timers.length,outcome==='success'?1:0);if(outcome==='success'){timers[0]();assert.equal(button.disabled,false);}else assert.equal(messages.at(-1)[1],true);
});
