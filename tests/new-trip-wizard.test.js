'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/home.js'),'utf8');
const core=source.slice(source.indexOf('  // New Trip wizard core:'),source.indexOf('  // New Trip DOM adapter:'));
const context={};vm.runInNewContext(core+'\nthis.validate=validateDestinationFields;this.create=createDestinationWizard;',context);
const types=['זוגי','משפחתי','חברים','סולו'];
const valid=()=>({country:' איטליה ',city:' רומא ',start:'2026-01-01',end:'2026-01-01',budget:'2500',type:types[0],allowedTypes:types.slice()});
function harness(extra={}){
 let fields=valid(),identity=extra.identity||'',sequence=0;const calls={local:[],cloud:[],attach:[],navigation:[],reset:0,render:[]};
 const options={identity:()=>identity,readFields:()=>fields,resetFields(){calls.reset++;fields={...valid(),country:'',city:''};},render:(state,focus)=>calls.render.push({...state,focus}),newId:()=>{sequence++;return 'new-'+sequence;},canSaveLocal:()=>true,
 localSave:trip=>{calls.local.push(trip);return extra.localSave?extra.localSave(trip):trip;},attachPending:trip=>calls.attach.push(trip),shouldCloudSave:()=>Boolean(identity),cloudSave:(trip,owner)=>{calls.cloud.push({trip,owner});return extra.cloudSave?extra.cloudSave(trip,owner):Promise.resolve({saved:true});},openTrip:id=>calls.navigation.push(id),...extra.options};
 const wizard=context.create(options);wizard.opened();
 return{wizard,calls,options,get fields(){return fields;},set identity(value){identity=value;},get ids(){return sequence;},summary(){wizard.next();wizard.next();wizard.next();assert.equal(wizard.snapshot().step,3);}};
}
const validate=(patch={},step)=>context.validate({...valid(),...patch},step);
for(const [label,patch,field]of [['country whitespace',{country:'  '},'country'],['city whitespace',{city:'\n\t '},'city'],['missing start',{start:''},'start'],['invalid leap day',{start:'2026-02-29'},'start'],['invalid month',{start:'2026-13-01'},'start'],['malformed date',{start:'01-01-2026'},'start'],['zero year',{start:'0000-01-01'},'start'],['invalid end',{end:'2026-04-31'},'end'],['reversed dates',{end:'2025-12-31'},'end'],['61 days',{end:'2026-03-02'},'end'],['budget minimum',{budget:'50'},'budget'],['budget step',{budget:'125'},'budget'],['budget NaN',{budget:'NaN'},'budget'],['budget infinity',{budget:'Infinity'},'budget'],['budget invalid input',{budget:'',budgetBadInput:true},'budget'],['unknown type',{type:'unsupported'},'type']])test('wizard rejects '+label,()=>{assert.equal(validate(patch).field,field);});
for(const [label,patch,days,budget]of [['same day',{},1,2500],['60 days',{end:'2026-03-01'},60,2500],['valid leap',{start:'2028-02-29',end:'2028-02-29'},1,2500],['blank budget',{budget:'  '},1,2500],['minimum budget',{budget:'100'},1,100],['numeric exponent',{budget:'1e3'},1,1000]])test('wizard accepts '+label,()=>{const r=validate(patch);assert.equal(r.value.days,days);assert.equal(r.value.budget,budget);assert.equal(r.value.country,'איטליה');assert.equal(r.value.city,'רומא');});
test('active destination validation is not blocked by hidden required dates/budget',()=>{const r=validate({start:'',end:'',budget:'NaN'},0);assert.ok(r.value);const h=harness();h.fields.start='';h.fields.end='';h.wizard.next();assert.equal(h.wizard.snapshot().step,1);assert.equal(h.calls.local.length,0);});
test('Next/Back/edit and summary retain fields and cause no write or intelligence attachment',()=>{const h=harness();h.summary();h.wizard.back();assert.equal(h.fields.city,' רומא ');h.wizard.next();h.wizard.edit(0);h.fields.city='Tokyo';h.wizard.next();h.wizard.next();h.wizard.next();assert.equal(h.fields.city,'Tokyo');assert.equal(h.calls.local.length,0);assert.equal(h.calls.cloud.length,0);assert.equal(h.calls.attach.length,0);assert.equal(h.ids,0);});
for(const step of [0,1,2,3])test('cancel/reopen at step '+step+' keeps same-account draft and writes nothing',async()=>{const h=harness();for(let i=0;i<step;i++)h.wizard.next();h.wizard.closed();await h.wizard.confirm();assert.equal(h.calls.local.length,0);assert.equal(h.calls.cloud.length,0);assert.equal(h.calls.attach.length,0);h.wizard.opened();assert.equal(h.wizard.snapshot().step,step);assert.equal(h.fields.city,' רומא ');});
test('implicit submit before summary only advances; it cannot create',async()=>{const h=harness();await h.wizard.confirm();assert.equal(h.wizard.snapshot().step,1);assert.equal(h.calls.local.length,0);});
for(const [field,value,step]of [['country',' ',0],['end','2025-01-01',1],['budget','Infinity',2]])test('final confirm revalidates hidden '+field,async()=>{const h=harness();h.summary();h.fields[field]=value;await h.wizard.confirm();assert.equal(h.wizard.snapshot().step,step);assert.equal(h.wizard.snapshot().field,field);assert.equal(h.calls.local.length,0);assert.equal(h.calls.attach.length,0);assert.equal(h.ids,0);});
test('guest/offline canonical local success creates and navigates exactly once on double confirm',async()=>{const h=harness();h.summary();await Promise.all([h.wizard.confirm(),h.wizard.confirm()]);assert.equal(h.calls.local.length,1);assert.equal(h.calls.cloud.length,0);assert.equal(h.calls.attach.length,1);assert.equal(h.ids,1);assert.deepEqual(h.calls.navigation,['new-1']);const trip=h.calls.local[0];assert.equal(trip.country,'איטליה');assert.equal(trip.city,'רומא');assert.equal(trip.days,1);assert.equal(trip.budget,2500);assert.equal(trip.type,types[0]);assert.equal(trip.ownerId,undefined);assert.equal(trip.savedPlaces.length,0);});
test('signed-in offline success uses existing local writer and no cloud request',async()=>{const h=harness({identity:'A',options:{shouldCloudSave:()=>false}});h.summary();await h.wizard.confirm();assert.equal(h.calls.local.length,1);assert.equal(h.calls.local[0].ownerId,'A');assert.equal(h.calls.cloud.length,0);assert.deepEqual(h.calls.navigation,['new-1']);assert.match(h.wizard.snapshot().status,/במכשיר/);});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
test('double click/Enter while cloud pending makes one ID, one local and at most one cloud call; same-user refresh retains draft',async()=>{const pending=deferred(),h=harness({identity:'A',cloudSave:()=>pending.promise});h.summary();const first=h.wizard.confirm();await h.wizard.confirm();assert.equal(h.wizard.snapshot().busy,true);assert.equal(h.wizard.syncIdentity(),false);assert.equal(h.fields.city,' רומא ');pending.resolve({saved:true});await first;assert.equal(h.ids,1);assert.equal(h.calls.local.length,1);assert.equal(h.calls.cloud.length,1);assert.equal(h.calls.cloud[0].owner,'A');assert.equal(h.calls.attach.length,1);assert.deepEqual(h.calls.navigation,['new-1']);});
for(const outcome of ['throw','not-saved'])test('cloud '+outcome+' after local success preserves one trip and opens it without another save',async()=>{const h=harness({identity:'A',cloudSave:()=>outcome==='throw'?Promise.reject(Error('offline')):Promise.resolve({saved:false})});h.summary();await h.wizard.confirm();assert.equal(h.wizard.snapshot().created,true);assert.equal(h.calls.navigation.length,0);assert.match(h.wizard.snapshot().status,/לא הושלם/);await h.wizard.confirm();await h.wizard.confirm();assert.equal(h.calls.local.length,1);assert.equal(h.calls.cloud.length,1);assert.equal(h.ids,1);assert.deepEqual(h.calls.navigation,['new-1']);});
test('missing local writer fails before attachment, ID generation or navigation',async()=>{const h=harness({options:{canSaveLocal:()=>false}});h.summary();await h.wizard.confirm();assert.ok(h.wizard.snapshot().error);assert.equal(h.calls.attach.length,0);assert.equal(h.ids,0);assert.equal(h.calls.local.length,0);assert.equal(h.calls.navigation.length,0);});
test('throwing local save shows error, never calls cloud/navigates and retry reuses the same ID',async()=>{let fail=true;const h=harness({identity:'A',localSave:trip=>{if(fail)throw Error('quota');return trip;}});h.summary();await h.wizard.confirm();assert.ok(h.wizard.snapshot().error);assert.equal(h.calls.navigation.length,0);assert.equal(h.calls.cloud.length,0);assert.equal(h.wizard.snapshot().busy,false);fail=false;await h.wizard.confirm();assert.equal(h.ids,1);assert.equal(h.calls.local[0].id,h.calls.local[1].id);assert.equal(h.calls.cloud.length,1);assert.deepEqual(h.calls.navigation,['new-1']);});
test('undefined local result is unconfirmed and does not navigate',async()=>{const h=harness({options:{localSave:()=>undefined}});h.summary();await h.wizard.confirm();assert.ok(h.wizard.snapshot().error);assert.equal(h.calls.navigation.length,0);assert.equal(h.calls.cloud.length,0);});
for(const phase of ['local','cloud'])test('identity change during '+phase+' completion clears draft and prevents stale navigation or further work',async()=>{const pending=deferred(),h=harness({identity:'A',...(phase==='local'?{localSave:()=>pending.promise}:{cloudSave:()=>pending.promise})});h.summary();const saving=h.wizard.confirm();h.identity='B';assert.equal(h.wizard.syncIdentity(),true);h.fields.city='B draft';pending.resolve(phase==='local'?{id:'new-1'}:{saved:true});await saving;assert.equal(h.fields.city,'B draft');assert.equal(h.wizard.snapshot().step,0);assert.equal(h.wizard.snapshot().created,false);assert.equal(h.wizard.snapshot().busy,false);assert.equal(h.calls.navigation.length,0);assert.equal(h.calls.cloud.length,phase==='local'?0:1);assert.equal(h.calls.reset,1);});
test('actual account change clears same-user draft, while refresh does not',()=>{const h=harness({identity:'A'});h.summary();assert.equal(h.wizard.syncIdentity(),false);h.identity='';h.wizard.syncIdentity();assert.equal(h.fields.city,'');assert.equal(h.wizard.snapshot().step,0);h.identity='B';h.wizard.syncIdentity();assert.equal(h.calls.reset,2);assert.equal(h.calls.local.length,0);});
test('cancel/reopen during cloud request suppresses stale automatic navigation but retains saved trip',async()=>{const pending=deferred(),h=harness({identity:'A',cloudSave:()=>pending.promise});h.summary();const save=h.wizard.confirm();h.wizard.closed();h.wizard.opened();pending.resolve({saved:true});await save;assert.equal(h.calls.navigation.length,0);assert.equal(h.wizard.snapshot().created,true);await h.wizard.confirm();assert.deepEqual(h.calls.navigation,['new-1']);assert.equal(h.calls.local.length,1);assert.equal(h.calls.cloud.length,1);});
test('DOM summary uses textContent, preserves original four type values and has no draft store/history owner',()=>{const adapter=source.slice(source.indexOf('  // New Trip DOM adapter:'),source.indexOf('  prepareStaticTrips();',source.indexOf('  // New Trip DOM adapter:')));assert.doesNotMatch(adapter,/innerHTML|localStorage\.setItem|history\.(?:pushState|replaceState)/);for(const key of ['destination','dates','days','preferences','budget'])assert.ok(adapter.includes('[data-wizard-summary="'+key+'"]\').textContent'));const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const options=html.match(/<select name="type"[\s\S]*?<\/select>/)[0];assert.deepEqual([...options.matchAll(/<option>(.*?)<\/option>/g)].map(m=>m[1]),types);assert.match(html,/data-destination-form novalidate/);assert.match(html,/name="budget" type="number" min="100" step="50" value="2500"/);});

