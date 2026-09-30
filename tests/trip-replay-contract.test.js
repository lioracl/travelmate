'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function api(){
  const window={addEventListener(){},TravelMateEvents:null};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
  const sandbox={window,document,URLSearchParams,Date,Object,Number,String,Array,Math,Intl,setTimeout(){}};
  vm.runInNewContext(read('assets/trip-replay.js'),sandbox);
  return window.TravelMateTripReplay
}

test('Trip Replay distinguishes completed visits from planned and saved-only places',()=>{
  const replay=api().build({
    city:'Prague',country:'Czechia',
    activities:[
      {id:'a',date:'2026-09-02',time:'10:00',title:'Castle',done:true},
      {id:'b',date:'2026-09-02',time:'14:00',title:'Museum',done:false}
    ],
    savedPlaces:[
      {id:'p1',date:'2026-09-03',time:'11:00',name:'Cafe',done:true},
      {id:'p2',name:'Idea only',done:false}
    ],
    memories:[{localDate:'2026-09-02',note:'Great morning',attachments:[{name:'x.jpg'}]}],
    expenses:[{amount:10,currency:'EUR'},{amount:20,currency:'EUR'}]
  });
  assert.equal(replay.completed,2);
  assert.equal(replay.planned,3);
  assert.equal(replay.savedOnly,1);
  assert.equal(replay.memories,1);
  assert.equal(replay.attachments,1);
  assert.equal(replay.expenses,2);
  assert.equal(replay.expenseTotal,30);
  assert.equal(replay.days.length,2);
});


test('Trip Replay consumes the shared Trip Analytics contract when it is available',()=>{
  const window={addEventListener(){},TravelMateEvents:null,TravelMateTripAnalytics:{build(trip){return {completedVisits:1,movement:{walkingDistanceKm:4.2,transportDistanceKm:8.1,travelMinutes:42}}}}};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
  const sandbox={window,document,URLSearchParams,Date,Object,Number,String,Array,Math,Intl,setTimeout(){}};
  vm.runInNewContext(read('assets/trip-replay.js'),sandbox);
  const replay=window.TravelMateTripReplay.build({activities:[{id:'a',date:'2026-09-02',time:'10:00',title:'Castle',done:true}],savedPlaces:[],memories:[],expenses:[]});
  assert.equal(replay.analytics.movement.walkingDistanceKm,4.2);
  assert.equal(replay.analytics.movement.transportDistanceKm,8.1);
  assert.equal(replay.analytics.movement.travelMinutes,42);
  assert.match(window.TravelMateTripReplay.prompt(replay),/ק״מ/);
});

test('Trip Replay prompt explicitly forbids inventing visits',()=>{
  const module=api(),data=module.build({city:'Prague',activities:[{id:'a',date:'2026-09-02',title:'Castle',done:true}],savedPlaces:[],memories:[],expenses:[]});
  const text=module.prompt(data);
  assert.match(text,/בלי להמציא ביקורים/);
  assert.match(text,/רק אם סומן כהושלם/);
  assert.match(text,/Castle/);
});

test('Trip Replay is isolated and adds no important CSS escalation',()=>{
  const app=read('assets/app.js'),css=read('assets/trip-replay.css'),source=read('assets/trip-replay.js');
  assert.match(app,/trip-replay\.css/);
  assert.match(app,/trip-replay\.js/);
  assert.match(source,/data-trip-replay/);
  assert.match(source,/Trip Replay/);
  assert.doesNotMatch(css,/!important/);
});
