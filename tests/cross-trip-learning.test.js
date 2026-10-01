'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/learned-preferences.js', 'utf8');

function api() {
  const window = { dispatchEvent() {} };
  const sandbox = {
    window, Date, Object, Number, String, Array, Math, URL,
    CustomEvent: function CustomEvent(type) { this.type = type; }
  };
  vm.runInNewContext(source, sandbox);
  return window.TravelMateLearnedPreferences;
}

test('cross-trip suggestions require two owned trips and remain suggested', () => {
  const a = api();
  const suggestions = a.buildCrossTripSuggestions([
    {
      id: 't1', ownerId: 'u1',
      activities: [{ id: 'a1', category: 'museum', done: true }]
    },
    {
      id: 't2', ownerId: 'u1',
      savedPlaces: [{ id: 'p1', category: 'museum', done: true }]
    },
    {
      id: 't3', ownerId: 'u2',
      activities: [{ id: 'a2', category: 'museum', done: true }]
    }
  ], 'u1');

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].preferenceKey, 'interests');
  assert.equal(suggestions[0].value, 'culture');
  assert.equal(suggestions[0].reviewState, 'suggested');
  assert.equal(suggestions[0].sourceScope, 'cross_trip');
  assert.equal(suggestions[0].evidence.length, 2);
});

test('shared or foreign trips cannot become learning evidence', () => {
  const a = api();
  const suggestions = a.buildCrossTripSuggestions([
    { id: 't1', ownerId: 'u1', activities: [{ id: 'a1', category: 'museum', done: true }] },
    { id: 't2', ownerId: 'u2', activities: [{ id: 'a2', category: 'museum', done: true }] }
  ], 'u1');

  assert.equal(suggestions.length, 0);
});

test('single-trip repetition does not become cross-trip learning', () => {
  const a = api();
  const suggestions = a.buildCrossTripSuggestions([
    {
      id: 't1', ownerId: 'u1',
      activities: [
        { id: 'a1', category: 'restaurant', done: true },
        { id: 'a2', category: 'restaurant', done: true }
      ]
    },
    { id: 't2', ownerId: 'u1', activities: [{ id: 'a3', category: 'park', done: true }] }
  ], 'u1');

  assert.equal(suggestions.some(item => item.value === 'food'), false);
});

test('document-like and private sources are never read by the cross-trip builder', () => {
  const a = api();
  const suggestions = a.buildCrossTripSuggestions([
    {
      id: 't1', ownerId: 'u1',
      documents: [{ id: 'd1', category: 'museum', done: true }],
      activities: [{ id: 'a1', category: 'private_message', done: true }]
    },
    {
      id: 't2', ownerId: 'u1',
      documents: [{ id: 'd2', category: 'museum', done: true }]
    }
  ], 'u1');

  assert.equal(suggestions.length, 0);
});

test('learning disabled is enforced before Mate export', () => {
  const a = api();
  const suggestion = a.buildCrossTripSuggestions([
    { id: 't1', ownerId: 'u1', activities: [{ id: 'a1', category: 'museum', done: true }] },
    { id: 't2', ownerId: 'u1', activities: [{ id: 'a2', category: 'museum', done: true }] }
  ], 'u1')[0];

  assert.equal(a.exportForMate(suggestion, true), null);
  const confirmed = a.transition(suggestion, 'confirmed');
  assert.ok(a.exportForMate(confirmed, true));
  assert.equal(a.exportForMate(confirmed, false), null);
});