test('identity change inside optional final attachment cannot proceed to a local write',async()=>{const h=harness({identity:'A'});h.options.attachPending=()=>{h.identity='B';h.wizard.syncIdentity();};h.summary();await h.wizard.confirm();assert.equal(h.calls.local.length,0);assert.equal(h.calls.cloud.length,0);assert.equal(h.calls.navigation.length,0);assert.equal(h.fields.city,'');});

test('actual closed modal rejects submit before its observer callback has run',async()=>{const h=harness();h.summary();h.options.isOpen=()=>false;await h.wizard.confirm();assert.equal(h.calls.local.length,0);assert.equal(h.calls.attach.length,0);assert.equal(h.ids,0);});
test('actual modal visibility guards pending completion ahead of observer delivery',async()=>{const pending=deferred();let visible=true;const h=harness({identity:'A',cloudSave:()=>pending.promise,options:{isOpen:()=>visible}});h.summary();const saving=h.wizard.confirm();visible=false;pending.resolve({saved:true});await saving;assert.equal(h.calls.navigation.length,0);h.wizard.closed();visible=true;h.wizard.opened();await h.wizard.confirm();assert.deepEqual(h.calls.navigation,['new-1']);assert.equal(h.calls.local.length,1);});
function consumeOnceOwner(){
 const intelligence=fs.readFileSync(path.join(root,'assets/trip-intelligence.js'),'utf8'),assistant=fs.readFileSync(path.join(root,'assets/ai-assistant.js'),'utf8');
 const mode=intelligence.slice(intelligence.indexOf('  var MODE ='),intelligence.indexOf('  var newTripSessionId'));
 const helpers=intelligence.slice(intelligence.indexOf('  function declaredPreferenceLines('),intelligence.indexOf('  function createSheet('));
 const metadata=intelligence.slice(intelligence.indexOf('  function noteMetadata('),intelligence.indexOf('  function saveResponse('));
 const attachment=intelligence.slice(intelligence.indexOf('  function attachPendingToTrip('),intelligence.indexOf('  function formContext('));
 const append=assistant.slice(assistant.indexOf('  function appendAiNote('),assistant.indexOf('  function persistTripWithNote('));
 const state={pendingSave:true,recommendation:{body:'Approved source recommendation',generatedAt:'2026-10-18T00:00:00Z'},context:{},responseId:'approved-response-1'};
 const env={window:{TravelMateNavo:{}},state,declaredPreferences:{},learnedPreferences:[]};
 vm.runInNewContext(mode+helpers+metadata+append+attachment+'\nwindow.TravelMateNavo.appendNote=appendAiNote;this.attach=attachPendingToTrip;',env);
 return{state,attach:env.attach};
}
function partialCanonicalWriter(failure){
 const entries=new Map([['travelmate-active-user','A'],['travelmate-trips','[]'],['travelmate-trips-user:A','[]']]);let armed=true;const writes=[];
 const storage={getItem:k=>entries.get(k)??null,setItem(k,v){writes.push(k);if(armed&&((failure==='primary'&&k==='travelmate-trips')||(failure==='backup'&&k==='travelmate-trips-user:A'))){armed=false;throw Error('Synthetic write failure '+k);}entries.set(k,v);},removeItem:k=>entries.delete(k)};
 const window={dispatchEvent(){},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/cloud-sync.js'),'utf8'),{window,document:{},localStorage:storage,sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},console,setTimeout,clearTimeout,AbortController,CustomEvent:function(type,options){this.type=type;this.detail=options?.detail;}});
 return{entries,writes,cloud:window.TravelMateCloud};
}
for(const failure of ['primary','backup','unconfirmed'])test('real consume-once attachment and canonical '+failure+' failure preserve payload and richer same-ID retry',async()=>{
 const intelligence=consumeOnceOwner(),writer=partialCanonicalWriter(failure);let attempts=0,successful=0,attachments=0;
 const h=harness({identity:'A',options:{attachPending:trip=>{attachments++;return intelligence.attach(trip);},localSave:trip=>{attempts++;const saved=writer.cloud.upsertLocalTrip(trip);if(failure==='unconfirmed'&&attempts===1)return undefined;successful++;return saved;},readLocalTrip:(id,owner)=>writer.cloud.getLocalTrips().find(t=>t.id===id&&t.ownerId===owner)}});
 h.summary();await h.wizard.confirm();assert.ok(h.wizard.snapshot().error);assert.equal(intelligence.state.pendingSave,false,'actual attachment owner consumed recommendation');assert.equal(h.wizard.snapshot().prepared,true);assert.equal(h.calls.navigation.length,0);
 assert.equal(intelligence.attach({id:'probe',country:'X',city:'Y'}),false,'owner cannot attach recommendation a second time');
 if(failure!=='primary'){
  const partial=JSON.parse(writer.entries.get('travelmate-trips'));assert.equal(partial.length,1);assert.equal(partial[0].aiNotes.length,1);
  if(failure==='backup')assert.deepEqual(JSON.parse(writer.entries.get('travelmate-trips-user:A')),[],'actual second write failed after primary persisted');
  partial[0].activities.push({id:'canonical-activity',title:'Preserve canonical activity'});partial[0].savedPlaces.push({id:'canonical-place'});partial[0].dayNotes['2026-01-01']='Preserve canonical day note';partial[0].otherCanonicalField={keep:true};writer.entries.set('travelmate-trips',JSON.stringify(partial));
 }
 await h.wizard.confirm();const primary=JSON.parse(writer.entries.get('travelmate-trips')),backup=JSON.parse(writer.entries.get('travelmate-trips-user:A'));
 assert.equal(primary.length,1);assert.equal(primary[0].id,'new-1');assert.equal(primary[0].aiNotes.length,1);assert.equal(primary[0].aiNotes[0].answer,'Approved source recommendation');assert.equal(primary[0].aiNotes[0].responseId,'approved-response-1');assert.deepEqual(backup,primary);
 if(failure!=='primary'){assert.equal(primary[0].activities[0].id,'canonical-activity');assert.equal(primary[0].savedPlaces[0].id,'canonical-place');assert.equal(primary[0].dayNotes['2026-01-01'],'Preserve canonical day note');assert.deepEqual(primary[0].otherCanonicalField,{keep:true});}
 assert.equal(attempts,2);assert.equal(successful,1);assert.equal(attachments,1);assert.equal(h.ids,1);assert.equal(h.calls.cloud.length,1);assert.deepEqual(h.calls.navigation,['new-1']);
});
test('prepared retry is read-only: Back/edit cannot change approved payload and tampering causes no write',async()=>{
 const h=harness({localSave(){throw Error('quota');}});h.summary();await h.wizard.confirm();const state=h.wizard.snapshot();assert.equal(state.prepared,true);h.wizard.back();h.wizard.edit(0);assert.equal(h.wizard.snapshot().step,3);h.fields.city='Edited after failure';await h.wizard.confirm();assert.equal(h.wizard.snapshot().step,3);assert.equal(h.wizard.snapshot().preparedFields.city,'רומא');assert.equal(h.calls.local.length,1);assert.equal(h.calls.attach.length,1);assert.ok(h.wizard.snapshot().error);
});
test('same-account reopen retains prepared attachment, actual account change drops it without leakage',async()=>{
 const intelligence=consumeOnceOwner(),h=harness({identity:'A',localSave(){throw Error('quota');},options:{attachPending:intelligence.attach}});h.summary();await h.wizard.confirm();h.wizard.closed();h.wizard.opened();assert.equal(h.wizard.snapshot().prepared,true);h.identity='B';h.wizard.syncIdentity();assert.equal(h.wizard.snapshot().prepared,false);assert.equal(h.wizard.snapshot().preparedFields,null);assert.equal(h.fields.city,'');assert.equal(h.calls.navigation.length,0);
});

test('retry cannot merge another account record or leak its prepared fields',async()=>{let writes=0;const h=harness({identity:'A',options:{localSave(){writes++;throw Error('quota');},readLocalTrip(){return{id:'new-1',ownerId:'B',city:'Other account secret'};}}});h.summary();await h.wizard.confirm();await h.wizard.confirm();assert.equal(writes,1);assert.equal(h.wizard.snapshot().preparedFields.city,'רומא');assert.equal(h.calls.navigation.length,0);assert.ok(h.wizard.snapshot().error);});

// Execute the real presentation adapter with a small DOM/event seam. The core
// wizard above and its canonical failure/retry cases remain unchanged.
function discoveryHarness({online=true,cached=()=>'',resolve=()=>Promise.resolve(''),identity='A'}={}){
 let focused=null,owner=identity,open=true,seq=0;const timers=new Map(),calls={cached:[],resolve:[]};
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.handlers={};this.value='';this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';this.naturalWidth=0;}
  appendChild(node){this.children.push(node);return node;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';}
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn);}
  dispatchEvent(e){if(!e.target)e.target=this;for(const fn of this.handlers[e.type]||[])fn(e);return true;}
  focus(){focused=this;}
 }
 const keys=['[data-destination-search]','[data-destination-clear]','[data-destination-manual]','.destination-choices','[data-destination-empty]','[data-destination-selection]'];
 const nodes=Object.fromEntries(keys.map(k=>[k,new Element()])),root={querySelector:k=>nodes[k]},fields={city:new Element('input'),country:new Element('input')},labels=[new Element('label'),new Element('label')];
 const form={elements:fields,querySelector:()=>root,querySelectorAll:()=>labels},state={step:0,busy:false,prepared:false,field:''};
 const helper={fallback:'https://example.invalid/generic',cached(c,k){calls.cached.push([c,k]);return cached(c,k);},resolve(c,k){calls.resolve.push([c,k]);return resolve(c,k);}};
 const env={Promise,document:{createElement:tag=>new Element(tag),documentElement:{dir:'rtl'}},window:{TravelMateDestinationImages:helper},navigator:{onLine:online},Event:class{constructor(type){this.type=type;}},setTimeout(fn){timers.set(++seq,fn);return seq;},clearTimeout(id){timers.delete(id);}};
 const code=source.slice(source.indexOf('  function createDestinationDiscovery('),source.indexOf('  function initDestinationWizard('));
 vm.runInNewContext(code+'\nthis.create=createDestinationDiscovery;',env);
 const adapter=env.create(form,{snapshot:()=>state,isOpen:()=>open,identity:()=>owner,editable:()=>state.step===0&&!state.busy&&!state.prepared});adapter.render();
 const fire=(node,type,extra={})=>{const event={type,target:node,preventDefault(){this.prevented=true;},...extra};node.dispatchEvent(event);return event;};
 return{adapter,form,state,calls,helper,timers,env,labels,nodes,fire,get cards(){return nodes['.destination-choices'].children;},get focused(){return focused;},set owner(v){owner=v;},set open(v){open=v;},search(value){nodes['[data-destination-search]'].value=value;fire(nodes['[data-destination-search]'],'input');}};
}
test('discovery has six explicit selectable destinations and maps both canonical fields without persistence',()=>{
 const h=discoveryHarness();assert.equal(h.cards.length,6);assert.deepEqual(h.cards.map(c=>c.dataset.destinationChoice),['tokyo','santorini','rome','paris','phuket','new-york']);
 let inputs=0,changes=0;for(const node of Object.values(h.form.elements)){node.addEventListener('input',()=>inputs++);node.addEventListener('change',()=>changes++);}
 h.fire(h.cards[2],'click');assert.equal(h.form.elements.city.value,'רומא');assert.equal(h.form.elements.country.value,'איטליה');assert.equal(inputs,2);assert.equal(changes,2);assert.equal(h.cards[2].attributes['aria-pressed'],'true');assert.equal(h.cards.filter(c=>c.attributes['aria-pressed']==='true').length,1);assert.match(h.nodes['[data-destination-selection]'].textContent,/רומא, איטליה/);assert.equal(h.calls.resolve.length,0);
});
test('Hebrew/English local filtering clears incompatible selection and clear restores six without selecting',()=>{
 const h=discoveryHarness();h.fire(h.cards[2],'click');h.search('Italy');assert.equal(h.form.elements.city.value,'רומא');assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>c.dataset.destinationChoice),['rome']);
 h.search('Japan');assert.equal(h.form.elements.city.value,'');assert.equal(h.form.elements.country.value,'');assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>c.dataset.destinationChoice),['tokyo']);
 h.search('ארה״ב');assert.deepEqual(h.cards.filter(c=>!c.hidden).map(c=>c.dataset.destinationChoice),['new-york']);h.search('Atlantis');assert.equal(h.nodes['[data-destination-empty]'].hidden,false);
 h.fire(h.nodes['[data-destination-clear]'],'click');assert.equal(h.cards.filter(c=>!c.hidden).length,6);assert.equal(h.form.elements.country.value,'');assert.equal(h.focused,h.nodes['[data-destination-search]']);
});
test('unknown destination exposes explicit manual fields, while Enter searches without submitting',()=>{
 const h=discoveryHarness();h.search('Atlantis');const enter=h.fire(h.nodes['[data-destination-search]'],'keydown',{key:'Enter'});assert.equal(enter.prevented,true);assert.equal(h.focused,h.nodes['[data-destination-manual]']);
 h.fire(h.nodes['[data-destination-manual]'],'click');assert(h.labels.every(l=>!l.hidden));assert.equal(h.focused,h.form.elements.city);assert.equal(h.form.elements.country.value,'');
 h.form.elements.city.value='Atlantis';h.fire(h.form.elements.city,'input');assert.equal(h.form.elements.country.value,'');h.state.field='country';h.adapter.render();assert(h.labels.every(l=>!l.hidden));
});
test('same-account reopen retains search and selection, account reset invalidates both, prepared retry prevents changes',()=>{
 const h=discoveryHarness();h.fire(h.cards[2],'click');h.search('Rome');h.adapter.closed();h.adapter.opened();assert.equal(h.nodes['[data-destination-search]'].value,'Rome');assert.equal(h.form.elements.city.value,'רומא');
 h.state.prepared=true;h.adapter.render();assert(h.cards.every(c=>c.disabled));h.fire(h.cards[1],'click');assert.equal(h.form.elements.city.value,'רומא');h.fire(h.nodes['[data-destination-manual]'],'click');assert(h.labels.every(l=>l.hidden));
 h.owner='B';h.adapter.reset();h.form.elements.city.value=h.form.elements.country.value='';h.state.prepared=false;h.adapter.render();assert.equal(h.nodes['[data-destination-search]'].value,'');assert(h.cards.every(c=>c.attributes['aria-pressed']==='false'));
});
test('offline uses cached destination images and never resolves uncached images; selection works without photos',()=>{
 const h=discoveryHarness({online:false,cached:city=>city==='רומא'?'https://example.invalid/rome.jpg':''});h.adapter.opened();assert.equal(h.calls.resolve.length,0);const rome=h.cards[2],img=rome.children[0];assert.equal(img.src,'https://example.invalid/rome.jpg');img.naturalWidth=800;img.onload();assert.equal(rome.dataset.imageState,'ready');assert.equal(img.hidden,false);assert.equal(h.cards[0].dataset.imageState,'unavailable');h.fire(h.cards[0],'click');assert.equal(h.form.elements.city.value,'טוקיו');
});
test('stale image promise after account change or closed modal cannot paint the new lifecycle',async()=>{
 const promises=[];const h=discoveryHarness({resolve:()=>{const d=deferred();promises.push(d);return d.promise;}});h.adapter.opened();assert.equal(promises.length,6);h.owner='B';h.adapter.reset();h.adapter.refreshImages();assert.equal(promises.length,12);
 promises[0].resolve('https://example.invalid/old-owner.jpg');await Promise.resolve();assert.notEqual(h.cards[0].children[0].src,'https://example.invalid/old-owner.jpg');
 h.open=false;h.adapter.closed();promises[6].resolve('https://example.invalid/closed.jpg');await Promise.resolve();assert.notEqual(h.cards[0].children[0].src,'https://example.invalid/closed.jpg');assert.equal(h.timers.size,0);
});
test('generic fallback, image error and timeout remain honest and do not repeatedly resolve on render',async()=>{
 const h=discoveryHarness({resolve:()=>Promise.resolve('https://example.invalid/generic')});h.adapter.opened();await Promise.resolve();assert(h.cards.every(c=>c.dataset.imageState==='unavailable'));h.adapter.render();h.adapter.refreshImages();assert.equal(h.calls.resolve.length,6);
 const errors=discoveryHarness({cached:()=> 'https://example.invalid/broken.jpg'});errors.adapter.opened();errors.cards[0].children[0].onerror();assert.equal(errors.cards[0].dataset.imageState,'unavailable');for(const timeout of [...errors.timers.values()])timeout();assert(errors.cards.every(c=>c.dataset.imageState==='unavailable'));assert.equal(errors.timers.size,0);
});
test('RTL grid keyboard arrows move focus without selecting or writing',()=>{
 const h=discoveryHarness(),grid=h.nodes['.destination-choices'];h.fire(grid,'keydown',{target:h.cards[0],key:'ArrowLeft'});assert.equal(h.focused,h.cards[1]);h.fire(grid,'keydown',{target:h.cards[1],key:'ArrowDown'});assert.equal(h.focused,h.cards[3]);h.fire(grid,'keydown',{target:h.cards[3],key:'Home'});assert.equal(h.focused,h.cards[0]);assert.equal(h.form.elements.city.value,'');
});

