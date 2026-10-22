'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(process.env.TM_PILOT_SOURCE || path.join(__dirname,'..'),'assets/app-shell.js'),'utf8');
class Node {
  constructor(tag, attrs = {}) { this.tagName=tag.toUpperCase(); this.children=[]; this.parentNode=null; this.attrs={}; this.listeners={}; this.hidden=false; this.inert=false; this.textContent=''; this.style={setProperty(){}}; this.dataset=new Proxy({}, {set:(o,k,v)=>{o[k]=String(v);this.attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v);return true;}}); for(const [k,v] of Object.entries(attrs)) this.setAttribute(k,v); }
  get className(){return this.attrs.class||'';} set className(v){this.attrs.class=v;}
  get classList(){const n=this;return {contains(c){return n.className.split(/\s+/).includes(c);},add(c){if(!this.contains(c)) n.className=(n.className+' '+c).trim();},remove(c){n.className=n.className.split(/\s+/).filter(x=>x!==c).join(' ');}};}
  get ownerDocument(){let n=this;while(n.parentNode)n=n.parentNode;return n.document||null;}
  getClientRects(){for(let n=this;n;n=n.parentNode)if(n.hidden||n.noLayout)return [];return this.isConnected?[{}]:[];}
  get firstChild(){return this.children[0]||null;} get parentElement(){return this.parentNode;}
  get isConnected(){let p=this;while(p.parentNode)p=p.parentNode;return p.tagName==='HTML';}
  setAttribute(k,v){this.attrs[k]=String(v); if(k==='id')this.id=String(v); if(k.startsWith('data-')){const p=k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());this.dataset[p]=v;}}
  getAttribute(k){return this.attrs[k]??null;} removeAttribute(k){delete this.attrs[k];}
  appendChild(n){if(n.parentNode)n.remove();this.children.push(n);n.parentNode=this;return n;}
  append(...nodes){nodes.forEach(n=>this.appendChild(n));}
  insertBefore(n,ref){if(n===ref)return n;if(n.parentNode)n.remove();const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this;return n;}
  replaceChild(n,old){this.insertBefore(n,old);old.remove();return old;}
  remove(){if(this.parentNode){const doc=this.ownerDocument;if(doc&&this.contains(doc.activeElement))doc.activeElement=doc.body;const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}
  contains(n){while(n){if(n===this)return true;n=n.parentNode;}return false;}
  matches(s){s=s.trim();if(s==='*')return true;if(s.startsWith('#'))return this.id===s.slice(1);const attr=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);if(s.startsWith('.'))return this.classList.contains(s.slice(1));return this.tagName.toLowerCase()===s.toLowerCase();}
  closest(s){let n=this;while(n){if(s.split(',').some(x=>n.matches(x)))return n;n=n.parentNode;}return null;}
  querySelectorAll(s){const out=[];const direct=s.startsWith(':scope > ');if(direct)s=s.slice(9);const selectors=s.split(',');function visit(n){for(const c of n.children){if(selectors.some(v=>c.matches(v)))out.push(c);if(!direct)visit(c);}}visit(this);return out;}
  querySelector(s){if(s.includes(' ' )&&!s.startsWith(':scope > ')){const [parent,...rest]=s.split(' ');const p=this.querySelector(parent);return p&&p.querySelector(rest.join(' '));}return this.querySelectorAll(s)[0]||null;}
  addEventListener(k,fn){(this.listeners[k]||=new Set()).add(fn);}
  removeEventListener(k,fn){this.listeners[k]?.delete(fn);}
  dispatch(k,event={}){for(const fn of [...(this.listeners[k]||[])])fn({type:k,target:this,...event});}
  click(){this.dispatch('click');} focus(){const doc=this.ownerDocument;if(!doc||!this.getClientRects().length)return;for(let n=this;n;n=n.parentNode)if(n.inert)return;doc.activeElement=this;this.focusCalls=(this.focusCalls||0)+1;}
}
function setup(query='?v12pilot=profile',home=true,{readyState='loading',loaderPresent=true}={}) {
  const html=new Node('html'),body=new Node('body',{class:home?'home-page is-authenticated':''});html.appendChild(body);
  const document=new Node('document');document.body=body;document.documentElement=html;document.readyState=readyState;html.document=document;document.activeElement=body;
  document.querySelector=s=>html.querySelector(s);document.querySelectorAll=s=>html.querySelectorAll(s);document.getElementById=id=>html.querySelector('#'+id);
  document.createElement=t=>new Node(t);document.createComment=()=>new Node('#comment');
  function add(p,t,a={}){const n=new Node(t,a);p.appendChild(n);return n;}
  const main=add(body,'main',{id:'main-content'});const launcher=add(main,'button',{'data-cloud-account-open':''});
  const settingsLauncher=add(main,'button',{'data-security-open':''});
  const backdrop=add(body,'section',{'data-cloud-account-backdrop':''});backdrop.hidden=true;
  const panel=add(backdrop,'div',{'data-cloud-account':''});const close=add(panel,'button',{'data-cloud-account-close':''});
  const session=add(panel,'section',{'data-cloud-session':''});const host=add(session,'section',{'data-smart-profile':''});
  const head=add(host,'div',{class:'cloud-smart-profile-head'});add(head,'span',{'data-user-avatar':''});add(head,'strong',{'data-smart-profile-name':''}).textContent='Synthetic A';
  add(host,'section',{class:'cloud-declared-preferences'});add(host,'section',{'data-learned-profile-host':''});add(host,'p',{class:'cloud-profile-privacy'});
  const actions=add(host,'div',{class:'cloud-avatar-actions'});const edit=add(actions,'button',{'data-profile-wizard-open':''});edit.value='draft-preserved';
  add(host,'small',{'data-cloud-avatar-status':''});
  const sb=add(body,'section',{'data-security-dialog':''});sb.hidden=true;const sp=add(sb,'div',{class:'security-center'});
  const sh=add(sp,'header');const sc=add(sh,'button',{'data-security-close':''});add(sp,'section',{'data-settings-voice':''});
  const pref=add(sp,'section',{class:'security-preferences'});const input=add(pref,'input',{'data-existing-choice':''});input.value='original';
  for(const c of ['security-profile','settings-section-title','security-status','security-mfa','security-actions'])add(sp,'section',{class:c,['data-'+c]:''});
  add(sp,'footer');
  let openCalls=0, settingsCalls=0, resolve; const loading=new Promise(r=>resolve=r);
  launcher.addEventListener('click',()=>{openCalls++;backdrop.hidden=false;}); close.addEventListener('click',()=>{backdrop.hidden=true;});
  settingsLauncher.addEventListener('click',()=>{settingsCalls++;sb.hidden=false;});sc.addEventListener('click',()=>{sb.hidden=true;});
  const window=new Node('window');let loads=0;const loader={ensureAccount:()=>{loads++;return loading;}};if(loaderPresent)window.TravelMateFeatures=loader;window.TravelMateCloud={getCachedTrips:()=>[]};window.setTimeout=()=>0;window.addEventListener=window.addEventListener.bind(window);
  const observers=[];class Observer{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  window.MutationObserver=Observer;
  const context={window,document,location:{search:query,href:'https://synthetic.invalid/index.html'+query},URL,URLSearchParams,MutationObserver:Observer,console,setTimeout:()=>0,innerHeight:900,getComputedStyle:n=>({visibility:n.visibility||'visible',getPropertyValue:()=>''})};
  vm.runInNewContext(source,context);
  return {window,document,body,host,panel,backdrop,main,launcher,close,sb,sp,sc,settingsLauncher,input,edit,observers,resolve,loads:()=>loads,installLoader:()=>{window.TravelMateFeatures=loader;},opened:()=>openCalls,settingsOpened:()=>settingsCalls,pilot:()=>window.TravelMateAppShell.pilot,start:()=>document.dispatch('DOMContentLoaded')};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('default-off and trip context do not install pilot or load account',()=>{for(const [q,h] of [['',true],['?v12pilot=unknown',true],['?v12pilot=profile',false]]){const x=setup(q,h);assert.equal(x.pilot(),undefined);assert.equal(x.body.querySelectorAll('[data-v12-pilot]').length,0);}});
test('profile uses the existing nodes; repeat sync is idempotent and close restores original order/value',async()=>{
 const x=setup(), original=x.host.children.slice();x.start();x.resolve(true);await settle();x.pilot().sync();
 assert.equal(x.pilot().snapshot().active,'profile');assert.equal(x.panel.querySelectorAll('[data-pilot-dock]').length,1);
 assert.equal(x.panel.querySelector('[data-profile-wizard-open]'),x.edit);assert.equal(x.main.inert,true);
 const total=x.host.children.length;x.pilot().sync();assert.equal(x.host.children.length,total);
 x.close.click();x.pilot().sync();assert.deepEqual(x.host.children,original);assert.equal(x.edit.value,'draft-preserved');assert.equal(x.main.inert,false);assert.equal(x.panel.getAttribute('data-v12-pilot'),null);
});
test('settings has exactly six semantic groups and retains actual form controls and listeners',async()=>{
 const x=setup('?v12pilot=settings');let changes=0;x.input.addEventListener('change',()=>changes++);
 const original=x.sp.children.slice();x.start();x.resolve(true);await settle();x.pilot().sync();
 const cards=x.sp.querySelector('.tm121-settings-cards');assert.equal(cards.children.filter(n=>n.classList.contains('tm121-card')).length,6);
 assert.equal(x.sp.querySelector('[data-existing-choice]'),x.input);x.input.value='edited';x.input.dispatch('change');assert.equal(changes,1);
 x.sc.click();x.pilot().sync();assert.deepEqual(x.sp.children,original);assert.equal(x.input.value,'edited');
});
test('account ABA invalidates pending initial activation without disabling later explicit entry',async()=>{
 const x=setup();x.start();x.window.dispatch('travelmate:home-auth');x.window.dispatch('travelmate:home-auth');x.resolve(true);await settle();
 assert.equal(x.opened(),0);assert.equal(x.pilot().snapshot().epoch,2);
 x.launcher.click();x.pilot().sync();assert.equal(x.pilot().snapshot().active,'profile');
});
test('signed-out auth form is never replaced with profile',async()=>{
 const x=setup();x.body.classList.remove('is-authenticated');x.start();x.resolve(true);await settle();x.pilot().sync();
 assert.equal(x.pilot().snapshot().active,null);assert.equal(x.panel.getAttribute('data-v12-pilot'),null);
});
test('logout synchronously removes adapted content and closes through original owner',async()=>{
 const x=setup();x.start();x.resolve(true);await settle();x.pilot().sync();x.window.dispatch('travelmate:account-context-changed');
 assert.equal(x.backdrop.hidden,true);assert.equal(x.pilot().snapshot().active,null);assert.equal(x.panel.querySelectorAll('[data-pilot-dock]').length,0);
});
test('page disposal fences pending work, disconnects observer and preserves pre-existing inert state',async()=>{
 const x=setup();x.main.inert=true;x.start();x.resolve(true);await settle();x.pilot().sync();x.pilot().dispose();x.pilot().dispose();
 assert.equal(x.main.inert,true);assert.equal(x.observers.every(o=>o.disconnected),true);assert.equal(x.window.listeners['travelmate:home-auth'].size,1); // original AppShell remains; pilot listener removed
 const y=setup();y.start();y.pilot().dispose();y.resolve(true);await settle();assert.equal(y.opened(),0);
});
test('loader rejection does not activate or fake ready state',async()=>{
 const x=setup();x.window.TravelMateFeatures.ensureAccount=()=>Promise.reject(new Error('synthetic offline'));x.start();await settle();assert.equal(x.opened(),0);assert.equal(x.pilot().snapshot().pending,false);
});
test('owner close click and Escape release inert before the canonical focus handler runs',async()=>{
 for(const kind of ['click','keydown']) {
  const x=setup();x.start();x.resolve(true);await settle();x.pilot().sync();assert.equal(x.main.inert,true);
  x.document.dispatch(kind,{target:x.close,key:kind==='keydown'?'Escape':undefined});
  assert.equal(x.main.inert,false,'presentation must release background before owner focus');
  assert.equal(x.pilot().snapshot().active,null);assert.equal(x.backdrop.hidden,false,'owner still owns close');
  x.close.click();assert.equal(x.backdrop.hidden,true);
 }
});
test('profile cache failure is explicit and introduces neither synthetic counts nor writes',async()=>{
 const x=setup();x.window.TravelMateCloud.getCachedTrips=()=>{throw new Error('synthetic read unavailable');};
 x.start();x.resolve(true);await settle();x.pilot().sync();
 assert.equal(x.pilot().snapshot().active,'profile');
 assert.equal(x.panel.querySelector('[data-pilot-gap="profile-trips-empty"]').textContent,'לא ניתן לקרוא את רשימת הטיולים כעת.');
 assert.equal(x.panel.querySelectorAll('.tm121-metric').every(n=>n.querySelector('strong').textContent==='—'),true);
});
test('profile reads only the owner cache and bounds recent trip text to three canonical records',async()=>{
 const x=setup();let reads=0;x.window.TravelMateCloud.getCachedTrips=()=>{reads++;return [1,4,2,3].map(n=>({id:String(n),city:'Synthetic '+n,start:'2026-10-0'+n,end:'2026-10-09'}));};
 x.start();x.resolve(true);await settle();x.pilot().sync();x.pilot().sync();
 assert.equal(reads,1);assert.deepEqual(x.panel.querySelectorAll('.tm121-recent-trip').map(n=>n.querySelector('strong').textContent),['Synthetic 4','Synthetic 3','Synthetic 2']);
 x.window.dispatch('travelmate:home-auth');assert.equal(x.panel.querySelectorAll('.tm121-recent-trip').length,0);
});
test('persisted pagehide closes old presentation but retains one adapter for fresh activation',async()=>{
 const x=setup();x.start();x.resolve(true);await settle();x.pilot().sync();const observers=x.observers.length;
 x.window.dispatch('pagehide',{persisted:true});assert.equal(x.backdrop.hidden,true);assert.equal(x.main.inert,false);assert.equal(x.pilot().snapshot().enabled,true);
 x.launcher.click();x.pilot().sync();assert.equal(x.pilot().snapshot().active,'profile');assert.equal(x.observers.length,observers);
 x.window.dispatch('pagehide',{persisted:false});assert.equal(x.pilot().snapshot().enabled,false);
});
test('existing child editor suspends presentation without hiding its canonical parent or corrupting inert restoration',async()=>{
 const x=setup();x.start();x.resolve(true);await settle();x.pilot().sync();
 x.edit.focus();
 x.document.dispatch('click',{target:x.edit});
 assert.equal(x.document.activeElement,x.edit,'presentation teardown must preserve the child opener before its owner runs');
 assert.equal(x.backdrop.hidden,false,'existing child owner needs visible parent for return focus');
 assert.equal(x.pilot().snapshot().active,null);assert.equal(x.main.inert,false);
 const child=new Node('div',{class:'profile-wizard-backdrop'});x.body.appendChild(child);
 const originals=x.body.children.filter(n=>n!==child).map(n=>[n,n.inert]);originals.forEach(([n])=>n.inert=true);
 x.pilot().sync();assert.equal(x.pilot().snapshot().active,null,'do not redecorate while child owns inert');
 child.hidden=true;originals.forEach(([n,value])=>n.inert=value);x.edit.focus();x.pilot().sync();
 assert.equal(x.pilot().snapshot().active,'profile');assert.equal(x.backdrop.inert,false);assert.equal(x.main.inert,true);assert.equal(x.document.activeElement,x.edit,'redecoration must retain the canonical child return focus');
 x.close.click();x.pilot().sync();assert.equal(x.main.inert,false);
});
test('focus fixture drops focus when a focused ancestor is removed',()=>{
 const x=setup();x.backdrop.hidden=false;x.edit.focus();assert.equal(x.document.activeElement,x.edit);
 const actions=x.edit.parentNode;actions.remove();assert.equal(x.document.activeElement,x.body);
 x.host.appendChild(actions);assert.equal(x.document.activeElement,x.body,'reattachment alone does not restore browser focus');
});
test('presentation does not focus hidden, inert, disconnected or newly superseded controls',()=>{
 for(const change of ['hidden','inert','disconnected','new-focus','new-account','new-owner','visibility','no-layout']) {
  const x=setup();x.backdrop.hidden=false;x.edit.focus();const actions=x.edit.parentNode;
  const append=x.host.appendChild.bind(x.host);let intercepted=false;
  x.host.appendChild=node=>{
   const result=append(node);
   if(node===actions&&!intercepted){intercepted=true;
    if(change==='hidden')actions.hidden=true;
    if(change==='inert')actions.inert=true;
    if(change==='disconnected')actions.remove();
    if(change==='new-focus')x.close.focus();
    if(change==='new-account')x.window.dispatch('travelmate:account-context-changed');
    if(change==='new-owner'){x.backdrop.hidden=true;x.sb.hidden=false;x.pilot().sync();}
    if(change==='visibility')x.edit.visibility='hidden';
    if(change==='no-layout')actions.noLayout=true;
   }
   return result;
  };
  const calls=x.edit.focusCalls;x.pilot().sync();
  assert.notEqual(x.document.activeElement,x.edit,change);
  assert.equal(x.edit.focusCalls,calls,'must not even attempt stale/ineligible focus: '+change);
  if(change==='new-focus')assert.equal(x.document.activeElement,x.close);
 }
});
test('presentation preserves eligible settings control focus and does not steal external focus',()=>{
 const x=setup('?v12pilot=settings');x.sb.hidden=false;x.input.focus();x.pilot().sync();
 assert.equal(x.document.activeElement,x.input);
 x.document.dispatch('click',{target:x.sc});assert.equal(x.document.activeElement,x.input);
 const y=setup();y.backdrop.hidden=false;y.launcher.focus();y.pilot().sync();assert.equal(y.document.activeElement,y.launcher);
});
test('shared shell source remains free of new persistence, history writes, provider activation and screenshot UI',()=>{
 const pilot=source.slice(source.indexOf('/* V12.1 opt-in'));
 assert.doesNotMatch(pilot,/localStorage\.setItem|sessionStorage\.setItem|history\.(pushState|replaceState)|getUserMedia|geolocation|\.upload\(|\.speak\(|\.cloneNode\(|innerHTML/);
 assert.match(pilot,/getCachedTrips/);assert.match(pilot,/ticket !== epoch/);assert.match(pilot,/removeEventListener/);
});

test('deferred shell waits for the subsequent app loader before cold account activation',async()=>{
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(index,/<script src="assets\/app-shell\.js[^"]*" defer><\/script><script src="assets\/app\.js[^"]*" defer>/);
 const x=setup('?v12pilot=profile',true,{readyState:'interactive',loaderPresent:false});
 await settle();assert.equal(x.loads(),0);assert.equal(x.opened(),0);
 x.installLoader();x.start();assert.equal(x.loads(),1,'DOMContentLoaded must start the now-present actual loader');
 assert.equal(x.pilot().snapshot().pending,true);assert.equal(x.opened(),0);
 x.resolve(true);await settle();assert.equal(x.opened(),1);assert.equal(x.pilot().snapshot().active,'profile');
});

test('deferred startup retains account ABA fencing while its loader is pending',async()=>{
 const x=setup('?v12pilot=profile',true,{readyState:'interactive',loaderPresent:false});
 await settle();x.installLoader();x.start();assert.equal(x.loads(),1);
 x.window.dispatch('travelmate:home-auth');x.window.dispatch('travelmate:home-auth');
 x.resolve(true);await settle();assert.equal(x.pilot().snapshot().pending,false);assert.equal(x.opened(),0);
 assert.equal(x.pilot().snapshot().epoch,2);x.launcher.click();x.pilot().sync();assert.equal(x.pilot().snapshot().active,'profile');
});

test('late complete-document startup works and disposal removes the deferred startup listener',async()=>{
 const x=setup('?v12pilot=settings',true,{readyState:'complete'});
 assert.equal(x.loads(),1);x.resolve(true);await settle();assert.equal(x.settingsOpened(),1);
 const y=setup('?v12pilot=profile',true,{readyState:'interactive',loaderPresent:false});
 y.pilot().dispose();y.installLoader();y.start();y.resolve(true);await settle();assert.equal(y.loads(),0);assert.equal(y.opened(),0);
});

// Execute the real E2E helper against the full AppShell fixture. The existing Home
// async open handler is loaded verbatim; locator/transport/mutation delivery are
// deterministic synthetic boundaries, not a claim of browser actionability.
async function profileEntryHarness({aba=false,warm=false,stuck=false}={}) {
 const x=setup();x.start();
 const home=fs.readFileSync(path.join(__dirname,'../assets/home.js'),'utf8');
 const handler=home.slice(home.indexOf('  async function openAccountModal(event) {'),home.indexOf('  function closeAccountModal() {'));
 assert.match(handler,/await window\.TravelMateFeatures\.ensureAccount\(\)/);
 const owner={window:x.window,document:x.document,accountPanel:x.panel,accountBackdrop:x.backdrop,lastAccountOpenButton:null,console};
 vm.runInNewContext(handler,owner);
 x.launcher.listeners.click.clear();
 x.launcher.addEventListener('click',()=>{void owner.openAccountModal({currentTarget:x.launcher});});
 if(aba){x.window.dispatch('travelmate:home-auth');x.window.dispatch('travelmate:home-auth');}
 let completed=false,clicks=0,visibilityReads=0,pendingReads=0;
 const finish=()=>{if(!completed&&!stuck){completed=true;x.resolve(true);}};
 const deliver=async()=>{await settle();await settle();x.pilot().sync();};
 if(warm){finish();await deliver();x.close.click();x.pilot().sync();assert.equal(x.backdrop.hidden,true);}
 const page={
  async evaluate(fn){
   const value=vm.runInNewContext('('+fn.toString()+')()',{TravelMateFeatures:x.window.TravelMateFeatures,TravelMateAppShell:x.window.TravelMateAppShell});
   if(fn.toString().includes('snapshot()')){pendingReads++;finish();}
   await deliver();return value;
  },
  locator(selector){return {
   selector,
   async isVisible(){visibilityReads++;const visible=!x.backdrop.hidden;finish();await deliver();return visible;},
   async click(){
    clicks++;
    if(!x.backdrop.hidden)throw new Error('PROFILE_OVERLAY_INTERCEPTS_LAUNCHER');
    if(x.pilot().snapshot().pending)throw new Error('LAUNCHER_ACTIVATED_BEFORE_STARTUP_SETTLED');
    await owner.openAccountModal({currentTarget:x.launcher});await deliver();
   }
  };}
 };
 function expect(value){return {
  async toHaveClass(pattern){assert.match(x.body.className,pattern);},
  async toBeVisible(){await deliver();assert.equal(value.selector,'[data-v12-pilot="profile"]');assert.equal(x.pilot().snapshot().active,'profile');}
 };}
 expect.poll=fn=>({async toBe(expected){for(let step=0;step<8;step++){if(await fn()===expected)return;await deliver();}throw new Error('SYNTHETIC_EXPECT_POLL_UNSATISFIED');}});
 const register=()=>{};register.use=()=>{};register.describe={configure:()=>{}};
 const file=path.join(process.env.TM_PILOT_HELPER_SOURCE||path.join(__dirname,'..'),'tests/e2e/profile-settings-pilot.spec.js');
 const context={require:name=>name==='@playwright/test'?{test:register,expect}:require(name),__dirname:path.dirname(file),console};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 return {run:()=>context.openProfile(page),state:()=>({clicks,visibilityReads,pendingReads,active:x.pilot().snapshot().active,epoch:x.pilot().snapshot().epoch})};
}

test('browser entry helper waits for automatic Profile before deciding whether to click the launcher',async()=>{
 const h=await profileEntryHarness();await h.run();
 assert.equal(h.state().clicks,0);assert.equal(h.state().active,'profile');assert.ok(h.state().pendingReads>0);
});

test('browser entry helper retains normal explicit entry after ABA cancellation and warm close',async()=>{
 for(const options of [{aba:true},{warm:true}]){
  const h=await profileEntryHarness(options);await h.run();assert.equal(h.state().clicks,1);assert.equal(h.state().active,'profile');
  if(options.aba)assert.equal(h.state().epoch,2);
 }
});

test('browser entry helper does not click through a loader that has not settled',async()=>{
 const h=await profileEntryHarness({stuck:true});await assert.rejects(h.run());
 assert.equal(h.state().clicks,0);assert.equal(h.state().visibilityReads,0);assert.equal(h.state().active,null);
});
