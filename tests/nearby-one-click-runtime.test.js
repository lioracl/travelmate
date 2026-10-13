'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function harness({closed = [], unknown = [], minutes = {}, live = null} = {}) {
  const document = {querySelectorAll: () => [], documentElement: {}, createElement: () => ({})};
  const window = {dispatchEvent() {}, TravelMateOpeningHours: {statusAtMinutes: hours => ({state: closed.includes(hours) ? 'closed' : unknown.includes(hours) ? 'unknown' : 'open'})}};
  vm.runInNewContext(read('assets/trip-context.js'), {window, Date});
  window.TravelMateTripContext = {...window.TravelMateTripContext,
    estimateTravelMinutes: (from, to) => ({minutes: minutes[to.id] || 5, source: 'estimate'})};
  if (live) window.TravelMateRouting = {matrix: live};
  vm.runInNewContext(read('assets/nearby.js'), {window, document, navigator: {onLine: true},
    MutationObserver: class {observe() {}}, CustomEvent: class {}, URL, Map, Set, console});
  const results = {dataset: {}, querySelectorAll: () => [], querySelector: () => null,
    removeAttribute() {}, appendChild(node) {this.empty = node.textContent;}};
  return {window, results};
}
const request = overrides => ({lat: 32, lon: 34, requestedAt: '2026-10-12T12:00:00', availableMinutes: 90, ...overrides});
const places = count => Array.from({length: count}, (_, i) => ({id: String(i), lat: 32 + i / 10000, lon: 34, distance: i, openingHours: String(i)}));
test('all candidates including closed places remain visible beyond the first six', async () => {
  const {window, results} = harness({closed: ['0', '1', '2', '3', '4', '5']});
  const found = await window.TravelMateNearbyTest.applyContextualResults(results, places(14), request());
  assert.deepEqual(Array.from(found, p => p.id), Array.from(places(14), p => p.id));
  assert.equal(results.dataset.contextualRedCount, '6');
  assert.equal(results.dataset.contextualGreenCount, '8');
});
test('live routing labels first six red while all candidates remain selectable', async () => {
  const {window, results} = harness({live: async points => {
    assert.ok(points.length <= 8);
    return {leg: (from, to) => Number(to.id) < 6 ? {minutes: 80, source: 'live'} : null};
  }});
  const found = await window.TravelMateNearbyTest.applyContextualResults(results, places(8), request());
  assert.deepEqual(Array.from(found, p => p.id), Array.from(places(8), p => p.id));
  assert.equal(results.dataset.contextualRedCount, '6');
});
test('time fit off permits a search with no available window', async () => {
  const {window, results} = harness();
  const found = await window.TravelMateNearbyTest.applyContextualResults(results, places(8), request({timeFit: false, availableMinutes: null}));
  assert.equal(found.length, 8);
  assert.equal(results.dataset.contextualGreenCount, '8');
  const built = window.TravelMateTripContext.buildNearbyRequest({position: {lat: 32, lon: 34}, timeFit: false, availableMinutes: null});
  assert.equal(built.timeFit, false);
  assert.equal(built.availableMinutes, null);
});
test('zero green results remain a nonempty set with closed/time warnings', async () => {
  const {window, results} = harness({closed: ['0'], minutes: {'1': 80}});
  assert.equal((await window.TravelMateNearbyTest.applyContextualResults(results, places(2), request())).length, 2);
  assert.equal(results.dataset.contextualRedCount, '2');
  assert.equal(results.dataset.contextualGreenCount, '0');
  assert.equal(results.empty, undefined);
});
test('Nearby button dispatches on the first click without a fixed activity', async () => {
  const source = read('assets/app.js');
  const start = source.indexOf("  contextualNearby.querySelector('[data-contextual-nearby-open]').addEventListener");
  const line = source.slice(start, source.indexOf('\n', start));
  let click, detail;
  const label = {hidden: true};
  const window = {TravelMateTripContext: {availableMinutesUntilNextFixed: () => null}};
  const contextualNearby = {querySelector: selector => selector === '[data-contextual-nearby-open]' ? {addEventListener: (_, fn) => {click = fn;}} : selector === '[data-contextual-window-label]' ? label : selector === '[data-contextual-time-fit]' ? {checked: false} : {value: '90'}};
  vm.runInNewContext(line, {contextualNearby, contextualMood: '', contextualMiniRoute: false, contextualRouteStops: 3,
    window, trip: {}, ensureNearby: () => Promise.resolve(), panel: {dispatchEvent: event => {detail = event.detail;}},
    CustomEvent: class {constructor(type, options) {this.detail = options.detail;}}});
  click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(detail.timeFit, false);
  assert.equal(detail.availableMinutes, null);
  assert.equal(label.hidden, true);
});
test('source failures and genuine zero results retain their distinct messages', async () => {
  const source = read('assets/nearby.js');
  const start = source.indexOf('    async function searchAt(');
  const end = source.indexOf('    async function executeGpsSearch', start);
  for (const failure of [false, true]) {
    const status = {classList: {remove() {}, add() {}}, textContent: ''};
    let assessed = false;
    const sandbox = {searchSequence: 0, currentSearchController: null, AbortController, gpsButton: {}, mapSearch: {},
      controls: {executeButton: {}, resetResults: {}}, placeNameSearchInput: {value: ''}, status, results: {},
      panel: {dataset: {}, querySelector: selector => ({value: '1000', checked: false})}, selectedCategoryKeys: [], searchLocationContext: {type: 'destination'}, window: {},
      queryFor() {}, overpassPlaces: () => failure ? Promise.reject(Error('network')) : Promise.resolve({elements: []}),
      normalizeCategoryKeys: x => x, renderPlaces: (data, wiki, lat, lon, status, results, accuracy, warnings) => {
        status.textContent = warnings.length ? 'source failed' : 'no places in area'; return [];
      }, applyContextualResults: () => {assessed = true;}, renderMapMarkers() {}, selectedPoint: null,
      isAbortError: () => false};
    vm.runInNewContext(source.slice(start, end), sandbox);
    await sandbox.searchAt(32, 34, 5, request());
    assert.equal(assessed, false);
    assert.equal(status.textContent, failure ? 'source failed' : 'no places in area');
  }
});