function nestedOwnershipHarness({sheetInitiallyInert=false,lazy=false}={}){
 let owner='A',open=true,timerId=0;const state={step:2,busy:false,prepared:false},listeners={},windowListeners=[],observers=[],timers=new Map();let dispatch;
 const document={activeElement:null,addEventListener(type,fn){(listeners[type]??=[]).push(fn);},querySelectorAll(){return this.body.children.filter(n=>n.kind==='canonical-backdrop');}};
 class Node{
  constructor(kind,parent=null){this.kind=kind;this.parent=parent;this.tagName='SECTION';this.inert=false;this.isConnected=true;this.attributes={};this.children=[];this._hidden=false;this.disabled=false;if(parent)parent.children.push(this);}
  set hidden(v){this._hidden=v;for(const o of observers)if(o.target===this&&o.connected)o.pending=true;}
  get hidden(){return this._hidden;}
  contains(n){for(;n;n=n.parent)if(n===this)return true;return false;}
  getClientRects(){for(let n=this;n;n=n.parent)if(n.hidden)return[];return[{}];}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];}
  closest(selector){if(selector==='[data-modal="destination"]')return this.kind==='wizard-trigger'?this:null;if(selector==='.navo-trip-banner button')return this===launch?launch:null;if(selector==='#modal-destination [data-close]')return this===wizardClose?wizardClose:null;return null;}
  querySelector(selector){if(this===form&&selector==='.navo-trip-banner button')return launch;if(this===backdrop&&selector.startsWith('.navo-intelligence-sheet'))return sheet;if(this===sheet&&selector==='[data-navo-close]')return close;if(this===sheet&&selector==='#navo-intelligence-title')return title;return null;}
  querySelectorAll(){return this===sheet?[close,content,last]:[];}
  focus(){for(let n=this;n;n=n.parent)if(n.inert||n.hidden)return;document.activeElement=this;for(const fn of listeners.focusin||[])fn({target:this});}
  click(){dispatch(this);}
 }
 const body=new Node('body');body.classList={remove(){},add(){}};document.body=body;
 const modal=new Node('wizard',body);modal.setAttribute('aria-modal','true');const form=new Node('form',modal),launch=new Node('launcher',form),wizardClose=new Node('wizard-close',modal),background=new Node('background',body),trigger=new Node('wizard-trigger',background),preInert=new Node('prior-inert',body);preInert.inert=true;
 const backdrop=new Node('canonical-backdrop',lazy?null:body);backdrop.hidden=true;backdrop.inert=sheetInitiallyInert;
 const sheet=new Node('canonical-sheet',backdrop),close=new Node('nested-close',sheet),content=new Node('nested-content',sheet),last=new Node('nested-last',sheet),title=new Node('title',sheet);
 class Observer{constructor(cb){this.cb=cb;this.connected=true;this.pending=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.connected=false;}}
 const window={TravelMateTripIntelligence:{},addEventListener(type,fn,capture){windowListeners.push({type,fn,capture:Boolean(capture)});}};
 const env={Promise,document,window,MutationObserver:Observer,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
 const code=source.slice(source.indexOf('  function createWizardModalOwnership('),source.indexOf('  function initDestinationWizard('));vm.runInNewContext(code+'\nthis.create=createWizardModalOwnership;',env);
 const control=env.create(modal,form,{isOpen:()=>open,identity:()=>owner,snapshot:()=>state,dismiss:()=>wizardClose.click()});
 function capture(target){for(const fn of listeners.click||[])fn({target});}
 function targetAction(target){if(target===launch){returnFocus=document.activeElement;backdrop.hidden=false;close.focus();}if(target===close||target===backdrop){backdrop.hidden=true;if(returnFocus)returnFocus.focus();}if(target===wizardClose)open=false;}
 dispatch=target=>{capture(target);targetAction(target);};let returnFocus;
 function flush(){for(let rounds=0;rounds<5;rounds++){const pending=observers.filter(o=>o.connected&&o.pending);if(!pending.length)return;for(const o of pending){o.pending=false;o.cb();}}throw Error('observer loop');}
 function key(key,shiftKey=false){const event={key,shiftKey,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const fn of listeners.keydown||[])fn(event);return event;}
 return{control,state,modal,form,launch,backdrop,sheet,close,content,last,background,preInert,trigger,wizardClose,document,window,observers,timers,flush,key,captureOnly(n){n.focus();capture(n);},flushTimers(){for(const [id,fn]of [...timers]){timers.delete(id);fn();}},async checkpointClick(n){n.focus();capture(n);await Promise.resolve();const before={hidden:backdrop.hidden,inert:backdrop.inert,wizardInert:modal.inert};targetAction(n);flush();return before;},createNode:kind=>new Node(kind),emit(type,detail){for(const capture of [true,false])for(const item of windowListeners)if(item.type===type&&item.capture===capture)item.fn({detail});},click(n){n.focus();dispatch(n);flush();},append(n){body.children.push(n);n.parent=body;for(const o of observers)if(o.target===body)o.pending=true;flush();},get owner(){return owner;},set owner(v){owner=v;},get open(){return open;},set open(v){open=v;}};
}
test('canonical Preferences sheet borrows focus and pointer inertness; close restores the wizard but not its background',async()=>{
 const h=nestedOwnershipHarness();h.control.opened();assert.equal(h.backdrop.inert,true);h.click(h.launch);assert.equal(h.backdrop.hidden,false);assert.equal(h.backdrop.inert,false);assert.equal(h.modal.inert,true);assert.equal(h.modal.getAttribute('aria-modal'),'false');assert.equal(h.document.activeElement,h.close);assert.equal(h.background.inert,true);assert.equal(h.preInert.inert,true);
 h.last.focus();const tab=h.key('Tab');assert.equal(tab.prevented,true);assert.equal(tab.stopped,true);assert.equal(h.document.activeElement,h.close);h.key('Tab',true);assert.equal(h.document.activeElement,h.last);
 h.click(h.close);assert.equal(h.backdrop.hidden,true);assert.equal(h.backdrop.inert,true);assert.equal(h.modal.inert,false);assert.equal(h.modal.getAttribute('aria-modal'),'true');assert.equal(h.document.activeElement,h.launch);assert.equal(h.background.inert,true);assert.equal(h.control.ownsFocus(),false);await Promise.resolve();
});
test('nested Escape closes only recommendations; wizard dismissal then restores original inert states',()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.click(h.launch);const event=h.key('Escape');h.flush();assert.equal(event.stopped,true);assert.equal(event.prevented,true);assert.equal(h.modal.inert,false);assert.equal(h.document.activeElement,h.launch);assert.equal(h.backdrop.hidden,true);
 h.open=false;h.control.closed();assert.equal(h.background.inert,false);assert.equal(h.backdrop.inert,false);assert.equal(h.preInert.inert,true);
});
test('lazy canonical sheet is inert until its exact Preferences launcher; wrong step or preexisting inertness cannot be exempted',()=>{
 const h=nestedOwnershipHarness({lazy:true});h.control.opened();h.append(h.backdrop);assert.equal(h.backdrop.inert,true);h.state.step=1;h.click(h.launch);assert.equal(h.backdrop.inert,true);assert.equal(h.control.ownsFocus(),false);
 const locked=nestedOwnershipHarness({sheetInitiallyInert:true});locked.control.opened();locked.click(locked.launch);assert.equal(locked.backdrop.inert,true);assert.equal(locked.modal.inert,false);
});
test('account reset and stale observer cannot unlock the wizard or unrelated background after a later ownership handoff',()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.click(h.launch);const old=h.observers.find(o=>o.target===h.backdrop).cb;h.owner='B';h.control.reset();h.flush();assert.equal(h.backdrop.hidden,true);assert.equal(h.backdrop.inert,true);assert.equal(h.modal.inert,false);assert.equal(h.background.inert,true);
 h.click(h.launch);assert.equal(h.modal.inert,true);old();assert.equal(h.modal.inert,true);assert.equal(h.backdrop.inert,false);assert.equal(h.background.inert,true);
 h.open=false;h.control.closed();old();assert.equal(h.backdrop.hidden,true);assert.equal(h.background.inert,false);assert.equal(h.preInert.inert,true);
});
test('a changed account detected by a late body observer closes owned sheet without exempting it or unrelated dialogs',()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.click(h.launch);h.owner='B';const bodyObserver=h.observers.find(o=>o.target===h.document.body);bodyObserver.cb();assert.equal(h.backdrop.hidden,true);assert.equal(h.backdrop.inert,true);assert.equal(h.modal.inert,false);assert.equal(h.background.inert,true);
});

