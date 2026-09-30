'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('cached custom destination hands the same image to the canvas without a second Hero crop',async()=>{
 const source=fs.readFileSync(path.join(root,'assets/destination-images.js'),'utf8');
 const window={};const url='https://example.test/tel-aviv.jpg';
 vm.runInNewContext(source,{window,localStorage:{getItem:()=>JSON.stringify({'תל אביב|ישראל':url})},Map,Promise,URLSearchParams});
 for(const custom of [true,false]){
  const properties={};const element={isConnected:true,dataset:{},classList:{contains:()=>custom},style:{setProperty:(key,value)=>properties[key]=value}};
  assert.equal(await window.TravelMateDestinationImages.apply(element,'תל אביב','ישראל'),url);
  if(custom){assert.equal(properties['--tm-destination-image'],"url('"+url+"')");assert.equal(element.style.backgroundImage,undefined)}
  else{assert.equal(element.style.backgroundImage,"url('"+url+"')");assert.equal(properties['--tm-destination-image'],undefined)}
 }
});
test('canvas synchronization follows a late destination update and keeps legacy Hero sources working',()=>{
 const source=fs.readFileSync(path.join(root,'assets/trip-redesign.js'),'utf8');
 const setup=source.slice(source.indexOf('  var hero ='),source.indexOf('  var mapTrigger ='));
 for(const custom of [true,false]){
  let sourceImage="url('https://example.test/first.jpg')",observer;
  const bodyValues={};const hero={style:{getPropertyValue:()=>custom?sourceImage:'',get backgroundImage(){return custom?'':sourceImage}}};
  vm.runInNewContext(setup,{document:{querySelector:()=>hero,body:{style:{setProperty:(k,v)=>bodyValues[k]=v}}},window:{},getComputedStyle:()=>({backgroundImage:'none'}),MutationObserver:class{constructor(callback){observer=callback}observe(){}}});
  assert.equal(bodyValues['--trip-bg-image'],'url("https://example.test/first.jpg")');
  sourceImage="url('https://example.test/second.jpg')";observer();
  assert.equal(bodyValues['--trip-bg-image'],'url("https://example.test/second.jpg")');
 }
});
