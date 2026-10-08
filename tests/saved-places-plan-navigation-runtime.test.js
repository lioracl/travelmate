'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'assets/auto-planner.js'), 'utf8');
const begin = app.indexOf('  function openSavedPlaceInPlan(place){');
const end = app.indexOf('  function renderSavedShelf(){', begin);
assert.ok(begin >= 0 && end > begin, 'saved-place navigation function exists');
const source = app.slice(begin, end).trim();

test('navigation is event-driven and planner controls canonical day state', () => {
  assert.doesNotMatch(source, /setTimeout\(openRow\s*,\s*120\)/);
  assert.match(source, /travelmate:viewchange/);
  assert.match(source, /travelmate:planner-ready/);
  assert.match(source, /travelmate:planner-rendered/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /Promise\.resolve\(\)\.then/);
  assert.match(source, /current\.focus\(\{preventScroll:true\}\)/);
  assert.match(planner, /TravelMatePlanner=\{openDay:function\(date\)/);
  assert.match(planner, /collapsedDays\[date\]=false;render\(\)/);
  assert.match(planner, /travelmate:planner-ready/);
});

function hub() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name) { for (const fn of [...(listeners.get(name) || [])]) fn({type:name}); }
  };
}
function makeRow(label, day, ownerDocument) {
  const attrs = new Map(), classes = new Set();
  return {
    label, dataset:{savedPlaceId:'place-1'}, classList:{
      add(name){classes.add(name)}, remove(name){classes.delete(name)},
      contains(name){return classes.has(name)}
    },
    closest(selector){assert.equal(selector,'.generated-day');return day},
    getAttribute(name){return attrs.has(name)?attrs.get(name):null},
    setAttribute(name,value){attrs.set(name,value)},
    removeAttribute(name){attrs.delete(name)},
    scrollIntoView(options){this.scrolled=options},
    focus(options){this.focused=options;if(ownerDocument)ownerDocument.activeElement=this}
  };
}
async function exercise(width, reducedMotion, initiallyPlan, delayedNavigation) {
  const document = Object.assign(hub(),{body:{dataset:{tripView:initiallyPlan?'plan':'places'}},documentElement:{}});
  document.activeElement=document.body;
  const window = Object.assign(hub(),{
    innerWidth:width,
    matchMedia:query=>({matches:reducedMotion && query.includes('reduced-motion')})
  });
  let collapsed=true, row=null, observer, nextTimer=0;
  const timers = new Map();
  const day={dataset:{dayDate:'2026-10-09'},classList:{contains(name){return name==='day-collapsed'&&collapsed}}};
  const daysContainer={querySelectorAll(selector){
    assert.equal(selector,'[data-saved-place-id]');
    return row?[row]:[];
  }};
  class MutationObserver {
    constructor(callback){this.callback=callback;observer=this}
    observe(){this.observing=true}
    disconnect(){this.observing=false}
  }
  const plannerApi={openDay(date){
    assert.equal(date,'2026-10-09');
    if(collapsed){collapsed=false;row=makeRow('current',day,document);document.emit('travelmate:planner-rendered')}
    return true;
  }};
  const navigationApi={open(view){
    assert.equal(view,'plan');
    Promise.resolve().then(()=>{
      document.body.dataset.tripView='plan';
      window.emit('travelmate:viewchange');
      window.TravelMatePlanner=plannerApi;
      document.emit('travelmate:planner-ready');
    });
  }};
  if(initiallyPlan){window.TravelMatePlanner=plannerApi;row=makeRow('current',day,document)}
  else if(!delayedNavigation)window.TravelMateNavigation=navigationApi;
  const context={
    window,document,daysContainer,MutationObserver,Promise,
    requestAnimationFrame(fn){Promise.resolve().then(()=>{row=makeRow('current',day,document);fn()})},
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id},
    clearTimeout(id){timers.delete(id)},
    location:{href:'https://example.test/trip/?id=1'},
    URL
  };
  const fn=vm.runInNewContext('('+source.replace(/^function openSavedPlaceInPlan/,'function')+')',context);
  fn({id:'place-1',date:'2026-10-09'});
  if(delayedNavigation){
    await new Promise(resolve=>setImmediate(resolve));
    window.TravelMateNavigation=navigationApi;
    window.emit('travelmate:viewchange');
  }
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.body.dataset.tripView,'plan');
  assert.equal(collapsed,false);
  assert.equal(row.label,'current','newly rendered row was queried');
  assert.ok(row.focused,'new row receives keyboard focus');
  assert.equal(row.focused.preventScroll,true);
  assert.equal(row.scrolled.block,'center');
  assert.equal(row.scrolled.behavior,reducedMotion?'auto':'smooth');
  assert.equal(row.classList.contains('is-plan-target'),true);
  assert.equal(row.getAttribute('tabindex'),'-1');
  assert.equal(observer.observing,true,'observer stays active during the short DOM-settle window');
  assert.equal([...timers.values()].filter(t=>t.ms===15000).length,1,'safety timer remains while focus is stabilizing');

  const firstRow=row;
  row=makeRow('replacement',day,document);
  document.activeElement=document.body;
  observer.callback();
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.notEqual(row,firstRow,'planner replacement creates a new row');
  assert.ok(row.focused,'replacement row receives focus when the old focused row is recreated');
  assert.equal(document.activeElement,row);
  assert.equal(row.getAttribute('tabindex'),'-1');
  assert.equal(row.scrolled,undefined,'replacement recovery does not cause a second scroll jump');
  assert.equal(row.classList.contains('is-plan-target'),true,'visual target survives row replacement');

  const settleEntry=[...timers.entries()].find(([,timer])=>timer.ms===300);
  assert.ok(settleEntry,'focus watcher has a bounded quiet-period cleanup');
  timers.delete(settleEntry[0]);settleEntry[1].fn();
  assert.equal(observer.observing,false,'observer disconnects after the DOM settles');
  assert.equal([...timers.values()].filter(t=>t.ms===15000).length,0,'readiness safety timer cleaned up after settle');
  assert.equal([...timers.values()].filter(t=>t.ms===1800).length,1,'visual highlight has bounded duration');
  for(const [id,timer] of [...timers.entries()]) if(timer.ms===1800){timers.delete(id);timer.fn()}
  assert.equal(row.classList.contains('is-plan-target'),false);
  assert.equal(row.getAttribute('tabindex'),'-1','focused article stays programmatically focusable');
}