test('real askMore and openConversation hand off before actual assistant event/setOpen behavior, preserving wizard draft',()=>{
 const h=nestedOwnershipHarness();h.form.elements={city:{value:'רומא'},country:{value:'איטליה'}};h.control.opened();h.click(h.launch);
 const panel=h.createNode('assistant'),input=h.createNode('assistant-input');panel.children.push(input);input.parent=panel;panel.hidden=true;panel.querySelector=()=>({textContent:''});h.append(panel);assert.equal(panel.inert,true);
 const intelligence=fs.readFileSync(path.join(root,'assets/trip-intelligence.js'),'utf8'),assistant=fs.readFileSync(path.join(root,'assets/ai-assistant.js'),'utf8');
 const close=intelligence.slice(intelligence.indexOf('  function closeSheet()'),intelligence.indexOf('  function renderState()'));
 const ask=intelligence.slice(intelligence.indexOf('  function askMore()'),intelligence.indexOf('  function attachPendingToTrip('));
 const open=assistant.match(/openConversation: function \(prompt, context\) \{[\s\S]*?\n    \}/)[0];
 const setOpen=assistant.slice(assistant.indexOf('  var tripHistory ='),assistant.indexOf('  function setBusy('));
 const handler=assistant.slice(assistant.indexOf("  window.addEventListener('travelmate:ask-ai'"),assistant.indexOf('  if (!window.TravelMateHistory) window.addEventListener'));
 const pushes=[],history={state:null,pushState(state){this.state=state;pushes.push(state);},back(){throw Error('No new history implementation in handoff');}};
 const shared={window:h.window,document:h.document,history,location:{href:'http://local/index.html#active-trips'},requestAnimationFrame:fn=>fn(),setTimeout(){},lockPageScroll(){},unlockPageScroll(){},syncVisualViewport(){}};
 h.document.contains=node=>node.isConnected;h.window.TravelMateEvents={names:{askAi:'travelmate:ask-ai'},emit:(name,detail)=>h.emit(name,detail)};
 const ai={...shared,state:{open:false,session:null,messages:[]},ui:{panel,input,orb:h.trigger,chat:{scrollTop:0,scrollHeight:0}},tripContext:null,storageKey:'general',conversationStorageKey:()=> 'general',trimText:value=>value,contextLabel:()=> 'Fixture context',autoGrow(){},renderPrompts(){},restoreMessages(){},renderHistory(){}};
 vm.runInNewContext(setOpen+handler+'\nwindow.TravelMateNavo={'+open+'};',ai);
 const recommendation={...shared,state:{context:{contextMode:'NEW_TRIP',destination:'רומא',country:'איטליה'},returnFocus:h.launch},ui:{backdrop:h.backdrop}};
 vm.runInNewContext(close+ask+'\nthis.ask=askMore;',recommendation);recommendation.ask();
 assert.equal(h.open,false);assert.equal(h.backdrop.hidden,true);assert.equal(panel.hidden,false);assert.equal(panel.inert,false);assert.equal(h.document.activeElement,input);assert.equal(pushes.length,1);assert.equal(pushes[0].travelMateOverlay,'ai');assert.match(input.value,/המשך את המלצות/);
 assert.equal(h.form.elements.city.value,'רומא');assert.equal(h.form.elements.country.value,'איטליה');assert.equal(h.state.step,2);h.flush();h.control.closed();assert.equal(panel.inert,false);assert.equal(h.document.activeElement,input);assert.equal(h.preInert.inert,true);
});
test('assistant handoff requires the owned closing NEW_TRIP continuation; unrelated events do not dismiss or exempt UI',()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.click(h.launch);h.emit('travelmate:ask-ai',{source:'mate-conversation',context:{contextMode:'NEW_TRIP'}});assert.equal(h.open,true,'visible recommendations have not exited yet');
 h.backdrop.hidden=true;h.emit('travelmate:ask-ai',{source:'other',context:{contextMode:'NEW_TRIP'}});assert.equal(h.open,true);h.emit('travelmate:ask-ai',{source:'mate-conversation',context:{contextMode:'EXISTING_TRIP'}});assert.equal(h.open,true);h.owner='B';h.emit('travelmate:ask-ai',{source:'mate-conversation',context:{contextMode:'NEW_TRIP'}});assert.equal(h.open,true);assert.equal(h.background.inert,true);
});