test('canonical time guidance distinguishes green, yellow and red without hiding POIs', () => {
  const {window} = harness();
  const classify = window.TravelMateTripContext.classifyNearbyTimeFit;
  assert.equal(classify({availableMinutes: 60, outboundMinutes: 5}).status, 'green');
  assert.equal(classify({availableMinutes: 40, outboundMinutes: 5}).status, 'yellow');
  assert.equal(classify({availableMinutes: 20, outboundMinutes: 5}).status, 'red');
  assert.equal(classify({availableMinutes: null, outboundMinutes: 5}).status, 'green');
  assert.equal(classify({availableMinutes: null, travelKnown: false}).status, 'yellow');
  assert.equal(classify({availableMinutes: 90, outboundMinutes: 5, openingState: 'closed'}).status, 'red');
});
test('all cards remain selectable when every place is red', async () => {
  const {window, results} = harness({minutes: {'0': 80, '1': 80}});
  const cards = places(2).map(place => ({
    dataset: {placeId: place.id}, querySelector: selector => selector === '.tm-place-card__content' ? {appendChild(node) {this.reason = node;}} : null,
    remove() {throw Error('Guidance must never remove a result');}
  }));
  results.querySelectorAll = () => cards;
  const input = places(2);
  const found = await window.TravelMateNearbyTest.applyContextualResults(results, input, request());
  assert.equal(found, input);
  assert.deepEqual(cards.map(card => card.dataset.contextualTimeFit), ['red', 'red']);
  assert.equal(results.dataset.contextualGreenCount, '0');
  assert.equal(results.dataset.contextualRedCount, '2');
});
test('aborted guidance cannot alter the current rendered result set', async () => {
  const {window, results} = harness({live: async () => ({leg: () => null})});
  const input = places(2);
  const found = await window.TravelMateNearbyTest.applyContextualResults(results, input, request(), {aborted: true});
  assert.equal(found, input); assert.deepEqual(results.dataset, {});
});

test('unknown onward travel keeps a fixed-window warning instead of claiming an unconstrained day', async () => {
 const {window,results}=harness();
 window.TravelMateTripContext.estimateTravelMinutes=(from,to)=>to.id==='next'?null:{minutes:5,source:'estimate'};
 let reasonText='';
 const card={dataset:{placeId:'0'},querySelector:selector=>selector==='.tm-place-card__content'?{appendChild(node){reasonText=node.textContent;}}:null};
 results.querySelectorAll=()=>[card];
 await window.TravelMateNearbyTest.applyContextualResults(results,places(1),request({nextFixedActivity:{record:{id:'next'}}}));
 assert.equal(card.dataset.contextualTimeFit,'yellow');
 assert.match(reasonText,/זמן הביקור לא אומת בחלון של 90 דק׳/);
 assert.doesNotMatch(reasonText,/ללא מגבלת זמן קבועה/);
});

