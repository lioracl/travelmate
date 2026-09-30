'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/learned-preferences.js'), 'utf8');

function loadApi() {
  const window = { dispatchEvent() {} };
  const sandbox = {
    window,
    Date,
    Object,
    Number,
    String,
    Array,
    Math,
    URL,
    CustomEvent: function CustomEvent(type) { this.type = type; }
  };
  vm.runInNewContext(source, sandbox, { filename: 'learned-preferences.js' });
  return window.TravelMateLearnedPreferences;
}

test('learned preference review state machine enforces the contract transitions', () => {
  const api = loadApi();
  const candidate = api.normalizeCandidate({
    id: 'lp-1',
    preferenceKey: 'pace',
    value: 'balanced',
    confidence: 0.4
  });

  assert.equal(candidate.reviewState, 'suggested');
  assert.equal(api.transition(candidate, 'confirmed', '2026-10-01T08:00:00Z').reviewState, 'confirmed');
  assert.equal(api.transition(candidate, 'deleted'), 'null' === 'null' ? false : true);
  assert.equal(api.transition(candidate, 'rejected').reviewState, 'rejected');

  const rejected = api.transition(candidate, 'rejected', '2026-10-01T08:00:00Z');
  assert.equal(api.transition(rejected, 'confirmed'), null);
  assert.equal(api.transition(rejected, 'deleted').reviewState, 'deleted');
});

test('only structured non-sensitive evidence can enter a learned preference', () => {
  const api = loadApi();
  const allowed = api.createEvidence({
    id: 'e1',
    sourceTripId: 'trip-1',
    eventKind: 'completed_place',
    eventRef: 'place-42',
    observedAt: '2026-09-29T10:00:00Z',
    weight: 0.8
  });

  assert.equal(allowed.eventKind, 'completed_place');
  assert.equal(api.createEvidence({ eventKind: 'document', eventRef: 'doc-1' }), null);
  assert.equal(api.createEvidence({ eventKind: 'receipt_text', eventRef: 'receipt-1' }), null);
  assert.equal(api.createEvidence({ eventKind: 'raw_gps', eventRef: 'gps-1' }), null);
  assert.equal(api.createEvidence({ eventKind: 'private_message', eventRef: 'msg-1' }), null);
});

test('evidence increases confidence once and does not duplicate', () => {
  const api = loadApi();
  const candidate = api.normalizeCandidate({
    id: 'lp-2',
    preferenceKey: 'transport',
    value: 'transit',
    confidence: 0.4
  });
  const evidence = {
    id: 'e2',
    sourceTripId: 'trip-1',
    eventKind: 'completed_activity',
    eventRef: 'activity-7',
    observedAt: '2026-09-29T10:00:00Z',
    weight: 1
  };

  const updated = api.addEvidence(candidate, evidence, 0.2, '2026-10-01T08:00:00Z');
  assert.equal(updated.confidence, 0.6);
  assert.equal(updated.evidence.length, 1);

  const duplicate = api.addEvidence(updated, evidence, 0.2, '2026-10-01T09:00:00Z');
  assert.equal(duplicate.confidence, 0.6);
  assert.equal(duplicate.evidence.length, 1);
});

test('deleted and rejected learned preferences never enter Mate personalization', () => {
  const api = loadApi();
  const candidate = api.normalizeCandidate({
    id: 'lp-3',
    preferenceKey: 'tripStyle',
    value: 'culture',
    confidence: 0.8
  });

  assert.ok(api.exportForMate(candidate, true));
  assert.equal(api.exportForMate(candidate, false), null);

  const rejected = api.transition(candidate, 'rejected');
  const deleted = api.transition(rejected, 'deleted');

  assert.equal(api.exportForMate(rejected, true), null);
  assert.equal(api.exportForMate(deleted, true), null);
});

test('removing source evidence lowers confidence and never invents replacement evidence', () => {
  const api = loadApi();
  const candidate = api.addEvidence(
    api.normalizeCandidate({
      id: 'lp-4',
      preferenceKey: 'pace',
      value: 'active',
      confidence: 0.7
    }),
    {
      id: 'e3',
      sourceTripId: 'trip-2',
      eventKind: 'completed_place',
      eventRef: 'place-9',
      observedAt: '2026-09-28T10:00:00Z',
      weight: 1
    },
    0.2,
    '2026-10-01T08:00:00Z'
  );

  const afterDelete = api.removeEvidence(candidate, item => item.sourceTripId === 'trip-2');
  assert.ok(afterDelete.confidence < candidate.confidence);
  assert.equal(afterDelete.evidence.length, 0);
});
