'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const contextSource=fs.readFileSync('assets/trip-context.js','utf8');
const analyticsSource=fs.readFileSync('assets/trip-analytics.js','utf8');
function loadAnalytics(){const window={dispatchEvent(){}};const sandbox={window,Date,Object,Number,String,Array,Math,URL,Set,CustomEvent:function(type){this.type=type}};vm.runInNewContext(contextSource,sandbox);vm.runInNewContext(analyticsSource,sandbox);return window.TravelMateTripAnalytics}
function sampleTrip(){return {activities:[
{id:'a1',title:'Museum',date:'2026-10-01',time:'09:00',done:true,lat:50.08,lon:14.42},
{id:'a2',title:'Cafe',date:'2026-10-01',time:'12:00',done:true,lat:50.09,lon:14.43,travelMode:'walk'},
{id:'a3',title:'Not visited',date:'2026-10-01',time:'15:00',done:false,lat:51,lon:15}
],savedPlaces:[{id:'p1',name:'Old Town',date:'2026-10-02',time:'10:00',done:true,lat:50.081,lon:14.421}],expenses:[
{id:'e1',amount:10,currency:'EUR',category:'אוכל/קפה',date:'2026-10-01'},
{id:'e2',amount:40,currency:'ILS',category:'קניות/מזכרות',date:'2026-10-01'},
{id:'e3',amount:5,currency:'EUR',category:'תחבורה',date:'2026-10-02'}
]}}
test('Trip Summary V2 keeps money grouped by currency and category',()=>{const data=loadAnalytics().build(sampleTrip());assert.equal(data.expenses.count,3);assert.equal(data.expenses.totals.EUR,15);assert.equal(data.expenses.totals.ILS,40);assert.equal(data.expenses.categories.find(x=>x.name==='קניות').totals.ILS,40);assert.equal(data.status.expenses,'confirmed')});
test('Trip Summary V2 route includes only completed visits with stored coordinates',()=>{const data=loadAnalytics().build(sampleTrip());assert.equal(data.route.pointCount,3);assert.equal(data.route.points.some(x=>x.title==='Not visited'),false);assert.equal(data.route.pointStatus,'confirmed');assert.equal(data.route.pathStatus,'estimated')});
test('Trip Summary V2 exposes daily confirmed visits, movement and expenses separately',()=>{const data=loadAnalytics().build(sampleTrip());const first=data.summaryDays.find(x=>x.date==='2026-10-01');assert.equal(first.completedVisits,2);assert.equal(first.expenseCount,2);assert.equal(first.expenseTotals.EUR,10);assert.equal(first.expenseTotals.ILS,40);assert.ok(first.movement.distanceKm>0)});
test('Trip Replay never merges unlike currencies into one total',()=>{const analytics=loadAnalytics();const window={addEventListener(){},TravelMateEvents:null,TravelMateTripAnalytics:analytics};const document={readyState:'loading',addEventListener(){},getElementById(){return null}};const sandbox={window,document,navigator:{onLine:true},location:{search:'',pathname:'/trip/custom/'},URLSearchParams,Date,Object,Number,String,Array,Math,Intl,Promise,setTimeout(){}};vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),sandbox);const replay=window.TravelMateTripReplay.build(sampleTrip());assert.equal(replay.expenseTotal,0);assert.equal(replay.expenseLabels.length,2);assert.match(replay.expenseLabel,/EUR|€/);assert.match(replay.expenseLabel,/ILS|₪/)});
test('Trip Summary route map is on-demand, factual and does not request location',()=>{const source=fs.readFileSync('assets/trip-replay.js','utf8');const css=fs.readFileSync('assets/trip-replay.css','utf8');assert.match(source,/data-trip-summary-map-toggle/);assert.match(source,/analytics\.route/);assert.match(source,/OpenFreeMap|openfreemap/);assert.doesNotMatch(source,/getCurrentPosition|navigator\.geolocation/);assert.match(source,/travelmate-summary-route/);assert.match(css,/min-height:44px/);assert.doesNotMatch(css,/!important/)});
test('Trip Replay fallback also keeps mixed and unknown currencies separate',()=>{const window={addEventListener(){},TravelMateEvents:null};const document={readyState:'loading',addEventListener(){},getElementById(){return null}};const sandbox={window,document,navigator:{onLine:true},location:{search:'',pathname:'/trip/custom/'},URLSearchParams,Date,Object,Number,String,Array,Math,Intl,Promise,setTimeout(){}};vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),sandbox);const replay=window.TravelMateTripReplay.build({expenses:[{amount:4,currency:'EUR'},{amount:7,currency:'ILS'},{amount:3,currency:''}]});assert.equal(replay.expenseTotal,0);assert.equal(replay.expenseLabels.length,3);assert.match(replay.expenseLabel,/מטבע לא ידוע/)});
test('Trip Summary does not label an invalid currency as EUR',()=>{const data=loadAnalytics().build({expenses:[{amount:9,currency:'??',category:'אחר',date:'2026-10-01'}]});assert.equal(data.expenses.totals.UNKNOWN,9);assert.equal(data.expenses.totals.EUR,undefined)});
test('Unscheduled completed saved places stay ideas, not completed visits',()=>{const analytics=loadAnalytics().build({savedPlaces:[{id:'p',name:'Idea',done:true,lat:50,lon:14}]});assert.equal(analytics.completedVisits,0);const window={addEventListener(){},TravelMateEvents:null,TravelMateTripAnalytics:loadAnalytics()};const document={readyState:'loading',addEventListener(){},getElementById(){return null}};const sandbox={window,document,navigator:{onLine:true},location:{search:'',pathname:'/trip/custom/'},URLSearchParams,Date,Object,Number,String,Array,Math,Intl,Promise,setTimeout(){}};vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),sandbox);const replay=window.TravelMateTripReplay.build({savedPlaces:[{id:'p',name:'Idea',done:true}]});assert.equal(replay.completed,0);assert.equal(replay.savedOnly,1)});
test('Mate Replay prompt excludes private memory note text and note fallback cannot become a visit title',()=>{const analytics=loadAnalytics();const window={addEventListener(){},TravelMateEvents:null,TravelMateTripAnalytics:analytics};const document={readyState:'loading',addEventListener(){},getElementById(){return null}};const sandbox={window,document,navigator:{onLine:true},location:{search:'',pathname:'/trip/custom/'},URLSearchParams,Date,Object,Number,String,Array,Math,Intl,Promise,setTimeout(){}};vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),sandbox);const api=window.TravelMateTripReplay,data=api.build({activities:[{id:'a',date:'2026-10-01',done:true,note:'PRIVATE_VISIT_NOTE'}],memories:[{date:'2026-10-01',note:'PRIVATE_MEMORY_NOTE'}]});assert.doesNotMatch(api.prompt(data),/PRIVATE_MEMORY_NOTE/);assert.doesNotMatch(api.prompt(data),/PRIVATE_VISIT_NOTE/)});
test('Summary map groups line geometry by day and invalidates stale async loads',()=>{const source=fs.readFileSync('assets/trip-replay.js','utf8');assert.match(source,/byDate\[point\.date\]/);assert.match(source,/FeatureCollection/);assert.match(source,/day\.length>1/);assert.match(source,/summaryMapRequestId/);assert.match(source,/requestId!==summaryMapRequestId/);assert.match(source,/summaryMap\.remove\(\)/);assert.match(source,/מפת נקודות הביקור/)});