test('unknown opening hours are advisory uncertainty and retain all places', async () => {
 const {window,results}=harness({unknown:['0']});
 const found=await window.TravelMateNearbyTest.applyContextualResults(results,places(2),request());
 assert.equal(found.length,2);assert.equal(results.dataset.contextualYellowCount,'1');assert.equal(results.dataset.contextualGreenCount,'1');
 const classify=window.TravelMateTripContext.classifyNearbyTimeFit;
 assert.equal(classify({availableMinutes:60,outboundMinutes:5,openingState:'unknown'}).status,'yellow');
 assert.equal(classify({availableMinutes:20,outboundMinutes:5,openingState:'unknown'}).status,'red');
});
test('late aborted guidance cannot overwrite the newer search canonical result list', async () => {
 const source=read('assets/nearby.js'),start=source.indexOf('    async function searchAt('),end=source.indexOf('    async function executeGpsSearch',start);
 let finishOld;const oldGate=new Promise(resolve=>{finishOld=resolve;});
 const oldPlaces=[{id:'old'}],newPlaces=[{id:'new'}];
 const sandbox={searchSequence:0,currentSearchController:null,AbortController,gpsButton:{},mapSearch:{},
 controls:{executeButton:{},resetResults:{}},placeNameSearchInput:{value:''},status:{classList:{remove(){},add(){}},textContent:''},
 results:{dataset:{contextualGreenCount:'1',contextualYellowCount:'0',contextualRedCount:'0'},dispatchEvent(){}},
 panel:{dataset:{},querySelector:()=>({value:'1000',checked:false})},selectedCategoryKeys:[],searchLocationContext:{type:'destination'},window:{},
 queryFor:(_,__,lat)=>lat,overpassPlaces:async lat=>({lat}),normalizeCategoryKeys:x=>x,
 renderPlaces:data=>data.lat===1?oldPlaces:newPlaces,
 applyContextualResults:async(_,items)=>{if(items===oldPlaces)await oldGate;return items;},
 renderMapMarkers(){},selectedPoint:null,isAbortError:error=>error.name==='AbortError',CustomEvent:class {}};
 vm.runInNewContext(source.slice(start,end),sandbox);
 const old=sandbox.searchAt(1,34,5,request());await new Promise(resolve=>setImmediate(resolve));
 await sandbox.searchAt(2,34,5,request());assert.equal(sandbox.currentPlaces,newPlaces);
 finishOld();await old;assert.equal(sandbox.currentPlaces,newPlaces);
});
test('GPS result arriving after a newer map search is ignored', async () => {
 const source=read('assets/nearby.js'),start=source.indexOf('    async function executeGpsSearch'),end=source.indexOf('    async function executePlacesSearch',start);
 let resolveGps,searches=0;const sandbox={gpsRequestPending:false,searchSequence:1,requestGpsConsent:async()=> 'once',
 panel:{dataset:{}},status:{classList:{remove(){},add(){}},textContent:''},gpsButton:{setAttribute(){},removeAttribute(){}},controls:{executeButton:{}},results:{},
 currentPosition:()=>new Promise(resolve=>{resolveGps=resolve;}),navigator:{onLine:true},map:null,searchAt:async()=>{searches++;}};
 vm.runInNewContext(source.slice(start,end),sandbox);
 const pending=sandbox.executeGpsSearch();await new Promise(resolve=>setImmediate(resolve));sandbox.searchSequence++;
 resolveGps({coords:{latitude:32,longitude:34,accuracy:5}});await pending;
 assert.equal(searches,0);assert.equal(sandbox.gpsRequestPending,false);
});

test('GPS rejection arriving after a newer map search is ignored', async () => {
 const source=read('assets/nearby.js'),start=source.indexOf('    async function executeGpsSearch'),end=source.indexOf('    async function executePlacesSearch',start);
 let rejectGps,searches=0;const sandbox={gpsRequestPending:false,searchSequence:1,requestGpsConsent:async()=> 'once',
 panel:{dataset:{}},status:{classList:{remove(){},add(){}},textContent:''},gpsButton:{setAttribute(){},removeAttribute(){}},controls:{executeButton:{}},results:{},
 currentPosition:()=>new Promise((_,reject)=>{rejectGps=reject;}),navigator:{onLine:true},map:null,searchAt:async()=>{searches++;}};
 vm.runInNewContext(source.slice(start,end),sandbox);
 const pending=sandbox.executeGpsSearch();await new Promise(resolve=>setImmediate(resolve));sandbox.searchSequence++;
 sandbox.status.textContent="New map results";rejectGps(new Error("Old GPS denied"));await pending;
 assert.equal(sandbox.status.textContent,"New map results");assert.equal(searches,0);assert.equal(sandbox.gpsRequestPending,false);
});
