'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const trip = (owner, id = 'trip-' + owner) => ({id, ownerId: owner, city: owner, country: 'Italy', start: '2026-10-21', end: '2026-10-24', days: 4, expenses: [], cloudRevision: 1});
function target() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    async dispatchEvent(event) { await Promise.all([...listeners.get(event.type) || []].map(fn => fn(event))); }
  };
}
async function boot() {
  const a = trip('A'), b = trip('B');
  const storage = new Map([['travelmate-active-user','A'], ['travelmate-trips', JSON.stringify([a])], ['travelmate-trips-user:A', JSON.stringify([a])], ['travelmate-trips-user:B', JSON.stringify([b])]]);
  const localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,String(value)), removeItem: key => storage.delete(key)};
  const nodes = [], alerts = [], calls = [], callbacks = [];
  let owner = 'A', rpc = async () => ({data:[{result_status:'saved',result_revision:2,result_updated_at:'2026-10-20T19:00:00Z'}]});
  const session = () => owner ? {user:{id:owner}} : null;
  const window = Object.assign(target(), {alert: text => alerts.push(text), crypto:{randomUUID:()=> 'synthetic-mutation'}, __travelMateSupabaseClient:{
    auth:{getSession:async()=>({data:{session:session()}}),onAuthStateChange:fn=>{callbacks.push(fn);return{};}},
    rpc:(name,params)=>{calls.push({name,params:plain(params)});return rpc();}
  }});
  const document = {
    body:{classList:{add(){},remove(){}},appendChild:node=>{node.isConnected=true;nodes.push(node);}},
    contains: node => !!node.isConnected,
    createElement() {
      const error = {textContent:''}, button = Object.assign(target(),{disabled:false});
      const editor = Object.assign(target(),{elements:{start:{value:a.start,focus(){}},end:{value:a.end}},querySelector:selector=>selector.includes('error')?error:button,querySelectorAll:()=>[]});
      const backdrop=Object.assign(target(),{isConnected:false,remove(){this.isConnected=false;},querySelector:()=>editor,editor,error,button});
      return backdrop;
    }
  };
  const context = vm.createContext({window,document,localStorage,console:{error(){}},setTimeout,clearTimeout,CustomEvent:function(type,options){this.type=type;this.detail=options?.detail;},
    currentSession:session(),renderedTrips:new Map([['trip-A',a]]),closeTripDateEditor:null,
    escapeText:String,daysBetween:(start,end)=>Math.floor((new Date(end)-new Date(start))/86400000)+1,
    renderTrips:trips=>{context.renderedTrips=new Map(trips.map(t=>[String(t.id),t]));}
  });
  vm.runInContext(fs.readFileSync(path.join(root,'assets/cloud-sync.js'),'utf8'),context);
  context.cloud=window.TravelMateCloud;
  const source=fs.readFileSync(path.join(root,'assets/home.js'),'utf8');
  const begin=source.indexOf('  function editTripDates('), end=source.indexOf('  document.addEventListener',begin);
  assert(begin>=0 && end>begin);
  vm.runInContext(source.slice(begin,end),context);
  await context.cloud.onAuthChange((event,value)=>{context.currentSession=value;});
  return {
    context,window,localStorage,alerts,calls,nodes,
    open(record=context.cloud.getLocalTrips()[0]) {context.editTripDates(record);const node=nodes.at(-1);node.editor.elements.start.value='2026-10-22';return node;},
    submit:node=>node.editor.dispatchEvent({type:'submit',preventDefault(){}}),
    async emit(next,event=next?'SIGNED_IN':'SIGNED_OUT') {owner=next;callbacks.forEach(fn=>fn(event,session()));await new Promise(resolve=>setTimeout(resolve,2));context.renderedTrips=new Map(context.cloud.getLocalTrips().map(t=>[String(t.id),t]));},
    cache:user=>JSON.parse(storage.get('travelmate-trips-user:'+user)),
    rpc:fn=>{rpc=fn;}
  };
}
test('A to B stale date save cannot contaminate B cache or issue a cloud write',async()=>{
  const h=await boot(), editor=h.open(); await h.emit('B'); const before=h.cache('B');
  await h.submit(editor);
  assert.deepEqual(h.cache('B'),before);
  assert.equal(h.cache('A')[0].start,'2026-10-21');
  assert.equal(h.calls.length,0); assert.equal(editor.isConnected,false); assert.equal(h.alerts.length,1);
});
for(const sequence of [[null,'B'],['B','A'],[null,'A']])test('closed auth epoch cannot revive after '+JSON.stringify(sequence),async()=>{
  const h=await boot(),editor=h.open();
  for(const owner of sequence)await h.emit(owner);
  const before=h.cache(sequence.at(-1));await h.submit(editor);
  assert.deepEqual(h.cache(sequence.at(-1)),before);assert.equal(h.calls.length,0);
});
test('same-account token refresh preserves entered dates and saves normally',async()=>{
  const h=await boot(),editor=h.open();await h.emit('A','TOKEN_REFRESHED');
  assert.equal(editor.isConnected,true);assert.equal(editor.editor.elements.start.value,'2026-10-22');
  await h.submit(editor);assert.equal(h.cache('A')[0].start,'2026-10-22');assert.equal(h.calls.length,1);
});
test('same account canonical refresh preserves unrelated fields while applying dates',async()=>{
  const h=await boot(),editor=h.open();
  h.context.cloud.upsertLocalTrip({...trip('A'),expenses:[{id:'fresh',amount:7}]});
  await h.submit(editor);assert.deepEqual(h.cache('A')[0].expenses,[{id:'fresh',amount:7}]);
});
test('replaced trip owner or removed trip cancels stale editor',async()=>{
  for(const records of [[trip('B','trip-A')],[]]){
    const h=await boot(),editor=h.open();h.context.cloud.setLocalTrips(records);const before=h.cache('A');
    await h.submit(editor);assert.deepEqual(h.cache('A'),before);assert.equal(h.calls.length,0);assert.equal(h.alerts.length,1);
  }
});
test('opening another trip closes the first editor and detached submit stays inert',async()=>{
  const h=await boot();h.context.cloud.upsertLocalTrip(trip('A','second'));const first=h.open(),second=h.open(h.context.cloud.getLocalTrips()[1]);
  await h.submit(first);assert.equal(h.calls.length,0);await h.submit(second);assert.equal(h.calls.length,1);assert.equal(h.cache('A').find(t=>t.id==='trip-A').start,'2026-10-21');
});
for(const event of ['click','popstate','pagehide'])test('cancel/navigation '+event+' prevents retained form submission',async()=>{
  const h=await boot(),editor=h.open();
  if(event==='click')await editor.button.dispatchEvent({type:'click'});else await h.window.dispatchEvent({type:event});
  await h.submit(editor);assert.equal(h.calls.length,0);assert.equal(h.cache('A')[0].start,'2026-10-21');
});
test('rapid repeated submit performs only one mutation',async()=>{
  const h=await boot(),editor=h.open();await Promise.all([h.submit(editor),h.submit(editor)]);assert.equal(h.calls.length,1);
});
for(const reject of [false,true])test('deferred '+(reject?'failure':'success')+' after A-B-A never updates the new epoch',async()=>{
  const h=await boot();let release;h.rpc(()=>new Promise((resolve,rejectPromise)=>{release=reject?rejectPromise:resolve;}));
  const pending=h.submit(h.open());while(!release)await tick();
  await h.emit('B');await h.emit('A');const before=h.cache('A');
  release(reject?new Error('synthetic failure'):{data:[{result_status:'saved',result_revision:99}]});
  await pending;assert.deepEqual(h.cache('A'),before);assert(h.cache('B').every(t=>t.ownerId==='B'));
});
test('save failure keeps local dates and reopening permits retry',async()=>{
  const h=await boot();h.rpc(async()=>{throw Error('synthetic failure');});await h.submit(h.open());
  assert.equal(h.cache('A')[0].start,'2026-10-22');assert.equal(h.cache('A')[0].syncStatus,'failed');
  h.rpc(async()=>({data:[{result_status:'saved',result_revision:2}]}));await h.submit(h.open());
  assert.equal(h.cache('A')[0].syncStatus,'synced');assert.equal(h.calls.length,2);
});
test('cross-tab owner changes invalidate the editor even when owner returns',async()=>{
  const h=await boot(),editor=h.open();h.localStorage.setItem('travelmate-active-user','B');
  await h.window.dispatchEvent({type:'storage',key:'travelmate-active-user'});
  h.localStorage.setItem('travelmate-active-user','A');await h.submit(editor);assert.equal(h.calls.length,0);
});
test('commit guard rejects account mismatch even before an account event is delivered',async()=>{
  const h=await boot(),editor=h.open();h.localStorage.setItem('travelmate-active-user','B');const before=h.cache('B');
  await h.submit(editor);assert.deepEqual(h.cache('B'),before);assert.equal(h.calls.length,0);assert.equal(h.alerts.length,1);
});
test('shared trip retains its distinct owner when the editing account is unchanged',async()=>{
  const h=await boot();h.context.cloud.setLocalTrips([trip('shared-owner')]);
  await h.submit(h.open());assert.equal(h.cache('A')[0].ownerId,'shared-owner');assert.equal(h.calls[0].params.p_owner_id,'shared-owner');
});
test('cached same-account edit without a live session stays local',async()=>{
  const h=await boot();h.context.currentSession=null;await h.submit(h.open());
  assert.equal(h.cache('A')[0].start,'2026-10-22');assert.equal(h.calls.length,0);
});
test('Escape closes the editor and a retained submit cannot save',async()=>{
  const h=await boot(),editor=h.open();await editor.editor.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){}});
  await h.submit(editor);assert.equal(h.calls.length,0);assert.equal(h.cache('A')[0].start,'2026-10-21');
});