test('inter-listener microtask checkpoint cannot cancel an armed sheet before the canonical target click opens it',async()=>{
 const h=nestedOwnershipHarness();h.control.opened();const beforeTarget=await h.checkpointClick(h.launch);
 assert.deepEqual(beforeTarget,{hidden:true,inert:false,wizardInert:false},'capture handoff must stay armed through the checkpoint before target openSheet');
 assert.equal(h.backdrop.hidden,false);assert.equal(h.backdrop.inert,false);assert.equal(h.modal.inert,true);assert.equal(h.modal.getAttribute('aria-modal'),'false');assert.equal(h.document.activeElement,h.close);h.flushTimers();assert.equal(h.backdrop.inert,false,'post-dispatch cancellation cannot release an active sheet');h.click(h.close);assert.equal(h.modal.inert,false);assert.equal(h.background.inert,true);
});
test('a dispatch that never opens cancels after propagation, while stale cancellation cannot release a later handoff',async()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.captureOnly(h.launch);await Promise.resolve();assert.equal(h.backdrop.inert,false);assert.equal(h.modal.inert,false);const stale=[...h.timers.values()][0];h.flushTimers();assert.equal(h.backdrop.inert,true);assert.equal(h.control.ownsFocus(),false);assert.equal(h.background.inert,true);
 h.click(h.launch);stale();assert.equal(h.backdrop.inert,false);assert.equal(h.modal.inert,true);h.click(h.close);assert.equal(h.timers.size,0);
});

