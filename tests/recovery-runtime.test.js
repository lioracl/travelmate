'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8').replaceAll(String.fromCharCode(13),'');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
function gpsHarness(){
  const consent=deferred(),status={classList:{remove(){},add(){}},textContent:''};
  const context={gpsRequestPending:false,gpsButton:{setAttribute(){},removeAttribute(){}},controls:{executeButton:{}},status,results:{},navigator:{onLine:true},panel:{dataset:{}},map:null,lastGps:null,lastPoint:null,searchLocationContext:null,calls:0,searches:0,
    requestGpsConsent:()=>consent.promise,currentPosition:async()=>{context.calls++;return{coords:{latitude:32.1,longitude:34.8,accuracy:15}}},searchAt:async()=>{context.searches++;}};
  const source=read('assets/nearby.js').split(String.fromCharCode(10)).find(line=>line.includes('async function executeGpsSearch()'));
  vm.runInNewContext(source+'; run=executeGpsSearch;',context);return{context,consent};
}
test('deterministic GPS mock: repeated clicks share one active consent/search flow',async()=>{
  const {context,consent}=gpsHarness();const first=context.run();await context.run();assert.equal(context.gpsRequestPending,true);assert.equal(context.calls,0);
  consent.resolve('once');await first;assert.equal(context.calls,1);assert.equal(context.searches,1);assert.equal(context.gpsRequestPending,false);
});
test('deterministic GPS mock: denial and position failure release the request guard',async()=>{
  const {context,consent}=gpsHarness();const first=context.run();consent.resolve('denied');await first;assert.equal(context.calls,0);assert.equal(context.gpsRequestPending,false);
  context.requestGpsConsent=async()=> 'once';context.currentPosition=async()=>{throw new Error('mock timeout')};await context.run();assert.match(context.status.textContent,/mock timeout/);assert.equal(context.gpsRequestPending,false);
});
function expenseHarness(){
  const upload=deferred(),status={textContent:''},button={},preview={};let saves=0;
  const form={dataset:{},amount:{value:'42.50'},currency:{value:'EUR'},category:{value:'אוכל'},date:{value:'2026-10-12'},note:{value:'Deterministic QA'},reportValidity:()=>true,querySelector:()=>button,setAttribute(){},removeAttribute(){},reset(){}};
  const panel={querySelector:selector=>selector==='[data-receipt-status]'?status:preview};
  const context={form,panel,Number,Date,console:{warn(){}},state:{expenses:[]},experienceContext:()=>({owner:'qa'}),experienceIsCurrent:()=>true,selectedReceiptFile:()=>({name:'mock.png',type:'image/png',size:10}),expenseById:()=>null,storePrivateReceiptWithRetry:()=>upload.promise,deleteLocalReceipt:async()=>{},removePrivateReceipt:async()=>{},putLocalReceipt:async()=>{throw Error('mock disk failure')},writeJson(){},storageKey:x=>x,saveTripData:()=>{saves++},localDateValue:()=> '2026-10-12',renderExpenseList(){},renderBudgetColumns(){},renderSummary(){},toast(){}};
  const source=read('assets/trip-experience.js'),start=source.indexOf('    var expenseSavePending = false;'),end=source.indexOf('    renderExpenseList();'+String.fromCharCode(10)+'    renderBudgetCharts();',start);
  assert.ok(start>=0&&end>start);vm.runInNewContext(source.slice(start,end),context);
  return{context,form,button,status,upload,saves:()=>saves};
}
test('deterministic receipt mock: overlapping submits persist exactly one expense',async()=>{
  const h=expenseHarness(),event={preventDefault(){}};const first=h.form.onsubmit(event);await h.form.onsubmit(event);assert.equal(h.button.disabled,true);h.upload.resolve('private/mock');await first;
  assert.equal(h.context.state.expenses.length,1);assert.equal(h.saves(),1);assert.equal(h.button.disabled,false);assert.equal(h.context.state.expenses[0].amount,42.5);
});
test('deterministic receipt mock: failed receipt storage permits retry without partial expense',async()=>{
  const h=expenseHarness(),event={preventDefault(){}};const first=h.form.onsubmit(event);h.upload.reject(Error('mock offline'));await first;assert.equal(h.saves(),0);assert.equal(h.button.disabled,false);
  h.context.selectedReceiptFile=()=>null;await h.form.onsubmit(event);assert.equal(h.saves(),1);assert.equal(h.context.state.expenses.length,1);
});
test('expense validation rejects nonpositive and nonfinite amounts without persistence',async()=>{
  for(const value of ['0','-1','Infinity','bad']){const h=expenseHarness();h.form.amount.value=value;await h.form.onsubmit({preventDefault(){}});assert.equal(h.saves(),0);assert.equal(h.context.state.expenses.length,0);}
});
test('receipt completion after account switch cannot persist to another owner',async()=>{
  const h=expenseHarness();const first=h.form.onsubmit({preventDefault(){}});h.context.experienceIsCurrent=()=>false;h.upload.resolve('private/mock');await first;assert.equal(h.saves(),0);assert.equal(h.context.state.expenses.length,0);
});
function planHarness(){
  const source=read('assets/plan-ux-polish.js'),start=source.indexOf('function nextPlanItem('),end=source.indexOf('function ensureNextBanner(',start);const ctx={window:{TravelMateToday:require('../assets/custom-trip.js')}};
  vm.runInNewContext(source.slice(start,end)+'; select=nextPlanItem;',ctx);return ctx.select;
}
test('Plan focus reuses Today for current, future, completion and flexible/window exclusions',()=>{
  const select=planHarness(),now=new Date(2026,9,12,10,30),trip={start:'2026-10-12',end:'2026-10-14',activities:[{id:'current',title:'Current',date:'2026-10-12',time:'10:00',duration:60,scheduleMode:'fixed'},{id:'flex',title:'Flexible',date:'2026-10-13',time:'08:00',scheduleMode:'flexible'},{id:'window',title:'Window',date:'2026-10-13',time:'09:00',scheduleMode:'window'},{id:'future',title:'Future',date:'2026-10-13',time:'12:00',scheduleMode:'fixed'}],savedPlaces:[]};
  assert.equal(select(trip,now).id,'current');trip.activities[0].done=true;assert.equal(select(trip,now).id,'future');trip.activities[3].done=true;assert.equal(select(trip,now),null);
});
test('Plan navigation uses valid coordinates and never converts blank coordinates to zero',()=>{
  const source=read('assets/plan-ux-polish.js'),start=source.indexOf('function navigationUrl('),end=source.indexOf('function scheduleMode(',start),helper={window:{}};vm.runInNewContext(read('assets/trip-context.js'),helper);
  const ctx={context:()=>helper.window.TravelMateTripContext,safeUrl:()=>'',encodeURIComponent};vm.runInNewContext(source.slice(start,end)+'; navigate=navigationUrl;',ctx);
  assert.match(decodeURIComponent(ctx.navigate({lat:'',lon:'',title:'Museum'},{city:'Rome'})),/Museum, Rome/);
  assert.match(ctx.navigate({lat:0,lon:0},{}),/destination=0%2C0/);
});