function loadReplay(analytics){
  const window={addEventListener(){},TravelMateEvents:null,TravelMateTripAnalytics:analytics};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
  vm.runInNewContext(fs.readFileSync('assets/trip-replay.js','utf8'),{window,document,URLSearchParams,Date,Object,Number,String,Array,Math,Intl,setTimeout(){}});
  return window.TravelMateTripReplay;
}
const invalidAmounts=[undefined,null,'','  \t\n',true,false,[],[5],{},NaN,Infinity,-Infinity,'NaN','Infinity',-1,'-2'];
function expenseRecords(amounts,date='2026-10-01'){
  return amounts.map((amount,index)=>Object.freeze({id:'validity-'+index,amount,currency:'EUR',category:'אוכל/קפה',date}));
}
function plain(value){return JSON.parse(JSON.stringify(value))}

test('Expense validity rejects coercible non-money values individually in Analytics and Replay fallback',()=>{
  const analytics=loadAnalytics(),fallback=loadReplay();
  for(const amount of invalidAmounts){
    const trip={expenses:expenseRecords([amount])};
    const data=analytics.build(trip),replay=fallback.build(trip);
    assert.equal(data.expenses.count,0,'Analytics accepted '+String(amount));
    assert.deepEqual(plain(data.expenses.totals),{});
    assert.equal(data.expenses.status,'unknown');
    assert.equal(data.status.expenses,'unknown');
    assert.equal(data.summaryDays.length,0);
    assert.equal(replay.expenses,0,'Replay accepted '+String(amount));
    assert.equal(replay.expenseLabels.length,0);
    assert.equal(replay.expenseLabel,'');
    assert.equal(replay.expenseCurrency,'');
  }
});

