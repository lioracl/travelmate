const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function reminderApi(){
  const storage=new Map();
  const window={addEventListener(){}};
  const document={readyState:'loading',addEventListener(){},querySelector(){return null},getElementById(){return null}};
  const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
  const context={window,document,localStorage,navigator:{},location:{search:'?id=qa',href:'https://example.test/trip/custom/index.html?id=qa'},URL,URLSearchParams,setInterval(){return 1},clearInterval(){},requestAnimationFrame(fn){fn()},Date,console};
  vm.runInNewContext(read('assets/fixed-reminders.js'),context);
  return{api:window.TravelMateFixedReminders,storage};
}

test('fixed reminder helper only accepts explicit future fixed commitments',()=>{
  const {api}=reminderApi();
  assert.equal(api.scheduleMode({scheduleMode:'fixed'}),'fixed');
  assert.equal(api.scheduleMode({scheduleMode:'window'}),'window');
  assert.equal(api.enabled({scheduleMode:'fixed',date:'2026-10-03',time:'14:00',reminderEnabled:true,done:false}),true);
  assert.equal(api.enabled({scheduleMode:'flexible',date:'2026-10-03',time:'14:00',reminderEnabled:true}),false);
  assert.equal(api.enabled({scheduleMode:'window',date:'2026-10-03',time:'14:00',reminderEnabled:true}),false);
  assert.equal(api.enabled({scheduleMode:'fixed',date:'2026-10-03',time:'14:00',reminderEnabled:false}),false);
  assert.equal(api.enabled({scheduleMode:'fixed',date:'2026-10-03',time:'14:00',reminderEnabled:true,done:true}),false);
});
test('due reminder stays inside its lead window and excludes stale events',()=>{
  const {api}=reminderApi(),trip={id:'qa',activities:[
    {id:'soon',scheduleMode:'fixed',date:'2026-10-03',time:'14:00',reminderEnabled:true,reminderLeadMinutes:45},
    {id:'later',scheduleMode:'fixed',date:'2026-10-03',time:'16:00',reminderEnabled:true,reminderLeadMinutes:45},
    {id:'flex',scheduleMode:'flexible',date:'2026-10-03',time:'13:50',reminderEnabled:true}
  ],savedPlaces:[]};
  const due=api.dueReminders(trip,new Date('2026-10-03T13:20:00'));
  assert.equal(due.length,1);
  assert.equal(due[0].record.id,'soon');
  assert.equal(due[0].leadMinutes,45);
  assert.equal(api.dueReminders(trip,new Date('2026-10-03T14:01:00')).length,0);
});

test('reminder runtime is core-loaded, consent driven and cacheable offline',()=>{
  const app=read('assets/app.js'),sw=read('sw.js'),source=read('assets/fixed-reminders.js'),css=read('assets/fixed-reminders.css');
  assert.match(app,/baseStyles=\[[^\]]*'fixed-reminders\.css'/);
  assert.match(app,/loadSequence\(\[[^\]]*'fixed-reminders\.js'/);
  assert.match(sw,/\.\/assets\/fixed-reminders\.css/);
  assert.match(sw,/\.\/assets\/fixed-reminders\.js/);
  assert.match(sw,/notificationclick/);
  assert.match(source,/function onReminderClick\(button\)[\s\S]*requestPermission\(\)\.then/);
  assert.doesNotMatch(source,/function start\(\)[^{]*\{[^}]*requestPermission/);
  assert.equal((css.match(/!important/g)||[]).length,0);
});
test('future eligibility is revalidated at action time',()=>{
  const {api}=reminderApi(),record={id:'fixed',scheduleMode:'fixed',date:'2026-10-03',time:'14:00',reminderEnabled:false};
  assert.equal(api.futureFixed(record,new Date('2026-10-03T13:59:00')),true);
  assert.equal(api.futureFixed(record,new Date('2026-10-03T14:00:00')),false);
  assert.equal(api.futureFixed(Object.assign({},record,{scheduleMode:'window'}),new Date('2026-10-03T13:00:00')),false);
});

test('trip selection fails closed on owner ambiguity and respects resolved owner',()=>{
  const {api}=reminderApi(),trips=[{id:'same',ownerId:'owner-a'},{id:'same',ownerId:'owner-b'}];
  assert.equal(api.selectTrip('same',trips,'',false),null);
  assert.equal(api.selectTrip('same',trips,'owner-b',true).ownerId,'owner-b');
  assert.equal(api.selectTrip('unique',[{id:'unique'}],'',false).id,'unique');
});

test('fired reminder identity is a structured owner trip record tuple',()=>{
  const {api}=reminderApi(),record={id:'event',date:'2026-10-03',time:'14:00',reminderLeadMinutes:45};
  const first=api.firedKey({ownerId:'a|b',id:'c'},'activity',record);
  const second=api.firedKey({ownerId:'a',id:'b|c'},'activity',record);
  assert.notEqual(first,second);
  assert.deepEqual(JSON.parse(first).slice(0,3),['a|b','c','activity']);
});
test('owner binding, permission provenance and notification click stay fail-closed',()=>{
  const source=read('assets/fixed-reminders.js'),sw=read('sw.js');
  assert.match(source,/travelMateTripReady/);
  assert.match(source,/activeTripIdentity/);
  assert.match(source,/getCachedTrips\?cloud\.getCachedTrips\(\):trips/);
  assert.match(source,/turnOn&&!futureFixed\(record\)[\s\S]*return[\s\S]*requestPermission\(\)\.then/);
  assert.equal((source.match(/Notification\.requestPermission/g)||[]).length,1);
  assert.match(source,/TravelMateTripStore[\s\S]*updateTrip/);
  assert.match(source,/ownerId:trip\.ownerId/);
  assert.match(sw,/function reminderNotificationTarget\(raw\)/);
  assert.match(sw,/target\.origin!==self\.location\.origin/);
  assert.match(sw,/target\.pathname\.slice\(base\.pathname\.length\)/);
  assert.match(sw,/match\.navigate\(target\.href\)/);
});
