'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function api(){
  const sandbox={window:{},Date,Object,Number,String,Array,Math,Set};
  vm.runInNewContext(read('assets/trip-context.js'),sandbox);
  return sandbox.window.TravelMateTripContext
}

test('Free Time Finder returns user-actionable gaps and preserves travel buffer',()=>{
  const ctx=api(),date='2026-10-10';
  const trip={activities:[
    {id:'a',date,time:'10:00',duration:60,scheduleMode:'fixed',lat:32.0853,lon:34.7818},
    {id:'b',date,time:'14:00',duration:60,scheduleMode:'fixed',lat:32.1093,lon:34.8555},
    {id:'flex',date,time:'12:00',duration:90,scheduleMode:'flexible'}
  ],savedPlaces:[]};
  const windows=ctx.freeTimeWindowsForDate(trip,date,{startTime:'09:00',endTime:'18:00',minimumMinutes:45,bufferMinutes:10});
  assert.ok(windows.length>=3);
  assert.equal(windows[0].startTime,'09:00');
  assert.equal(windows[0].endTime,'10:00');
  const middle=windows.find(item=>item.startTime==='11:00');
  assert.ok(middle);
  assert.ok(middle.endTime<'14:00');
  assert.equal(windows.some(item=>item.startTime==='12:00'),false);
});

test('Free Time Finder UI is isolated, user invoked and adds no important escalation',()=>{
  const app=read('assets/app.js'),source=read('assets/free-time-finder.js'),css=read('assets/free-time-finder.css');
  assert.match(app,/free-time-finder\.css/);
  assert.match(app,/free-time-finder\.js/);
  assert.match(source,/data-free-time-open/);
  assert.match(source,/freeTimeWindowsForDate/);
  assert.match(source,/travelmate:free-time-selected/);
  assert.match(css,/2\.3 Free Time Finder/);
  assert.doesNotMatch(css,/!important/)
});