test('Expense validity keeps finite numeric strings, zero, currency policy, categories and daily counts aligned without mutation',()=>{
  const expenses=[...expenseRecords([0,'0',5,' 2.5 ','1e1','0x10']),...expenseRecords(invalidAmounts,'2026-10-02'),
    Object.freeze({amount:7,currency:'ILS',category:'קניות/מזכרות',date:'2026-10-02'}),
    Object.freeze({amount:3,currency:'??',category:'אחר',date:'2026-10-02'}),null,false,0];
  Object.freeze(expenses);
  const trip=Object.freeze({expenses}),before=structuredClone(trip),analytics=loadAnalytics(),data=analytics.build(trip);
  assert.equal(data.expenses.count,8);
  assert.deepEqual(plain(data.expenses.totals),{EUR:33.5,ILS:7,UNKNOWN:3});
  assert.equal(data.expenses.status,'confirmed');
  assert.equal(data.status.expenses,'confirmed');
  assert.deepEqual(plain(data.expenses.categories).map(x=>[x.name,x.count]),[['אוכל',6],['אחר',1],['קניות',1]]);
  assert.deepEqual(plain(data.expenses.days),[{date:'2026-10-01',count:6,totals:{EUR:33.5}},{date:'2026-10-02',count:2,totals:{ILS:7,UNKNOWN:3}}]);
  assert.deepEqual(plain(data.summaryDays).map(x=>[x.date,x.expenseCount,x.expenseTotals]),[['2026-10-01',6,{EUR:33.5}],['2026-10-02',2,{ILS:7,UNKNOWN:3}]]);
  for(const api of [loadReplay(analytics),loadReplay()]){
    const replay=api.build(trip);
    assert.equal(replay.expenses,8);
    assert.equal(replay.expenseTotal,0);
    assert.equal(replay.expenseLabels.length,3);
    assert.match(replay.expenseLabel,/מטבע לא ידוע/);
    assert.match(api.narrative(replay),/נרשמו 8 הוצאות/);
  }
  assert.deepEqual(trip,before);
});

test('Expense validity preserves verified numeric and string zero, but empty summaries never fall back to rejected raw expenses',()=>{
  for(const amount of [0,'0']){
    const trip={expenses:expenseRecords([amount])},analytics=loadAnalytics(),data=analytics.build(trip);
    assert.equal(data.expenses.count,1);
    assert.equal(data.expenses.totals.EUR,0);
    assert.equal(data.status.expenses,'confirmed');
    for(const api of [loadReplay(analytics),loadReplay()]){
      const replay=api.build(trip);
      assert.equal(replay.expenses,1);
      assert.equal(replay.expenseTotal,0);
      assert.equal(replay.expenseCurrency,'EUR');
      assert.equal(replay.expenseLabels.length,1);
    }
  }
  const analytics={build(){return {expenses:{count:0,totals:{},status:'unknown'},status:{expenses:'unknown'}}}};
  const replay=loadReplay(analytics).build({expenses:expenseRecords([5,true,null])});
  assert.equal(replay.expenses,0);
  assert.equal(replay.expenseLabels.length,0);
  assert.equal(replay.expenseTotal,0);
  assert.equal(replay.expenseCurrency,'');
});

test('All-invalid expenses produce no expense narrative or daily amounts while completed visits remain visible',()=>{
  const trip={expenses:expenseRecords(invalidAmounts),activities:[{date:'2026-10-01',done:true,title:'Museum'}]},analytics=loadAnalytics(),data=analytics.build(trip);
  assert.equal(data.expenses.count,0);
  assert.equal(data.expenses.categories.length,0);
  assert.equal(data.expenses.days.length,0);
  assert.equal(data.summaryDays[0].completedVisits,1);
  assert.equal(data.summaryDays[0].expenseCount,0);
  assert.deepEqual(plain(data.summaryDays[0].expenseTotals),{});
  for(const api of [loadReplay(analytics),loadReplay()]){
    const replay=api.build(trip);
    assert.equal(replay.expenses,0);
    assert.doesNotMatch(api.narrative(replay),/נרשמו .* הוצאות/);
  }
});
