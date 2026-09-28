'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sw.js','utf8');
function worker(online=false){
 const handlers={},entries=new Map(),pending=[];const base='https://local.test/travelmate/';
 const key=x=>new URL(typeof x==='string'?x:x.url,base).href.split('?')[0];
 const cache={addAll:async paths=>paths.forEach(p=>entries.set(key(p),new Response(p))),put:async(req,res)=>entries.set(key(req),res)};
 const scope={URL,Response,self:{location:{origin:'https://local.test',href:base+'sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{},clients:{claim:()=>{}}},caches:{open:async()=>cache,match:async(req)=>entries.get(key(req)),keys:async()=>[],delete:async()=>true},fetch:async()=>{if(online)return new Response('network');throw Error('server unavailable');}};
 vm.runInNewContext(source,scope);return {handlers,entries,pending,base};
}
for(const route of ['trip/custom/','trip/italy-2028/','trip/japan-2027/',''])test('offline navigation reopens correct entry: '+(route||'home'),async()=>{
 const w=worker();let install;w.handlers.install({waitUntil:p=>install=p});await install;
 let response;w.handlers.fetch({request:{url:w.base+route+'?view=plan',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>w.pending.push(p)});
 assert.equal(await (await response).text(),route?'./'+route+'index.html':'./');
});
test('online navigation stays network-first',async()=>{const w=worker(true);let response;w.handlers.fetch({request:{url:w.base+'trip/italy-2028/',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:p=>w.pending.push(p)});assert.equal(await(await response).text(),'network');await Promise.all(w.pending);});
test('future visited trip falls back to its cached entry without a manual route list',async()=>{const w=worker();w.entries.set(w.base+'trip/future/index.html',new Response('future trip'));let response;w.handlers.fetch({request:{url:w.base+'trip/future/?view=places',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:()=>{}});assert.equal(await(await response).text(),'future trip');});
test('uncached trip never silently becomes Home',async()=>{const w=worker();w.entries.set(w.base+'index.html',new Response('Home'));let response;w.handlers.fetch({request:{url:w.base+'trip/uncached/',method:'GET',mode:'navigate'},respondWith:p=>response=p,waitUntil:()=>{}});assert.equal((await response).status,503);});
