'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

function luminance(hex){
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
}
function contrast(a,b){
  const la=luminance(a),lb=luminance(b),hi=Math.max(la,lb),lo=Math.min(la,lb);
  return (hi+0.05)/(lo+0.05);
}

const palettes={
  ocean:{primary:'#147D92',dark:'#0B5869',soft:'#D7EDF2'},
  emerald:{primary:'#176B52',dark:'#0E4C3A',soft:'#D8ECE4'},
  teal:{primary:'#0B6F73',dark:'#074E51',soft:'#D8ECEC'},
  sunset:{primary:'#A34E3C',dark:'#743328',soft:'#F3DED8'},
  plum:{primary:'#674177',dark:'#492D58',soft:'#E8DDED'},
  pink:{primary:'#A23D6F',dark:'#74294D',soft:'#F4DCE8'}
};

test('theme engine exposes six named palettes including pink',()=>{
  const js=read('assets/theme.js');
  for(const key of Object.keys(palettes)) assert.match(js,new RegExp(key+': Object\\.freeze'));
  assert.match(js,/pink: Object\.freeze\(\{ label: 'ורוד'/);
  assert.match(js,/forest: 'emerald'/);
  assert.match(js,/violet: 'plum'/);
  assert.match(js,/coral: 'sunset'/);
});

test('all primary accent colors meet WCAG AA with white action text',()=>{
  for(const [name,p] of Object.entries(palettes)){
    assert.ok(contrast(p.primary,'#FFFFFF')>=4.5,name+' primary must reach 4.5:1 against white');
  }
});

test('all subtle accent combinations keep strong text contrast',()=>{
  for(const [name,p] of Object.entries(palettes)){
    assert.ok(contrast(p.dark,p.soft)>=4.5,name+' dark-on-soft must reach 4.5:1');
  }
});

test('settings and account expose the same six palette choices',()=>{
  const security=read('assets/security-center.js');
  const home=read('assets/home.js');
  for(const key of Object.keys(palettes)){
    assert.match(security,new RegExp('data-accent-choice="'+key+'"'));
    assert.match(home,new RegExp('data-accent-choice="'+key+'"'));
  }
});

test('accent themes use semantic tokens while danger remains semantic',()=>{
  const css=read('assets/readable-glass.css');
  assert.match(css,/User-selectable accent themes: semantic roles/);
  assert.match(css,/--tm-action-secondary:color-mix/);
  assert.match(css,/--tm-card-control-selected:color-mix/);
  assert.match(css,/--tm-card-link:var\(--tm-brand-primary-dark\)/);
  assert.match(css,/Keep semantic states independent of user-selected accent/);
  assert.match(css,/--tm-control-current-bg:var\(--tm-action-danger\)/);
});

test('Plan primary follows the theme while destructive action stays red',()=>{
  const themeCss=read('assets/theme.css');
  assert.match(themeCss,/planner-action\.planner-action\.primary[\s\S]*var\(--tm-action-primary/);
  assert.match(themeCss,/planner-action\.planner-action\.planner-danger[\s\S]*var\(--tm-action-danger\)/);
});

test('theme picker is keyboard-visible and responsive',()=>{
  const css=read('assets/security-center.css');
  assert.match(css,/\.settings-accent-picker button:focus-visible/);
  assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});


test('app chrome inherits the selected accent without recoloring semantic states',()=>{
  const glass=read('assets/readable-glass.css');
  const themeCss=read('assets/theme.css');
  assert.match(glass,/--tm-chrome-surface:color-mix\(in srgb,var\(--tm-brand-primary-dark\)/);
  assert.match(glass,/--tm-chrome-border:color-mix\(in srgb,var\(--tm-brand-primary\)/);
  assert.match(themeCss,/background:var\(--tm-chrome-surface,var\(--tm-surface-dark-glass-strong\)\)!important/);
  assert.match(themeCss,/background:var\(--tm-action-secondary\)!important/);
  assert.match(themeCss,/background:var\(--tm-action-danger\)/);
});
