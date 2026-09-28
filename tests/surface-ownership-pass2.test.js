'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('reserved custom Weather is a sibling immediately after Hero',()=>{
 const html=read('trip/custom/index.html');
 assert.match(html,/<section id="overview"[^\n]+?<\/section><button[^>]+data-weather-top-widget/);
 assert.equal((html.match(/data-weather-top-widget/g)||[]).length,1);
});
test('dynamic Weather reuses the independent slot and creates a sibling when missing',()=>{
 const source=read('assets/weather-widget.js').split('  function createUi(destination) {')[1].split('  async function resolveLocation')[0];
 for(const existing of [true,false]){
  let insertions=0,creations=0;const node=()=>({dataset:{},setAttribute(){},querySelector(){return {}},remove(){}});
  const content=node(),hero=node(),slot=existing?node():null;if(slot)slot.parentElement=content;
  content.querySelector=s=>s==='.hero'?hero:slot;hero.querySelector=()=>null;
  hero.insertAdjacentElement=(position,button)=>{assert.equal(position,'afterend');insertions++;button.parentElement=content};
  hero.appendChild=()=>assert.fail('custom Weather must not be appended inside Hero');
  const document={body:{dataset:{tripKind:'custom'},appendChild(){}},querySelector:()=>content,querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>{creations++;return node()}};
  const ui=vm.runInNewContext('(function(destination){'+source+')',{document,weatherSvg:()=>'',escapeText:v=>v})({city:'פראג'});
  assert.equal(ui.button.parentElement,content);assert.equal(insertions,existing?0:1);assert.equal(creations,existing?1:2);
 }
});
test('Hero cover and center survive every custom Hero material rule',()=>{
 const css=read('assets/trip-redesign.css');
 assert.match(css,/#overview\.custom-hero\{[^}]*background-size:cover;[^}]*background-position:center/);
 for(const block of css.matchAll(/[^{}]*custom-hero\s*\{([^}]+)\}/g))assert.doesNotMatch(block[1],/(?:^|;)\s*background:/);
});
test('custom Plan is excluded from generic card ownership without a duplicate ID',()=>{
 const css=read('assets/readable-glass.css');assert.doesNotMatch(css,/#plan#plan/);
 assert.match(css,/\.weather-forecast-panel\s*\):not\(:where\(body\[data-trip-kind="custom"\] #plan \*\)\)/);
 assert.match(css,/\.generated-day>div\{\s*background:var\(--tm-plan-shell-surface\)/);
 assert.match(css,/\.planned-activity,\.saved-place\)\{\s*background:var\(--tm-plan-row-surface\)/);
});
test('custom primary and nested surfaces have no blur while modal backdrop stays independent',()=>{
 const css=read('assets/readable-glass.css');assert.match(css,/body\[data-trip-kind="custom"\]\.tm-new-design\{[^}]*--tm-surface-blur:none;[^}]*--tm-surface-blur-nested:none;[^}]*--tm-card-blur:none/);
 assert.match(css,/--tm-surface-nested:rgba\(169,191,184,\.60\)/);
 assert.match(read('assets/modal-system.css'),/backdrop-filter:/);
});
test('destination scrim has a single theme owner and canvas resolves on the trip body',()=>{
 const glass=read('assets/readable-glass.css'),theme=read('assets/theme.css');
 assert.doesNotMatch(glass,/--tm-photo-scrim-(start|mid|end):/);
 assert.equal((theme.match(/--tm-photo-scrim-start:/g)||[]).length,2);
 assert.match(glass,/body\.tm-new-design:not\(\.home-page\)\{--tm-destination-canvas:/);
 assert.match(glass,/@media\(max-width:900px\)\{[^}]+background-image:none/);
});
test('Budget feature does not inject duplicate currency UI into the Overview summary',()=>{
 assert.match(read('assets/trip-experience.js'),/querySelectorAll\('\.budget-card:not\(\.overview-status-card\)'\)/);
});
test('surface cleanup does not increase the audited important debt',()=>{
 const files=fs.readdirSync(path.join(root,'assets')).filter(p=>p.endsWith('.css'));
 const count=files.reduce((n,p)=>n+(read('assets/'+p).match(/!important/g)||[]).length,0);assert.ok(count<=252,'important count '+count);
});

test("standalone currency uses primary material and embedded currency stays flat",()=>{const css=read("assets/trip-experience.css");assert.match(css,/\.currency-insight\{[^}]*background:var\(--tm-card-bg\)/);assert.match(css,/\.currency-insight\.compact\{background:transparent/);assert.match(css,/font-weight:900;color:var\(--tm-card-heading\)/)});

test('mobile header control foreground is not forced to photo white',()=>{
 const css=read('assets/readable-glass.css');
 assert.doesNotMatch(css,/\.mobile-header :is\(a,button,h1,h2,h3,strong,span,i\)/);
 assert.match(css,/\.mobile-header :is\(\.mobile-destination-map,\.mobile-trip-whatsapp\)\{[^}]*background:var\(--tm-action-secondary\);[^}]*color:var\(--tm-control-text\);[^}]*-webkit-text-fill-color:currentColor/);
});
test('Plan shortcuts keep real labels and full toolbar geometry',()=>{
 const planner=read('assets/auto-planner.css'),layout=read('assets/trip-redesign.css');
 assert.doesNotMatch(planner,/Compact toolbar shortcuts remain icon-first/);
 assert.doesNotMatch(layout,/data-new-activity\]\{[^}]*color:transparent!important/);
 assert.match(planner,/\.planner-toolbar \.planner-toolbar-actions button\{[^}]*width:100%;[^}]*align-items:center;[^}]*justify-content:center/);
 assert.match(read('assets/smart-plan-tools.css'),/\.day-heading-actions\{flex-direction:row\}/);
});
test('custom Weather background is neutral and independent of accent',()=>{
 const css=read('assets/readable-glass.css');
 const tokens=css.match(/--tm-weather-card-bg:linear-gradient\(135deg,rgba\(244,243,239,\.52\),rgba\(232,235,232,\.42\)\);/);
 assert.ok(tokens,'dedicated neutral Weather material');
 assert.doesNotMatch(tokens[0],/var\(--tm-brand|color-mix/);
 assert.match(css,/--tm-weather-card-blur:none/);
});
