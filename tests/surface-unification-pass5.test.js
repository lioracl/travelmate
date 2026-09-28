'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('surface roles have one shared owner rather than per-page pale panels',()=>{
  const css=read('assets/readable-glass.css');
  for(const role of ['overview-card','plan-shell-surface']) assert.match(css,new RegExp('--tm-'+role+':var\\(--tm-surface-glass\\)'));
  assert.match(css,/--tm-card-control-selected:var\(--tm-action-secondary-active\)/);
  assert.match(css,/--tm-family-primary:linear-gradient\(135deg,rgba\(166,188,181,.86\)/);
  assert.match(css,/--tm-family-primary:linear-gradient\(135deg,rgba\(24,55,46,.86\)/);
  assert.match(css,/background:var\(--tm-surface-control/);
  assert.doesNotMatch(css,/--tm-card-control-selected:rgba\(255,255,255/);
});

test('assistant becomes available after idle while account warming respects data saver',()=>{
  const source=read('assets/app.js');
  const block=source.slice(source.indexOf('  function scheduleIdleFeature'),source.indexOf('  function activeView'));
  const timers=[],idle=[],loaded=[];
  vm.runInNewContext(block+';warmNonCritical();',{setTimeout:(run,delay)=>timers.push({run,delay}),window:{requestIdleCallback:true},requestIdleCallback:run=>idle.push(run),canWarmNonCritical:()=>false,loadFeature:view=>loaded.push(view)});
  assert.deepEqual(timers.map(t=>t.delay),[500,4200]);
  timers.forEach(t=>t.run()); assert.equal(loaded.length,0);
  idle.forEach(run=>run()); assert.deepEqual(loaded,['assistant']);
});

test('Smart Hub is a native secondary-menu button without floating drag listeners',()=>{
  const js=read('assets/smart-hub.js'),css=read('assets/smart-hub.css');
  assert.match(js,/document.querySelector\('\.trip-sidebar-more-menu'\)/);
  assert.match(js,/menu.appendChild\(launch\)/);
  assert.match(js,/launch.addEventListener\('click', openHub\)/);
  assert.doesNotMatch(js,/launchDrag|travelmate-smart-hub-position-v3|addEventListener\('resize'/);
  assert.match(css,/\.smart-hub-launch\{position:static/);
  assert.doesNotMatch(css,/cursor:grab|touch-action:none/);
  assert.match(css,/\.smart-tool i\{-webkit-text-fill-color:currentColor/);
  assert.match(js,/window.closeMobileMenu\(\)/);
});

test('timeline line and border-box dot share the same logical axis',()=>{
  const css=read('assets/auto-planner.css');
  assert.match(css,/inset-inline-start:calc\(var\(--tm-timeline-axis\) - 1.5px\)/);
  assert.match(css,/inset-inline-start:calc\(var\(--tm-timeline-axis\) - var\(--tm-timeline-gutter\) - var\(--tm-timeline-dot\)\/2\)/);
  assert.doesNotMatch(css,/right:-25px|right:7px/);
  assert.match(css,/box-sizing:border-box;width:var\(--tm-timeline-dot\)/);
  assert.doesNotMatch(css,/\.saved-calendar-link,\.schedule-conflict-note/,'warning text must not inherit a light dark-mode link color on its pale badge');
});

test('Smart Hub dialog restores focus and loops keyboard focus using its existing listener',()=>{
  const js=read('assets/smart-hub.js');
  assert.match(js,/document.activeElement === document.body \? state.ui.launch/);
  assert.match(js,/event.shiftKey && document.activeElement === first/);
  assert.match(js,/!event.shiftKey && document.activeElement === last/);
  assert.match(js,/focus.isConnected/);
  assert.equal((js.match(/document.addEventListener\('keydown'/g)||[]).length,1);
});


test('Mate is the personal assistant and its dark fields/targets use semantic materials',()=>{
  const js=read('assets/ai-assistant.js'),css=read('assets/ai-assistant.css');
  assert.match(js,/__travelMateAiAssistantLoaded/);
  assert.match(css,/width:44px;height:44px/);
  assert.match(css,/min-height:40px;white-space:nowrap/);
  assert.match(css,/min-height:44px;padding-inline:6px/);
  assert.doesNotMatch(css,/background:#fff!important/);
  assert.match(css,/textarea\{background:var\(--tm-surface-control\)/);
  assert.match(read('assets/styles.css'),/\.panel\.assistant\{/);
  assert.doesNotMatch(read('assets/styles.css'),/(?:^|})\.assistant\{/);
});

test('drawer destination and Documents control radii follow shared roles',()=>{
  const material=read('assets/readable-glass.css');
  assert.match(material,/destination-mini\{[\s\S]*?background:var\(--tm-surface-nested/);
  assert.match(material,/--tm-card-radius-control:12px/);
  assert.match(read('assets/document-vault.css'),/border-radius:var\(--tm-card-radius-control\)/);
});
