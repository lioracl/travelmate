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
const { canonicalPlaces } = window.TravelMateNearbyTest;

test('Hebrew, English and OSM records for the same Wikidata entity have one canonical OSM identity', () => {
  const he = { id: 'wikipedia:he:1819796', name: 'כיכר הרפובליקה', lat: 41.9025, lon: 12.496389, type: 'attractions', category: 'attraction', source: 'Wikipedia', wikidata: 'Q1202365', wikipedia: 'https://he.wikipedia.org/wiki/test', distance: 10 };
  const en = { id: 'wikipedia:en:15294495', name: 'Piazza della Repubblica', lat: 41.90251, lon: 12.49639, type: 'attractions', category: 'attraction', source: 'Wikipedia', wikidata: 'Q1202365', distance: 11 };
  const osm = { id: 'osm:way:123', name: 'Piazza della Repubblica', lat: 41.9025, lon: 12.496389, type: 'attractions', category: 'attraction', source: 'OpenStreetMap', wikidata: 'Q1202365', distance: 9 };
  const result = canonicalPlaces([he, en, osm]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'osm:way:123');
  assert.equal(result[0].wikidata, 'Q1202365');
  assert.ok(result[0].aliases.includes('כיכר הרפובליקה'));
  assert.ok(result[0].aliases.includes('piazza della repubblica'));
  assert.ok(result[0].nameAliases.includes('Piazza della Repubblica'));
});

test('Wikipedia-only identity is stable across language availability and result order', () => {
  const he={id:'wikipedia:he:1',name:'כיכר הרפובליקה',source:'Wikipedia',wikidata:'Q1202365',lat:41.9025,lon:12.496389};
  const en={...he,id:'wikipedia:en:2',name:'Piazza della Repubblica'};
  assert.equal(canonicalPlaces([he])[0].id,'wikidata:Q1202365');
  assert.equal(canonicalPlaces([en])[0].id,'wikidata:Q1202365');
  assert.equal(canonicalPlaces([en,he]).length,1);
  assert.equal(canonicalPlaces([en,he])[0].providerIds.length,2);
});

test('nearby businesses with distinct OSM identities remain distinct', () => {
  const first = { id:'osm:node:1', name:'Cafe Roma', lat:41.9, lon:12.49, type:'food', category:'cafe', source:'OpenStreetMap' };
  const second = { ...first, id:'osm:node:2', lat:41.90001 };
  assert.equal(canonicalPlaces([first, second]).length, 2);
});

test('geographic fallback needs matching category and name alias', () => {
  const osm = { id:'osm:way:8', name:'Náměstí Republiky', englishName:'Republic Square', lat:50.088, lon:14.428, type:'attractions', category:'attraction', source:'OpenStreetMap' };
  const wiki = { id:'wikipedia:en:9', name:'Republic Square', lat:50.08801, lon:14.428, type:'attractions', category:'attraction', source:'Wikipedia' };
  const business = { id:'wikipedia:en:10', name:'Republic Square', lat:50.08801, lon:14.428, type:'food', category:'restaurant', source:'Wikipedia' };
  assert.equal(canonicalPlaces([osm, wiki, business]).length, 2);
});