function dockHarness({priorInert=false,closeAllowed=true}={}){
 let open=true,closes=0;const listeners={},events={};
 class Node{
  constructor(kind){this.kind=kind;this.children=[];this.parentNode=null;this.inert=false;this.attrs={};this.listeners={};}
  get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}
  appendChild(n){return this.insertBefore(n,null);}
  insertBefore(n,next){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);const i=next?this.children.indexOf(next):this.children.length;this.children.splice(i,0,n);n.parentNode=this;return n;}
  contains(n){return n===this||this.children.some(c=>c.contains(n));}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){this.listeners[k]=f;}focus(){document.activeElement=this;}
  closest(){return this;}matches(s){return this.kind==='new'&&s==='[data-modal="destination"]';}
 }
 const body=new Node('body'),before=new Node('before'),dock=new Node('dock'),after=new Node('after'),host=new Node('host'),modal=new Node('modal'),document={activeElement:null,querySelector:()=>dock};
 body.appendChild(before);body.appendChild(dock);body.appendChild(after);modal.appendChild(host);modal.querySelector=()=>host;
 const center=new Node('new'),route=new Node('route'),profile=new Node('profile');[center,route,profile].forEach(n=>dock.appendChild(n));dock.inert=priorInert;
 const window={addEventListener(k,f){events[k]=f;}},env={document,window};vm.runInNewContext(source.slice(source.indexOf('  function createWizardDockOwnership('),source.indexOf('  function createWizardModalOwnership('))+'\nthis.create=createWizardDockOwnership;',env);
 const control=env.create(modal,{isOpen:()=>open,dismiss(){closes++;if(closeAllowed){open=false;control.closed();}}});
 function click(target){const event={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};dock.listeners.click(event);return event;}
 return{control,body,dock,host,modal,before,after,center,route,profile,document,events,click,get closes(){return closes;},get open(){return open;},set open(v){open=v;}};
}
test('wizard borrows the same dock and restores exact parent, sibling, marker and inert state without cloning',()=>{
 const h=dockHarness();const children=h.dock.children.slice();h.dock.setAttribute('data-wizard-dock','original');h.control.opened();h.control.opened();assert.equal(h.host.children.length,1);assert.equal(h.host.children[0],h.dock);assert.deepEqual(h.dock.children,children);assert.equal(h.dock.inert,false);
 h.control.closed();h.control.closed();assert.deepEqual(h.body.children,[h.before,h.dock,h.after]);assert.equal(h.dock.getAttribute('data-wizard-dock'),'original');assert.equal(h.dock.inert,false);
});
test('center action is idempotent; same-hash and Profile hand off after synchronous canonical close',()=>{
 for(const key of ['route','profile']){const h=dockHarness();h.control.opened();const center=h.click(h.center);assert.equal(center.prevented,true);assert.equal(center.stopped,true);assert.equal(h.closes,0);assert.equal(h.open,true);
 const event=h.click(h[key]);assert.equal(h.closes,1);assert.equal(h.open,false);assert.equal(h.dock.parentNode,h.body);assert.equal(h.document.activeElement,h[key]);assert.equal(event.prevented,undefined);assert.equal(event.stopped,undefined);}
});
test('nested recommendation suspension and existing inertness cannot activate the relocated dock',()=>{
 const h=dockHarness();h.control.opened();h.control.suspend(true);const event=h.click(h.profile);assert.equal(event.prevented,true);assert.equal(h.closes,0);h.control.suspend(false);assert.equal(h.dock.inert,false);
 const locked=dockHarness({priorInert:true});locked.control.opened();locked.control.suspend(false);assert.equal(locked.dock.inert,true);locked.click(locked.route);assert.equal(locked.closes,0);locked.control.closed();assert.equal(locked.dock.inert,true);
});
test('cancelled close cannot let a dock action escape; native Back/hash changes close without owning routing',()=>{
 const denied=dockHarness({closeAllowed:false});denied.control.opened();const e=denied.click(denied.route);assert.equal(e.prevented,true);assert.equal(e.stopped,true);assert.equal(denied.dock.parentNode,denied.host);
 for(const name of ['popstate','hashchange']){const h=dockHarness();h.control.opened();h.events[name]();assert.equal(h.open,false);assert.equal(h.closes,1);assert.equal(h.dock.parentNode,h.body);h.events[name]();assert.equal(h.closes,1);}
});
test('dock restore tolerates removed next sibling and reopened transaction without duplicating nodes',()=>{
 const h=dockHarness();h.control.opened();h.body.children.splice(h.body.children.indexOf(h.after),1);h.after.parentNode=null;h.control.closed();assert.equal(h.body.children.at(-1),h.dock);assert.equal(h.dock.getAttribute('data-wizard-dock'),null);h.control.opened();assert.equal(h.host.children.length,1);h.control.closed();assert.equal(h.body.children.filter(n=>n===h.dock).length,1);
});
test('canonical dismissal restores background across an inter-listener body-mutation checkpoint and can reopen',async()=>{
 const h=nestedOwnershipHarness();h.control.opened();h.captureOnly(h.wizardClose);await Promise.resolve();
 h.observers.find(o=>o.target===h.document.body).cb();assert.equal(h.open,true,'target close has not run at the checkpoint');assert.equal(h.background.inert,false,'a relocated dock cannot cause the background ledger to be reacquired while closing');assert.equal(h.preInert.inert,true);
 h.open=false;h.control.closed();h.open=true;h.control.opened();assert.equal(h.background.inert,true);h.open=false;h.control.closed();assert.equal(h.background.inert,false);assert.equal(h.preInert.inert,true);
});

