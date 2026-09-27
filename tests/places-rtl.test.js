'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/nearby.js'), 'utf8');
const window = { dispatchEvent() {} };
const document = { querySelectorAll() { return []; }, documentElement: {} };
class MutationObserver { observe() {} }
class CustomEvent { constructor(type) { this.type = type; } }
vm.runInNewContext(source, { window, document, MutationObserver, CustomEvent, URL, URLSearchParams, Map, Set, console });

test('map labels prefer Hebrew, preserve native non-Hebrew names, then Arabic fallback', () => {
  const changed = [];
  const map = {
    getStyle() { return { layers: [
      { id:'place-label', type:'symbol', layout:{'text-field':['get','name']} },
      { id:'highway-shield', type:'symbol', layout:{'text-field':['get','ref']} }
    ] }; },
    setLayoutProperty(id, property, value) { changed.push({id,property,value:Array.from(value)}); }
  };
  window.TravelMateNearbyTest.keepHebrewOrEnglishLabels(map);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, 'place-label');
  assert.deepEqual(changed[0].value.slice(0,4).map(value => Array.isArray(value) ? Array.from(value) : value), [
    'coalesce', ['get','name:he'], ['get','name'], ['get','name:ar']
  ]);
});
