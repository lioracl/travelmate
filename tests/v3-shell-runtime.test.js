'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(process.env.TRAVELMATE_SHELL_SOURCE_ROOT||path.join(__dirname,'..'),n),'utf8');
function classes(){const values=new Set();return{add:n=>values.add(n),remove:n=>values.delete(n),contains:n=>values.has(n),toggle(n,on){if(on===undefined)on=!values.has(n);on?values.add(n):values.delete(n);return on;}};}
function style(){const values=new Map();return{setProperty:(k,v)=>values.set(k,v),getPropertyValue:k=>values.get(k)||'',values};}
function control(key){return{dataset:{accentChoice:key},hidden:false,style:style(),classList:classes(),attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},querySelector(){return null;}};}
function theme(saved={}){
 const values=new Map(Object.entries(saved)),buttons=['ocean','plum','pink','sunset','emerald','teal'].map(control),root={dataset:{},style:style()};
 const win={dispatchEvent(){}};
 const doc={body:{dataset:{design:'v3'}},documentElement:root,readyState:'complete',querySelectorAll(q){return q==='[data-accent-choice]'?buttons:[];},addEventListener(){}};
 vm.runInNewContext(read('assets/theme.js'),{window:win,document:doc,localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},CustomEvent:function(n,o){this.type=n;this.detail=o?.detail;}});
 return{api:win.TravelMateTheme,root,values,buttons,doc};
}
function lum(hex){return[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const accents={ocean:'#1877F2',plum:'#7951E8',pink:'#EB4E89',sunset:'#F6A623',emerald:'#18B87B'};
for(const mode of ['light','dark'])for(const [accent,brand]of Object.entries(accents))test(`C1 runtime ${mode}/${accent}: five distinct choices, accessible action and fixed semantics`,()=>{
 const t=theme({'travelmate-theme':mode,'travelmate-accent':accent,'travelmate-surface-theme':'ice-aqua'}),get=k=>t.root.style.getPropertyValue(k);
 assert.equal(get('--tm-brand-primary'),brand);assert.equal(t.root.dataset.accent,accent);
 assert.equal(t.buttons.filter(b=>!b.hidden).length,5);assert.deepEqual(t.buttons.filter(b=>b.attrs['aria-pressed']==='true').map(b=>b.dataset.accentChoice),[accent]);
 assert.ok(contrast(get('--tm-action-primary'),'#FFFFFF')>=4.5,'actual runtime action shade must pass 4.5');
 assert.ok(contrast(get('--tm-family-muted'),get('--tm-family-primary'))>=4.5,'secondary text must pass 4.5');
 assert.equal(get('--tm-family-solid'),mode==='dark'?'#0E2134':'#F3F8FD');assert.equal(get('--tm-family-primary'),mode==='dark'?'#183249':'#FFFFFF');
 const invariant=['--tm-semantic-turquoise','--tm-semantic-mate','--tm-semantic-success','--tm-semantic-orange','--tm-semantic-coral'].map(get);
 assert.deepEqual(invariant,['#14B8C5','#7951E8','#18B87B','#F6A623','#F45D70']);
 for(const other of Object.keys(accents)){t.api.setAccent(other);assert.deepEqual(['--tm-semantic-turquoise','--tm-semantic-mate','--tm-semantic-success','--tm-semantic-orange','--tm-semantic-coral'].map(get),invariant);}
 for(const preset of Object.keys(t.api.surfaceThemes)){t.api.setSurfaceTheme(preset);assert.equal(get('--tm-family-primary'),mode==='dark'?'#183249':'#FFFFFF');assert.equal(t.values.get('travelmate-surface-theme'),preset);}
 assert.equal(get('--tm-canvas-image'),'none');
});
for(const [saved,normalized,selected]of [['forest','emerald','emerald'],['violet','plum','plum'],['coral','sunset','sunset'],['teal','teal','ocean']])test(`saved accent ${saved} preserves compatibility with one visible selection`,()=>{
 const t=theme({'travelmate-accent':saved,'travelmate-surface-theme':'warm-sand'});
 assert.equal(t.api.getAccent(),normalized);assert.equal(t.values.get('travelmate-accent'),normalized);assert.equal(t.values.get('travelmate-surface-theme'),'warm-sand');
 assert.deepEqual(t.buttons.filter(b=>b.attrs['aria-pressed']==='true').map(b=>b.dataset.accentChoice),[selected]);
});
test('default Rome Blue uses a distinct accessible action; theme switches preserve accent preference',()=>{
 const t=theme();assert.equal(t.root.style.getPropertyValue('--tm-brand-primary'),'#1877F2');assert.equal(t.root.style.getPropertyValue('--tm-action-primary'),'#0F64E8');
 t.api.setAccent('pink');t.api.set('dark');assert.equal(t.api.getAccent(),'pink');assert.equal(t.root.style.getPropertyValue('--tm-brand-primary'),'#EB4E89');assert.equal(t.root.style.getPropertyValue('--tm-family-primary'),'#183249');
});
test('Settings refresh uses the actual theme decorator after lazy mount without selecting a hidden alias',()=>{
 const t=theme({'travelmate-accent':'teal'});
 const source=read('assets/security-center.js');
 const fn=source.slice(source.indexOf('  function syncPreferences()'),source.indexOf('  function closeDialog()'));
 vm.runInNewContext(fn+'\nsyncPreferences();',{window:{TravelMateTheme:t.api},document:t.doc,localStorage:{getItem:k=>t.values.get(k)},syncVoicePreferences(){}});
 assert.equal(t.buttons.filter(b=>!b.hidden).length,5);
 assert.deepEqual(t.buttons.filter(b=>b.attrs['aria-pressed']==='true').map(b=>b.dataset.accentChoice),['ocean']);
});
function shell(){
 const handlers={},windowHandlers={},root={dataset:{},style:style()},body={dataset:{design:'v3'},classList:classes()},main={inert:false},dock={inert:false,querySelectorAll(){return[];},querySelector(){return null;},addEventListener(){}};
 const opener={isConnected:true,attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){doc.activeElement=this;}},close={disabled:false,hidden:false,getClientRects(){return[{}];},focus(){doc.activeElement=this;}},last={...close};
 const panel={hidden:true,id:'tm-utilities',querySelector(){return close;},querySelectorAll(){return[close,last];},contains(n){return n===close||n===last;}};
 const doc={body,documentElement:root,readyState:'loading',activeElement:opener,querySelector(q){if(q==='.tm-trip-dock')return dock;if(q==='[data-shell-utilities]')return panel;if(q==='main.content')return main;return null;},querySelectorAll(q){return q==='[data-shell-more]'?[opener]:[];},addEventListener(n,fn){(handlers[n]??=[]).push(fn);}};
 function Observer(){this.observe=function(){};this.disconnect=function(){};}
 const win={addEventListener(n,f){(windowHandlers[n]??=[]).push(f);},setTimeout(){},MutationObserver:Observer};
 vm.runInNewContext(read('assets/app-shell.js'),{document:doc,window:win,MutationObserver:Observer,URL,URLSearchParams,location:{href:'http://local/trip/custom/index.html?id=synthetic'},getComputedStyle(){return{getPropertyValue(){return'';}};},innerHeight:844,CustomEvent:function(){}});
 function click(selector){const event={target:{closest(q){return q===selector?opener:null;}},preventDefault(){this.defaultPrevented=true;}};for(const fn of handlers.click||[])fn(event);}
 return{doc,main,dock,opener,close,last,panel,api:win.TravelMateAppShell,click,key(e){for(const fn of handlers.keydown||[])fn(e);}};
}
test('utility open, focus trap, Escape, close and reopen preserve background inert state and surviving More focus',()=>{
 const s=shell();s.main.inert=true;s.click('[data-shell-more]');assert.equal(s.panel.hidden,false);assert.equal(s.doc.activeElement,s.close);assert.equal(s.dock.inert,true);
 s.doc.activeElement=s.last;let prevented=false;s.key({key:'Tab',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(s.doc.activeElement,s.close);
 s.key({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(s.panel.hidden,true);assert.equal(s.doc.activeElement,s.opener);assert.equal(s.main.inert,true);assert.equal(s.dock.inert,false);assert.equal(s.opener.attrs['aria-expanded'],'false');
 s.click('[data-shell-more]');assert.equal(s.panel.hidden,false);s.api.closeUtilities();s.api.closeUtilities();assert.equal(s.doc.activeElement,s.opener);assert.equal(s.panel.hidden,true);
});
test('V3 uses the canonical History renderer without requiring a sidebar, and retains the surviving More adapter',()=>{
 const app=read('assets/app.js'),router=read('assets/trip-redesign.js'),html=read('trip/custom/index.html');
 assert.doesNotMatch(router,/if\s*\(!sidebar\)\s*return/);assert.match(router,/TravelMateHistory\.bindView/);assert.match(router,/TravelMateHistory\.navigate/);
 assert.match(app,/document\.body\.dataset\.design!=='v3'&&!header\.querySelector/);assert.match(app,/menuButton&&document\.body\.dataset\.design==='v3'\)return/);
 assert.equal((html.match(/data-shell-more/g)||[]).length,1);assert.match(html,/data-mobile-menu data-shell-more/);assert.match(html,/data-shell-utilities[^>]*role="dialog"[^>]*hidden/);
 assert.doesNotMatch(app,/document\.body\.dataset\.design==='v3'[\s\S]{0,50}location\.reload/);
});


for (const mobile of [true,false]) test('Smart Hub owner and History restore More focus '+(mobile?'phone':'desktop'),()=>{
 const s=shell();s.click('[data-shell-more]');
 const launch={isConnected:true,setAttribute(){},closest(){return {};},focus(){if(!s.panel.hidden)s.doc.activeElement=this;}};
 s.doc.activeElement=launch;
 const close={isConnected:true,focus(){s.doc.activeElement=this;},getClientRects(){return backdrop.classList.contains('open')?[{}]:[];}};
 const backdrop={isConnected:true,classList:classes(),querySelector(){return close;},contains(n){return n===close;}};
 const state={ui:{launch,backdrop,modal:{classList:classes()},content:{innerHTML:''}}};
 const hub=read('assets/smart-hub.js'),functions=hub.slice(hub.indexOf('  function openHub()'),hub.indexOf('  function panel('));
 const context={state,document:s.doc,window:{closeMobileMenu(){s.api.closeUtilities();},matchMedia(){return{matches:mobile};}}};
 s.doc.querySelector=()=>null;
 vm.runInNewContext(functions+'\nopenHub();',context);
 assert.equal(s.panel.hidden,true);assert.equal(s.main.inert,false);assert.equal(s.dock.inert,false);assert.equal(s.doc.activeElement,close);
 let trapped=false;s.key({key:'Tab',preventDefault(){trapped=true;}});assert.equal(trapped,false);
 const overlays=new Map(),source=read('assets/navigation-memory.js');
 const collect=source.slice(source.indexOf('  function collectOverlays()'),source.indexOf("  document.addEventListener('focusin'"));
 s.opener.matches=q=>q==='[data-shell-more]';s.opener.getClientRects=()=>[{}];
 s.doc.querySelectorAll=q=>q==='#modal-smart-hub'?[backdrop]:[];
 const historyContext={document:s.doc,window:context.window,overlays,adapters:[['#modal-smart-hub','[data-smart-close]','open']],lastOutsideFocus:s.opener,syncEntry(){}};
 vm.runInNewContext(collect+'\ncollectOverlays();',historyContext);assert.equal(overlays.size,1);
 vm.runInNewContext('closeHub();',context);assert.equal(s.doc.activeElement,close,'hidden utility focus is ignored');
 vm.runInNewContext('collectOverlays();',historyContext);
 assert.equal(overlays.size,0);assert.equal(s.doc.activeElement,s.opener);assert.equal(s.main.inert,false);assert.equal(s.dock.inert,false);
 s.click('[data-shell-more]');assert.equal(s.panel.hidden,false);assert.equal(s.doc.activeElement,s.close);
});

test('Home Nearby adapter selects existing GPS UI without search and leaves trip initialization alone',()=>{
 const source=read('assets/app-shell.js'),fn=source.slice(source.indexOf('  function configureHomeNearby()'),source.indexOf('  function syncHomeRoute()'));
 for(const isHome of [true,false]){
  let modeClicks=0,init=0;
  const nearby=read('assets/nearby.js'),select=nearby.slice(nearby.indexOf('    function selectSearchMode('),nearby.indexOf("    panel.addEventListener('click'",nearby.indexOf('    function selectSearchMode(')));
  const modeContext={selectedSearchMode:'destination',radiusSelect:{},controls:{modeBar:{querySelectorAll(){return[];}},locationSummary:{}},lastGps:null,status:{},updateExecuteLabel(){},currentPosition(){throw Error('mode selection must not locate');},executeGpsSearch(){throw Error('mode selection must not search');}};
  const destination={hidden:false,disabled:false},panel={dataset:{searchMode:'destination'},querySelector(q){return q.includes('destination')?destination:{click(){modeClicks++;modeContext.panel=panel;vm.runInNewContext(select+"\nselectSearchMode('gps');",modeContext);}};}};
  vm.runInNewContext(fn+'\nconfigureHomeNearby();configureHomeNearby();',{isHome,isV3:true,document:{querySelector(){return panel;}},window:{TravelMateNearby:{init(){init++;}}}});
  assert.equal(modeClicks,isHome?1:0);assert.equal(init,isHome?2:0);assert.equal(destination.hidden,isHome);assert.equal(destination.disabled,isHome);
 }
 const nearby=read('assets/nearby.js');assert.match(nearby,/selectedSearchMode='destination'/,'trip engine default remains unchanged');
});

for(const outcome of ['cancel','denial','success'])test('Home primary GPS action uses existing consent and handles '+outcome,async()=>{
 const consent=outcome==='cancel'?'denied':'once';
 const source=read('assets/nearby.js');
 const gps=source.slice(source.indexOf('    async function executeGpsSearch()'),source.indexOf('    async function executePlacesSearch()'));
 const primary=source.slice(source.indexOf('    async function executePlacesSearch()'),source.indexOf("    freeForm.addEventListener('submit'"));
 // Extract the functions without their adjacent event wiring.
 const gpsFn=gps.slice(0,gps.indexOf('\n'));
 let positions=0,searches=0,consents=0;
 const node={disabled:false,setAttribute(){},removeAttribute(){}},status={classList:classes(),textContent:''};
 const context={panel:{dataset:{}},selectedCategoryKeys:[],selectedSearchMode:'gps',gpsRequestPending:false,searchSequence:0,
 requestGpsConsent:async()=>{consents++;return consent;},currentPosition:async()=>{positions++;if(outcome==='denial')throw Error('mock permission denied');return{coords:{latitude:41.9,longitude:12.5,accuracy:10}};},searchAt:async()=>{searches++;},
 gpsButton:node,controls:{executeButton:{...node}},status,results:{innerHTML:''},navigator:{onLine:true},map:null};
 vm.runInNewContext(gpsFn+'\n'+primary+'\nthis.run=executePlacesSearch;',context);
 assert.equal(consents,0);assert.equal(positions,0);await context.run();assert.equal(consents,1);assert.equal(positions,consent==='denied'?0:1);assert.equal(searches,outcome==='success'?1:0);assert.equal(context.gpsRequestPending,false);assert.equal(context.controls.executeButton.disabled,false);
 if(outcome==='denial'){assert.equal(status.classList.contains('is-error'),true);assert.match(status.textContent,/mock permission denied/);}
});

test('legacy secondary Hero geometry retains exact padding fallbacks with V3-only token',()=>{
 const css=read('assets/trip-redesign.css'),themeSource=read('assets/theme.js');
 assert.match(css,/padding-block:var\(--tm-secondary-hero-padding,4px\)/);assert.match(css,/padding:var\(--tm-secondary-hero-padding,12px\) 14px/);
 assert.equal(theme().root.style.getPropertyValue('--tm-secondary-hero-padding'),'16px');
 assert.match(themeSource,/'--tm-secondary-hero-padding':'16px'/);
});