function gradientProofCallback(file){
 const s=fs.readFileSync(path.join(root,file),'utf8'),start=s.indexOf("evaluateAll(cards=>cards.map(card=>{"),end=s.indexOf("\n expect(proof.length)",start);
 assert(start>0&&end>start);const expression=s.slice(start+'evaluateAll('.length,end).trim();assert(expression.endsWith('));'));return expression.slice(0,-2);
}
function gradientPaintFixture(){
 // DOM/style evidence fixture, not a browser or a claim of rendered CSS.
 const style=patch=>Object.assign({position:'static',zIndex:'auto',display:'block',content:'none',visibility:'visible',outlineStyle:'none',textShadow:'none',boxShadow:'none',backgroundBlendMode:'normal',opacity:'1',filter:'none',mixBlendMode:'normal',transform:'none',translate:'none',rotate:'none',scale:'none',zoom:'1',perspective:'none',clipPath:'none',clip:'auto',maskImage:'none',overflowX:'visible',overflowY:'visible',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',color:'rgb(255, 255, 255)',webkitTextFillColor:'rgb(255, 255, 255)',top:'0px',right:'0px',bottom:'0px',left:'0px',borderTopWidth:'2px',borderRightWidth:'2px',borderBottomWidth:'2px',borderLeftWidth:'2px',borderTopLeftRadius:'18px',borderTopRightRadius:'18px',borderBottomLeftRadius:'18px',borderBottomRightRadius:'18px',getPropertyValue(k){return k==='-webkit-text-stroke-width'?'0px':k.startsWith('padding-')||/^border-.*-width$/.test(k)?'0px':this[k]??'none';}},patch);
 const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
 const make=(tag,cls='')=>({tagName:tag,className:cls,nodeType:1,children:[],get childNodes(){return this.text?[this.text]:this.children;},parentElement:null,style:style(),pseudo:{},matches(selector){return selector.split(',').some(s=>s==='body'&&tag==='BODY'||s==='html'&&tag==='HTML'||s==='img'&&tag==='IMG'||s==='strong'&&tag==='STRONG'||s==='span'&&tag==='SPAN'||s==='span.'+cls&&tag==='SPAN'||s==='.'+cls);},getBoundingClientRect(){return this.rect||rect(0,0,0,0);}});
 const card=make('BUTTON','destination-choice'),img=make('IMG'),status=make('SPAN','destination-image-status'),caption=make('SPAN','destination-choice-caption'),mark=make('SPAN','destination-choice-check'),city=make('STRONG'),country=make('SPAN'),ancestor=make('DIV','destination-modal'),body=make('BODY'),html=make('HTML');
 card.dataset={destinationChoice:'rome',imageState:'ready'};card.rect=rect(0,0,168,120);card.style=style({position:'relative',isolation:'isolate',overflowX:'hidden',overflowY:'hidden'});
 card.pseudo['::before']=style({position:'absolute',zIndex:'1',content:'""',backgroundImage:'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0px, rgba(0, 0, 0, 0.64) 48px, rgba(0, 0, 0, 0) 72px)',backgroundSize:'auto',backgroundPosition:'0% 0%',backgroundRepeat:'repeat',backgroundAttachment:'scroll'});
 img.style.position='absolute';caption.style.position='absolute';caption.style.zIndex='2';status.style.position='absolute';status.style.display='none';mark.style.position='absolute';mark.style.zIndex='2';mark.style.display='none';
 card.children=[img,status,caption,mark];caption.children=[city,country];for(const n of card.children)n.parentElement=card;city.parentElement=country.parentElement=caption;card.parentElement=ancestor;ancestor.parentElement=body;body.parentElement=html;
 city.text={nodeType:3,textContent:'Rome',rect:rect(98,74,60,20)};country.text={nodeType:3,textContent:'Italy',rect:rect(122,96,36,15)};card.querySelectorAll=()=>[img,status,caption,city,country,mark];caption.querySelectorAll=()=>[city,country];card.querySelector=s=>s==='img'?img:s==='.destination-choice-caption'?caption:null;
 const document={createTreeWalker(text){let read=false;return{nextNode(){if(read)return null;read=true;return text.text;}};},createRange(){let text;return{selectNodeContents(n){text=n;},getClientRects(){return[text.rect];}};}};
 const env={CSS:{supports(property,value){return value==='none'&&['backdrop-filter','-webkit-backdrop-filter'].includes(property);}},Node:{TEXT_NODE:3},NodeFilter:{SHOW_TEXT:4},document,getComputedStyle(n,pseudo){return pseudo?(n.pseudo[pseudo]||style()):n.style;}};
 return{card,img,status,caption,mark,city,country,ancestor,env};
}
test('both browser specs use byte-identical bounded gradient paint proof',()=>{
 assert.equal(gradientProofCallback('tests/e2e/new-trip-wizard.spec.js'),gradientProofCallback('tests/e2e/new-trip-release.spec.js'));
});
const paintAdversaries=[
 ['elevated image','image is not below shade and caption',h=>{h.img.style.zIndex='3';}],
 ['card after overlay','unsupported pseudo overlay: card::after',h=>{h.card.pseudo['::after']={...h.card.pseudo['::before'],zIndex:'5',backgroundImage:'none',backgroundColor:'white'};}],
 ['caption after overlay','unsupported pseudo overlay: destination-choice-caption::after',h=>{h.caption.pseudo['::after']={...h.card.pseudo['::before'],zIndex:'5'};}],
 ['ancestor after overlay','unsupported pseudo overlay: ancestor::after',h=>{h.ancestor.pseudo['::after']={...h.card.pseudo['::before'],zIndex:'5'};}],
 ['clipped caption','unsupported clip or mask: destination-choice-caption',h=>{h.caption.style.clipPath='inset(0 0 50% 0)';}],
 ['masked caption','unsupported clip or mask: destination-choice-caption',h=>{h.caption.style.maskImage='linear-gradient(transparent,black)';}],
 ['clipped card','unsupported clip or mask: card',h=>{h.card.style.clipPath='inset(0 0 50% 0)';}],
 ['masked ancestor','unsupported clip or mask: ancestor',h=>{h.ancestor.style.maskImage='linear-gradient(transparent,black)';}],
 ['clipped ancestor','unsupported clip or mask: ancestor',h=>{h.ancestor.style.clipPath='inset(0 0 50% 0)';}],
 ['blended shade','unsupported gradient paint',h=>{h.card.pseudo['::before'].backgroundColor='rgb(255, 255, 255)';h.card.pseudo['::before'].backgroundBlendMode='screen';}],
 ['inset shade shadow','unsupported gradient paint',h=>{h.card.pseudo['::before'].boxShadow='inset 0 0 0 100px white';}],
 ['auxiliary shadow','unsupported auxiliary paint coverage',h=>{h.mark.style.display='grid';h.mark.style.boxShadow='0 0 0 100px white';}],
 ['text stroke','unsupported caption shadow paint',h=>{h.city.style['-webkit-text-stroke-width']='5px';const get=h.city.style.getPropertyValue;h.city.style.getPropertyValue=function(k){return k==='-webkit-text-stroke-width'?'5px':get.call(this,k);};}],
 ['low opacity shade','unsupported compositing: shade',h=>{h.card.pseudo['::before'].opacity='.1';}]
];
for(const [name,reason,mutate]of paintAdversaries)test('gradient proof rejects '+name+' and verifies restored supported structure',()=>{
 const h=gradientPaintFixture(),callback=vm.runInNewContext('('+gradientProofCallback('tests/e2e/new-trip-release.spec.js')+')',h.env);const valid=callback([h.card])[0];assert.equal(valid.status,'VERIFIED',JSON.stringify(valid));assert(valid.samples.every(s=>s.worstCaseWhiteImageContrast>=4.5));
 mutate(h);const invalid=callback([h.card])[0];assert.equal(invalid.status,'UNVERIFIED');assert(invalid.issues.some(s=>s.includes(reason)),JSON.stringify(invalid));
 const restored=gradientPaintFixture(),run=vm.runInNewContext('('+gradientProofCallback('tests/e2e/new-trip-release.spec.js')+')',restored.env);assert.equal(run([restored.card])[0].status,'VERIFIED');
});

test('gradient proof rejects each supported caption backdrop filter and verifies restoration',()=>{
 for(const property of ['backdrop-filter','-webkit-backdrop-filter']){
  const h=gradientPaintFixture();h.env.CSS.supports=(candidate,value)=>candidate===property&&value==='none';
  const callback=vm.runInNewContext('('+gradientProofCallback('tests/e2e/new-trip-release.spec.js')+')',h.env);assert.equal(callback([h.card])[0].status,'VERIFIED');
  h.caption.style[property]='brightness(10)';const invalid=callback([h.card])[0];assert.equal(invalid.status,'UNVERIFIED');assert(invalid.issues.includes('unsupported backdrop filter: destination-choice-caption'),JSON.stringify(invalid));
  delete h.caption.style[property];const restored=callback([h.card])[0];assert.equal(restored.status,'VERIFIED');assert(restored.samples.every(s=>s.worstCaseWhiteImageContrast>=4.5));
 }
});
