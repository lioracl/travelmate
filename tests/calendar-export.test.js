const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const calendar=require('../assets/calendar-export.js');
const trip={id:'trip-synthetic',city:'PRIVATE_CITY',timezone:'Pacific/Auckland',weather:{timezone:'Asia/Jerusalem'},account:'PRIVATE_ACCOUNT'};
const valid={id:'activity-synthetic',date:'2026-10-13',time:'23:30',title:'סיור שלום 🌍',scheduleMode:'fixed'};
const event=(extra={})=>calendar.deriveEvent(trip,{...valid,...extra});
const unfold=value=>value.replace(/\r\n /g,'');
test('valid event uses planner default and handles midnight without timezone inference',async()=>{
  const value=await event();
  assert.equal(value.start,'20261013T233000');assert.equal(value.end,'20261014T003000');
  assert.deepEqual(Object.keys(value).sort(),['description','end','location','start','title','uid']);
  assert.equal(value.location,'');assert.equal(value.description,'TravelMate');
});
for(const mode of ['fixed','booked','reservation','planned',undefined]){
  test('eligible exact canonical time: '+mode,async()=>assert.ok(await event({scheduleMode:mode})));
}
for(const mode of ['flexible','free','window','time-window','time_window']){
  test('no exact event for '+mode,async()=>assert.equal(await event({scheduleMode:mode,timeWindowStart:'10:00',timeWindowEnd:'12:00'}),null));
}
for(const key of ['timingMode','flexibility']){
  test('canonical mode alias '+key,async()=>{
    assert.equal(await event({scheduleMode:undefined,[key]:'flexible'}),null);
    assert.ok(await event({scheduleMode:undefined,[key]:'booked'}));
  });
}
for(const date of [undefined,null,'','2026-02-29','2026-04-31','2026-13-01','2026-00-01','2026-10-00','0000-01-01','26-10-13','2026-1-13','2026-10-13Z','2026-10-13\r\nX:1']){
  test('reject invalid date '+JSON.stringify(date),async()=>{assert.equal(await event({date}),null);assert.equal(calendar.eligible({...valid,date}),false)});
}
for(const time of [undefined,null,'','24:00','12:60','-1:00','1:30','12:30:00','12:30Z',' 12:30','12:30\nX:1']){
  test('reject missing or invalid time '+JSON.stringify(time),async()=>{assert.equal(await event({time}),null);assert.equal(calendar.eligible({...valid,time}),false)});
}
for(const duration of [undefined,null,'',60,90,'120',1440]){
  test('valid/default duration '+JSON.stringify(duration),async()=>{
    const value=await event({duration}),minutes=duration===undefined||duration===null||duration===''?60:Number(duration);
    assert.equal(new Date(value.end.slice(0,4)+'-'+value.end.slice(4,6)+'-'+value.end.slice(6,8)+'T'+value.end.slice(9,11)+':'+value.end.slice(11,13)+':00Z').getTime()-Date.parse(valid.date+'T'+valid.time+':00Z'),minutes*60000);
  });
}
for(const duration of [0,-1,Infinity,NaN,'nope',true,{},1.5,Number.MAX_SAFE_INTEGER]){
  test('reject invalid explicit duration '+String(duration),async()=>{assert.equal(await event({duration}),null);assert.equal(calendar.eligible({...valid,duration}),false)});
}
test('leap day and end of year are calendar arithmetic',async()=>{
  assert.equal((await event({date:'2024-02-29',time:'23:30'})).end,'20240301T003000');
  assert.equal((await event({date:'2026-12-31',time:'23:30'})).end,'20270101T003000');
});
test('UTF-8, RFC text escaping, CRLF, byte folding and safe UTC DTSTAMP',async()=>{
  const title='עברית 🌍,;\\ ראשון\r\nשני\rשלישי\nרביעי '+('שלום🌍'.repeat(35));
  const value=await event({title,locationName:'מקום,;\\',address:'רחוב\nאחד'});
  const ics=calendar.buildIcs(value,'2026-10-13T08:09:10Z'),plain=unfold(ics);
  assert.match(plain,/DTSTAMP:20261013T080910Z/);
  assert.ok(plain.includes('SUMMARY:'+title.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')));
  assert.ok(plain.includes('LOCATION:מקום\\,\\;\\\\\\, רחוב\\nאחד'));
  assert.equal(ics.replace(/\r\n/g,'').includes('\n'),false);assert.ok(ics.endsWith('\r\n'));
  for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
  assert.equal(Buffer.from(ics,'utf8').toString('utf8'),ics);
  assert.throws(()=>calendar.buildIcs(value,'invalid'),/DTSTAMP/);
});
test('allowlist excludes private and hidden metadata; reads no private getters',async()=>{
  const record={...valid,locationName:'מוזיאון',address:'רחוב 1',notes:'SECRET',internalNotes:'SECRET',documents:['SECRET'],budget:42,expenses:['SECRET'],accountIdentity:'SECRET',receipts:['SECRET'],messages:['SECRET'],preferences:'SECRET',health:'SECRET',gpsHistory:'SECRET',lat:51,lon:22,description:'SECRET',officialUrl:'https://secret.invalid',hidden:{token:'SECRET'}};
  Object.defineProperty(record,'privateNotes',{get(){throw Error('must not read')}});
  const before=JSON.stringify({...valid}),value=await calendar.deriveEvent(trip,record);
  assert.equal(value.location,'מוזיאון, רחוב 1');
  const output=JSON.stringify(value)+calendar.buildIcs(value)+calendar.googleUrl(value);
  for(const token of ['SECRET','PRIVATE_ACCOUNT','PRIVATE_CITY','secret.invalid','51,22','Pacific/Auckland','Asia/Jerusalem'])assert.ok(!output.includes(token));
  assert.equal(JSON.stringify(valid),before);
});
test('UID opaque, stable across edits, account independent and distinct by canonical identity',async()=>{
  const first=await event(),second=await event({title:'שם אחר',time:'10:00'});
  assert.equal(first.uid,second.uid);assert.match(first.uid,/^[a-f0-9]{64}@travelmate\.invalid$/);
  assert.ok(!first.uid.includes(valid.id));assert.ok(!first.uid.includes(trip.id));
  assert.notEqual(first.uid,(await event({id:'other'})).uid);
  assert.notEqual(first.uid,(await calendar.deriveEvent({...trip,id:'other'},valid)).uid);
  assert.equal(first.uid,(await calendar.deriveEvent({...trip,account:'other'},valid)).uid);
});
test('floating local fields and Google URL encode only minimum public fields',async()=>{
  const value=await event({title:'שלום &? /+🌍',address:'רחוב #1, ישראל'});
  const url=new URL(calendar.googleUrl(value)),ics=calendar.buildIcs(value);
  assert.equal(url.origin,'https://calendar.google.com');assert.equal(url.searchParams.get('text'),value.title);
  assert.equal(url.searchParams.get('dates'),'20261013T233000/20261014T003000');
  assert.equal(url.searchParams.get('location'),value.location);assert.equal(url.searchParams.get('details'),'TravelMate');
  assert.deepEqual([...url.searchParams.keys()].sort(),['action','dates','details','location','text']);
  assert.match(ics,/DTSTART:20261013T233000\r\nDTEND:20261014T003000/);
  assert.doesNotMatch(ics,/TZID|VTIMEZONE|DTSTART:.*Z|DTEND:.*Z/);
});
test('module works offline without OAuth, keys, SDK, provider or network calls',async()=>{
  const sandbox={TextEncoder,URLSearchParams,crypto:globalThis.crypto,module:{exports:{}},fetch(){throw Error('network forbidden')}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/calendar-export.js'),'utf8'),sandbox);
  const value=await sandbox.module.exports.deriveEvent(trip,valid);
  assert.match(sandbox.module.exports.buildIcs(value),/BEGIN:VEVENT/);
  const source=fs.readFileSync(require.resolve('../assets/calendar-export.js'),'utf8');
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|OAuth|api_key|gapi|googleapis|localStorage|sessionStorage/);
});
test('location objects cannot serialize hidden metadata',async()=>{
  assert.equal((await event({locationName:{private:'SECRET'},address:{private:'SECRET'}})).location,'');
});