for(const width of [390,430,768,1440]) {
  test('saved place opens and focuses after render at '+width+'px RTL', async()=>{
    await exercise(width,false,false);
  });
}
test('reduced motion avoids smooth scrolling and existing Plan view is supported', async()=>{
  await exercise(390,true,true);
});
test('saved-place request survives the router startup race', async()=>{
  await exercise(390,false,false,true);
});

test('programmatic day opening wins over delayed automatic collapse', () => {
  const polish = fs.readFileSync(path.join(root, 'assets/plan-ux-polish.js'), 'utf8');
  const begin = polish.indexOf('    var shouldCollapse=Boolean(');
  const end = polish.indexOf('    if(!shouldCollapse', begin);
  assert.ok(begin >= 0 && end > begin, 'auto-collapse decision exists');
  const fragment = polish.slice(begin, end);
  function scenario(explicitBefore, explicitAfter) {
    const callbacks = [];
    let clicks = 0;
    const card = {
      dataset: explicitBefore ? {planExplicitOpen:'true'} : {},
      classList: {contains: () => false},
      querySelector: () => ({click: () => { clicks++; }})
    };
    vm.runInNewContext('(function(){' + fragment + '})()', {
      focus:'2026-10-08', date:'2026-10-09', card,
      setTimeout: fn => callbacks.push(fn)
    });
    if (explicitAfter) card.dataset.planExplicitOpen = 'true';
    callbacks.forEach(fn => fn());
    return {clicks, scheduled:callbacks.length};
  }
  assert.equal(scenario(true, false).clicks, 0, 'already requested day stays open');
  assert.deepEqual(scenario(false, true), {clicks:0, scheduled:1},
    'a queued auto-collapse cannot override later programmatic opening');
  assert.deepEqual(scenario(false, false), {clicks:1, scheduled:1},
    'ordinary automatic collapse still works');
  assert.match(planner, /planExplicitOpen/);
});