test('expense inputs are snapshotted before delayed receipt upload',async()=>{const h=expenseHarness();const first=h.form.onsubmit({preventDefault(){}});h.form.amount.value='999';h.form.note.value='Later edit';h.upload.resolve('private/mock');await first;assert.equal(h.context.state.expenses[0].amount,42.5);assert.equal(h.context.state.expenses[0].note,'Deterministic QA');});
test('identity conversion remains exact without any exchange rates',()=>{const source=read('assets/trip-experience.js');const ctx={state:{rate:null,rates:{},ilsRates:{ILS:1}}};vm.runInNewContext(source.split('\n').filter(line=>/^  function (currencyRateInIls|convertCurrency|currencyConversionReady)\(/.test(line)).join('\n')+'; convert=convertCurrency; ready=currencyConversionReady;',ctx);assert.equal(ctx.convert(100,'EUR','EUR'),100);assert.equal(ctx.ready('EUR','EUR'),true);assert.equal(ctx.ready('EUR','ILS'),false);});
test('exhausted live providers mark rates unavailable without fabricating a rate',async()=>{const source=read('assets/trip-experience.js');const start=source.indexOf('  async function loadRate()'),end=source.indexOf('  function currencyRateInIls(',start);let renders=0;const ctx={state:{localCurrency:'EUR',rate:null,rates:{},ilsRates:{ILS:1}},readJson:()=>null,fetchRateJson:async()=>{throw Error('controlled provider failure')},renderCurrency(){},renderCurrencyConverter(){renders++},writeJson(){}};vm.runInNewContext(source.slice(start,end)+'; run=loadRate;',ctx);await ctx.run();assert.equal(ctx.state.rateUnavailable,true);assert.equal(ctx.state.rate,null);assert.equal(renders,1);});

test('unavailable-rate guard treats raw foreign expenses as pending without mutating data',()=>{const source=read('assets/trip-experience.js').split('\n').find(line=>line.includes('function pendingExpenseConversions('));const state={rates:{},expenses:[{amount:100,currency:'ILS'}]},before=JSON.stringify(state.expenses),ctx={state};vm.runInNewContext(source+'; pending=pendingExpenseConversions;',ctx);assert.equal(ctx.pending(),true);assert.equal(JSON.stringify(state.expenses),before);state.rates.ILS=4;assert.equal(ctx.pending(),false);state.expenses=[{amount:42,currency:'EUR'}];state.rates={};assert.equal(ctx.pending(),false);});
