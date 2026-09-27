'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/nearby.js'), 'utf8');
const window = { dispatchEvent() {} };
const document = {
  querySelectorAll() { return []; }, documentElement: {},
  createDocumentFragment() { return { cards:[], appendChild(card) { this.cards.push(card); } }; }
};
class MutationObserver { observe() {} }
class CustomEvent { constructor(type) { this.type = type; } }
vm.runInNewContext(source, { window, document, MutationObserver, CustomEvent, URL, URLSearchParams, Map, Set, console });

test('100 already sorted Places cards avoid redundant DOM moves and visibility writes', () => {
  let hiddenWrites=0, appendCalls=0;
  const cards=Array.from({length:100},(_,index) => {
    let hidden=false;
    return { dataset:{ distance:String(index), resultName:String(100-index).padStart(3,'0'), info:'0', hasSite:'1', kosher:'0', hasImage:'0' },
      get hidden() { return hidden; }, set hidden(value) { hidden=value; hiddenWrites++; } };
  });
  const controls={};
  ['filter','sort'].forEach(key => { controls[key]={value:key==='filter'?'all':'distance',addEventListener(type,listener) { this[type]=listener; }}; });
  const count={textContent:''}, empty={hidden:false};
  const result={
    querySelector(selector) { return ({'[data-nearby-result-filter]':controls.filter,'[data-nearby-result-sort]':controls.sort,'[data-nearby-visible-count]':count,'[data-nearby-filter-empty]':empty})[selector]; },
    querySelectorAll() { return cards.slice(); },
    appendChild(fragment) { appendCalls++; cards.splice(0,cards.length,...fragment.cards); }
  };
  window.TravelMateNearbyTest.wireResultTools(result);
  assert.equal(appendCalls,0);
  assert.equal(hiddenWrites,0);
  assert.equal(count.textContent,'100 תוצאות');
  controls.sort.value='name'; controls.sort.change();
  assert.equal(appendCalls,1);
  assert.equal(cards[0].dataset.resultName,'001');
  controls.sort.value='distance'; controls.sort.change();
  assert.equal(appendCalls,2);
  assert.equal(cards[0].dataset.distance,'0');
});
