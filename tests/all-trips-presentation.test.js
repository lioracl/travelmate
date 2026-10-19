'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../assets/home.js'),'utf8');
const start=source.indexOf('  function composeTripCard('),end=source.indexOf('  function cardShell(',start);
assert(start>=0&&end>start);
class Element {
 constructor(tag,className=''){this.tagName=tag;this.className=className;this.children=[];this.parentNode=null;this.attributes={};this.textContent='';this.classList={add:name=>{this.className+=' '+name;}};}
 get firstChild(){return this.children[0]||null;}
 get childElementCount(){return this.children.length;}
 setAttribute(k,v){this.attributes[k]=v;}
 appendChild(node){return this.insertBefore(node,null);}
 insertBefore(node,before){node.remove();const i=before?this.children.indexOf(before):this.children.length;assert(i>=0);this.children.splice(i,0,node);node.parentNode=this;return node;}
 remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
 querySelectorAll(selector){const found=[];function walk(n){for(const c of n.children){if(selector[0]==='.'?c.className.split(/\s+/).includes(selector.slice(1)):c.tagName===selector)found.push(c);walk(c);}}walk(this);return found;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const document={createElement:tag=>new Element(tag)};
const context={document,Number};vm.runInNewContext(source.slice(start,end)+'\nthis.compose=composeTripCard;',context);
function fixture({places,days='4'}={}){
 const shell=new Element('article'),link=shell.appendChild(new Element('a','trip-card')),copy=link.appendChild(new Element('span','trip-copy'));
 link.setAttribute('href','trip/custom/index.html?id=synthetic');link.setAttribute('style','background-image:url(canonical-photo)');
 const title=copy.appendChild(new Element('h2'));title.textContent='<untrusted> יעד';
 const date=copy.appendChild(new Element('span','tag trip-date-range'));date.setAttribute('aria-label','מ־17 באוקטובר עד 20 באוקטובר');
 const endpoints=['17 באוקטובר','20 באוקטובר'].map(t=>{const el=date.appendChild(new Element('bdi'));el.textContent=t;return el;});
 const day=copy.appendChild(new Element('span','tag'));day.textContent=days+' ימים';
 if(places!==undefined){const place=copy.appendChild(new Element('span','tag trip-place-count'));place.textContent=places===1?'מקום שמור אחד':places+' מקומות שמורים';}
 const open=copy.appendChild(new Element('strong'));open.textContent='פתיחת הטיול';
 const rail=shell.appendChild(new Element('div','trip-card-action-rail'));const actions=['trip-edit-dates','trip-delete','trip-activity-toggle'].map(n=>rail.appendChild(new Element('button',n)));
 return {shell,link,copy,title,date,endpoints,day,open,rail,actions};
}
test('R06 composition preserves canonical links, text, Bidi nodes and action identities without mutating the record',()=>{
 const f=fixture({places:2}),trip=Object.freeze({start:'2026-10-17',end:'2026-10-20',days:4,savedPlaces:Object.freeze([{},{}])});
 const before=JSON.stringify(trip);context.compose(f.shell,trip);
 assert.equal(f.link.attributes.href,'trip/custom/index.html?id=synthetic');assert.equal(f.link.attributes.style,'background-image:url(canonical-photo)');
 assert.equal(f.title.textContent,'<untrusted> יעד');assert.deepEqual(f.date.querySelectorAll('bdi'),f.endpoints);assert.equal(f.date.attributes['aria-label'],'מ־17 באוקטובר עד 20 באוקטובר');
 assert.equal(f.date.parentNode.className,'trip-calendar');assert.equal(f.day.parentNode.className,'trip-card-metrics');
 assert.deepEqual(f.rail.children,f.actions);assert.equal(f.open.parentNode,f.copy);assert.equal(JSON.stringify(trip),before);
 assert.equal(f.link.querySelector('.trip-card-photo').attributes['aria-hidden'],'true');
 for(const icon of f.shell.querySelectorAll('i'))assert.equal(icon.attributes['aria-hidden'],'true');
});
test('R06 omits absent metadata and decorative separator instead of inventing dates, days or places',()=>{
 for(const days of [undefined,null,'',0,-1,NaN,'unknown']){
  const f=fixture({days});context.compose(f.shell,Object.freeze({days}));
  assert.equal(f.shell.querySelector('.trip-calendar'),null);assert.equal(f.shell.querySelector('.trip-date-range'),null);
  assert.equal(f.shell.querySelector('.trip-card-metrics'),null);assert.equal(f.shell.querySelector('.trip-day-count'),null);assert.equal(f.shell.querySelector('.trip-place-count'),null);
  assert.deepEqual(f.rail.children,f.actions);
 }
});
test('R06 preserves a known zero saved-place count, keeps unknown count absent and accepts stored numeric days',()=>{
 const zero=fixture({places:0,days:'3'});context.compose(zero.shell,{start:'2026-10-17',end:'2026-10-19',days:'3'});
 assert.equal(zero.shell.querySelector('.trip-place-count').textContent,'0 מקומות שמורים');assert.equal(zero.shell.querySelector('.trip-day-count').textContent,'3 ימים');
 const unknown=fixture();context.compose(unknown.shell,{start:'2026-10-17',end:'2026-10-20',days:4});
 assert.equal(unknown.shell.querySelector('.trip-place-count'),null);
 assert.equal(unknown.shell.querySelector('.trip-card-metrics').children.length,1);
});
test('R06 hides incomplete date ranges without changing available day metadata',()=>{
 for(const trip of [{start:'2026-10-17',days:4},{end:'2026-10-20',days:4}]){
  const f=fixture();context.compose(f.shell,trip);assert.equal(f.shell.querySelector('.trip-calendar'),null);assert.equal(f.shell.querySelector('.trip-day-count').textContent,'4 ימים');
 }
});
