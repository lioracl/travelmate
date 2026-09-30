'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/theme.js','utf8'),css=fs.readFileSync('assets/readable-glass.css','utf8');
function engine(saved={}){const values=new Map(Object.entries(saved)),root={dataset:{},style:{setProperty(){}}};const document={documentElement:root,readyState:'complete',querySelectorAll:()=>[],addEventListener(){}};const window={dispatchEvent(){}};vm.runInNewContext(source,{document,window,localStorage:{getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v)},CustomEvent:function(){}});return {api:window.TravelMateTheme,root,values};}
test('surface normalization accepts only owned keys and rejects prototype names',()=>{const {api}=engine();for(const key of ['classic','ice-aqua','pearl-blue','warm-sand'])assert.equal(api.normalizeSurfaceTheme(key),key);for(const key of ['unknown','__proto__','toString',null])assert.equal(api.normalizeSurfaceTheme(key),'classic');});
test('new preference defaults to Ice Aqua and invalid saved preference falls back to Classic',()=>{assert.equal(engine().root.dataset.surfaceTheme,'ice-aqua');assert.equal(engine({'travelmate-surface-theme':'invalid'}).root.dataset.surfaceTheme,'classic');});
test('surface selection persists and reload restores it without touching theme/accent',()=>{const e=engine({'travelmate-theme':'dark','travelmate-accent':'plum'});e.api.setSurfaceTheme('warm-sand');assert.equal(e.values.get('travelmate-surface-theme'),'warm-sand');assert.equal(e.values.get('travelmate-theme'),'dark');assert.equal(e.values.get('travelmate-accent'),'plum');const reloaded=engine(Object.fromEntries(e.values));assert.equal(reloaded.root.dataset.surfaceTheme,'warm-sand');assert.equal(reloaded.root.dataset.theme,'dark');assert.equal(reloaded.root.dataset.accent,'plum');});
test('theme and accent changes do not replace surface selection',()=>{const e=engine();e.api.setSurfaceTheme('pearl-blue');e.api.set('dark');e.api.setAccent('emerald');assert.equal(e.root.dataset.surfaceTheme,'pearl-blue');assert.equal(e.api.getSurfaceTheme(),'pearl-blue');});
test('all surface families provide light and dark role tokens centrally',()=>{for(const key of ['classic','ice-aqua','pearl-blue','warm-sand']){assert.ok(css.includes('html[data-surface-theme="'+key+'"]'));assert.ok(css.includes('html[data-theme="dark"][data-surface-theme="'+key+'"]'));}for(const role of ['primary','nested','control','control-hover','control-active','border','chrome','text','muted'])assert.ok(css.includes('--tm-family-'+role+':'));assert.match(css,/--tm-surface-control:var\(--tm-family-control\)/);});
test('Weather neutral contract never derives from surface or accent palette',()=>{const material=css.match(/--tm-weather-card-bg:linear-gradient\(135deg,rgba\(217,225,223,.42\),rgba\(201,213,210,.34\)\)/);assert.ok(material);assert.doesNotMatch(material[0],/var\(/);assert.match(css,/--tm-weather-card-blur:blur\(6px\) saturate\(106%\)/);});
test('Plan mobile action grid keeps touch targets and contained primary links',()=>{const c=fs.readFileSync('assets/auto-planner.css','utf8');assert.match(c,/\.activity-buttons,\.saved-place-actions\)\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(c,/saved-place-links .saved-calendar-link\{grid-column:1\/-1\}/);assert.match(c,/min-height:44px/);});

test('light family primary foregrounds meet AA even over a black photo',()=>{
 const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const hex=h=>h.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16));
 for(const name of ['classic','ice-aqua','pearl-blue','warm-sand']){
  const palette=css.split('[data-surface-choice="'+name+'"]{')[1].split('}')[0];
  const backgrounds=[...palette.matchAll(/rgba\(([^)]+)\)/g)].slice(0,2).map(m=>{const c=m[1].split(',').map(Number);return c.slice(0,3).map(v=>v*c[3]);});
  for(const role of ['text','muted']){const color=hex(palette.match(new RegExp('--tm-family-'+role+':(#[^;]+)'))[1]);for(const background of backgrounds)assert.ok((luminance(background)+.05)/(luminance(color)+.05)>=4.5,name+' '+role+' contrast');}
 }
});

test('saved-place inline editor allows native field shrink and a full-width mobile save',()=>{
 const c=fs.readFileSync('assets/place-auto-fill.css','utf8');
 const rules=[...c.matchAll(/\.saved-place-editor\{([^}]+)\}/g)].map(m=>m[1]);
 assert.ok(rules.every(rule=>!(/grid-template-columns:/.test(rule))||rule.includes('minmax(0,')));
 assert.match(c,/\.saved-place-editor input\{min-width:0;width:100%;box-sizing:border-box/);
 assert.match(c,/\.saved-place-editor label\{min-width:0;/);
 assert.match(c,/@media\(max-width:680px\)[\s\S]*?\.saved-place-editor>button\{grid-column:1\/-1\}/);
});