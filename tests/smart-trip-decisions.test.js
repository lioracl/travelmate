const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/smart-trip-decisions.js');

const date = '2026-10-13';
const at = (hour, minute = 0) => new Date(2026, 9, 13, hour, minute);
const trip = (activities = [], extras = {}) => Object.assign({
  id: 'trip-1', ownerId: 'owner-1', activities, savedPlaces: []
}, extras);
const item = (id, time, scheduleMode = 'fixed', extras = {}) => Object.assign({
  id, date, time, scheduleMode, duration: 60, title: id
}, extras);
const evaluate = (value, overrides = {}) => engine.analyze(Object.assign({
  trip: value, now: at(12), date
}, overrides));
const keys = result => result.recommendations.map(entry => entry.key);

test('decision engine is deterministic, bounded and never mutates canonical input', () => {
  const value = trip([item('a', '12:20', 'fixed', { duration: 90 }), item('b', '13:00')]);
  const before = JSON.stringify(value);
  const first = evaluate(value, { routingById: { a: { minutes: 45, source: 'estimate' } } });
  const second = evaluate(value, { routingById: { a: { minutes: 45, source: 'estimate' } } });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(value), before);
  assert.equal(first.recommendations[0].key, 'overlap:b');
  assert.ok(first.recommendations.every(entry => entry.advisory === true && entry.provenance && entry.confidence && entry.reason));
  assert.ok(Object.isFrozen(first.recommendations));
  assert.ok(first.alternatives.length <= 3);
});

test('fixed reservations overlap but flexible/window and completed activities never create hard conflicts', () => {
  const value = trip([
    item('fixed', '12:30', 'booked', { duration: 120 }),
    item('flex', '13:00', 'flexible'),
    item('window', '13:15', 'window'),
    item('done', '13:30', 'fixed', { done: true }),
    item('next', '14:00', 'reservation')
  ]);
  assert.ok(keys(evaluate(value)).includes('overlap:next'));
  assert.ok(!keys(evaluate(value)).some(key => /flex|window|done/.test(key)));
});

test('late warning requires a supplied travel estimate and marks its provenance', () => {
  const value = trip([item('dinner', '12:30')]);
  assert.ok(!keys(evaluate(value)).some(key => key.startsWith('late:')));
  const estimated = evaluate(value, { routingById: { dinner: { minutes: 15, source: 'estimate' } } });
  assert.ok(keys(estimated).includes('late:dinner') === false);
  const late = evaluate(value, { routingById: { dinner: { minutes: 35, source: 'live' } } });
  assert.equal(late.recommendations[0].key, 'late:dinner');
  assert.equal(late.recommendations[0].confidence, 'high');
  assert.equal(late.recommendations[0].provenance, 'routing:live');
});

test('offline with unknown route never invents arrival time or late status', () => {
  const value = trip([item('flight', '12:40')]);
  const result = evaluate(value, { offline: true });
  assert.ok(keys(result).includes('routing-unknown:flight'));
  assert.ok(!keys(result).includes('late:flight'));
  assert.equal(result.recommendations[0].confidence, 'low');
});

test('opening status must have explicit source; unknown hours cannot be labeled closed', () => {
  const value = trip([item('museum', '13:00')]);
  assert.ok(!keys(evaluate(value, { openingById: { museum: { status: 'closed' } } })).includes('opening:museum'));
  assert.ok(keys(evaluate(value, { openingById: { museum: { status: 'closed', source: 'opening-hours-provider' } } })).includes('opening:museum'));
  assert.ok(!keys(evaluate(value, { openingById: { museum: { status: 'unknown', source: 'provider' } } })).includes('opening:museum'));
});

test('rain is advisory only for known outdoor categories with ready weather', () => {
  const value = trip([item('park', '13:00', 'flexible', { category: 'parks' })]);
  assert.ok(keys(evaluate(value, { weather: { ready: true, weatherCode: 61 } })).includes('weather:park'));
  assert.ok(!keys(evaluate(value, { weather: { ready: false, weatherCode: 61 } })).includes('weather:park'));
  assert.ok(!keys(evaluate(trip([item('museum', '13:00', 'flexible', { category: 'museums' })]), { weather: { ready: true, precipitationProbability: 80 } })).includes('weather:museum'));
});

test('transition risk preserves route evidence and stays advisory', () => {
  const value = trip([item('a', '12:20'), item('b', '13:20')]);
  const context = { transitionAssessmentsForDate() { return { 'activity:b': { risk: true, shortfallMinutes: 15, source: 'estimate' } }; } };
  const result = evaluate(value, { context });
  const warning = result.recommendations.find(entry => entry.key === 'transition:activity:b');
  assert.equal(warning.confidence, 'medium');
  assert.equal(warning.provenance, 'routing:estimate');
  assert.equal(warning.action.href, '#plan');
});

test('free time offers Places without time filtering, GPS, or changing the trip', () => {
  const value = trip([item('flex', '15:00', 'flexible')]);
  const context = { freeTimeWindowsForDate() { return [{ startTime: '12:00', durationMinutes: 90 }]; } };
  const result = evaluate(value, { context });
  assert.equal(result.recommendations[0].key, 'free:12:00');
  assert.equal(result.alternatives[0].kind, 'move-activity');
  assert.equal(result.alternatives[0].activityId, 'flex');
  assert.equal(result.alternatives[0].newTime, '12:15');
  assert.equal(value.activities[0].time, '15:00');
});

test('priority and three-item cap are stable with simultaneous issues', () => {
  const value = trip([
    item('a', '12:10', 'fixed', { duration: 120, category: 'parks' }),
    item('b', '12:30', 'fixed', { category: 'parks' }),
    item('c', '13:00', 'flexible', { category: 'parks' })
  ]);
  const result = evaluate(value, {
    offline: true,
    openingById: { a: { status: 'closed', source: 'provider' } },
    weather: { ready: true, weatherCode: 61 },
    routingById: { a: { minutes: 30, source: 'estimate' } }
  });
  assert.equal(result.recommendations.length, 3);
  assert.deepEqual(keys(result), ['overlap:b', 'late:a', 'opening:a']);
});

test('preview -> confirm -> apply -> undo is pure, explicit and owner scoped', () => {
  const value = trip([item('flex', '15:00', 'flexible'), item('fixed', '18:00')]);
  const preview = engine.previewMove(value, 'flex', '16:00', { ownerId: 'owner-1' });
  assert.equal(preview.state, 'preview');
  assert.equal(value.activities[0].time, '15:00');
  assert.throws(() => engine.applyMove(value, preview), /CONFIRM_REQUIRED/);
  const confirmed = engine.confirmMove(preview);
  const applied = engine.applyMove(value, confirmed);
  assert.equal(applied.state, 'applied');
  assert.equal(applied.trip.activities[0].time, '16:00');
  assert.equal(value.activities[0].time, '15:00');
  assert.equal(applied.trip.activities[1], value.activities[1]);
  const undone = engine.undoMove(applied.trip, applied.undoToken);
  assert.equal(undone.state, 'undone');
  assert.equal(undone.trip.activities[0].time, '15:00');
});

test('cannot move a fixed, completed, invalid, or other-account activity', () => {
  const value = trip([item('fixed', '18:00'), item('done', '16:00', 'flexible', { done: true }), item('flex', '15:00', 'flexible')]);
  assert.throws(() => engine.previewMove(value, 'fixed', '17:00', { ownerId: 'owner-1' }), /NOT_MOVABLE/);
  assert.throws(() => engine.previewMove(value, 'done', '17:00', { ownerId: 'owner-1' }), /NOT_MOVABLE/);
  assert.throws(() => engine.previewMove(value, 'flex', '25:00', { ownerId: 'owner-1' }), /INVALID_TIME/);
  assert.throws(() => engine.previewMove(value, 'flex', '17:00', { ownerId: 'other' }), /ACCOUNT_OR_TRIP_CHANGED/);
});

test('stale confirmation or changed activity blocks apply and undo', () => {
  const value = trip([item('flex', '15:00', 'flexible')]);
  const confirmed = engine.confirmMove(engine.previewMove(value, 'flex', '16:00', { ownerId: 'owner-1' }));
  const changed = trip([item('flex', '15:30', 'flexible')]);
  assert.throws(() => engine.applyMove(changed, confirmed), /STALE_PREVIEW/);
  const applied = engine.applyMove(value, confirmed);
  applied.trip.activities[0].title = 'concurrent edit';
  assert.throws(() => engine.undoMove(applied.trip, applied.undoToken), /UNDO_CONFLICT/);
  assert.throws(() => engine.undoMove(trip([item('flex', '16:00', 'flexible')], { ownerId: 'other' }), applied.undoToken), /ACCOUNT_OR_TRIP_CHANGED/);
});

test('browser global loads without persistence, GPS, provider or AI access', () => {
  const source = fs.readFileSync('assets/smart-trip-decisions.js', 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|geolocation|currentPosition\s*\(|saveTrip\s*\(|updateTrip\s*\(|localStorage|sessionStorage/);
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.TravelMateSmartTripDecisions.analyze, 'function');
});

test('live plan-transition evidence overrides only matching fresh-date estimates', () => {
  const value = trip([item('a', '12:20'), item('b', '13:20')]);
  const context = { transitionAssessmentsForDate() { return { 'activity:b': { date, risk: true, shortfallMinutes: 15, source: 'estimate' } }; } };
  const live = evaluate(value, { context, transitionById: { 'activity:b': { date, risk: true, shortfallMinutes: 7, source: 'live', provider: 'OpenStreetMap routing' } } });
  const warning = live.recommendations.find(entry => entry.key === 'transition:activity:b');
  assert.equal(warning.confidence, 'high'); assert.equal(warning.provenance, 'routing:live'); assert.match(warning.reason, /7/);
  const stale = evaluate(value, { context, transitionById: { 'activity:b': { date: '2026-10-12', risk: true, shortfallMinutes: 2, source: 'live' } } });
  const fallback = stale.recommendations.find(entry => entry.key === 'transition:activity:b');
  assert.equal(fallback.confidence, 'medium'); assert.equal(fallback.provenance, 'routing:estimate'); assert.match(fallback.reason, /15/);
  const cleared = evaluate(value, { context, transitionById: { 'activity:b': { date, risk: false, shortfallMinutes: 0, source: 'live' } } });
  assert.ok(!cleared.recommendations.some(entry => entry.key === 'transition:activity:b'));
});

test('activity-hour weather wins over current conditions', () => {
  const value = trip([item('park', '14:00', 'flexible', { category: 'parks' })]);
  const dryAtActivity = evaluate(value, { weather: { ready: true, weatherCode: 61, source: 'Open-Meteo' }, weatherByKey: { 'activity:park': { ready: true, weatherCode: 0, precipitationProbability: 0, source: 'Open-Meteo:hourly' } } });
  assert.ok(!keys(dryAtActivity).includes('weather:park'));
  const wetAtActivity = evaluate(value, { weather: { ready: true, weatherCode: 0, source: 'Open-Meteo' }, weatherByKey: { 'activity:park': { ready: true, weatherCode: 61, precipitationProbability: 80, source: 'Open-Meteo:hourly' } } });
  const warning = wetAtActivity.recommendations.find(entry => entry.key === 'weather:park');
  assert.equal(warning.provenance, 'weather:Open-Meteo:hourly');assert.equal(warning.confidence, 'medium');
  assert.equal(warning.title, 'גשם צפוי בזמן הפעילות');
  assert.match(warning.reason, /התחזית לשעת הפעילות/);
  assert.doesNotMatch(warning.title + warning.reason, /\?{2,}/);
  const futureWithoutHourly = evaluate(value, { weather: { ready: true, weatherCode: 61, source: 'Open-Meteo' } });
  assert.ok(!keys(futureWithoutHourly).includes('weather:park'));
});


test('transition-risk alternative is a real verified itinerary move and never mutates input', () => {
  const value = trip([item('a', '12:00', 'fixed', {duration:60}), item('b', '13:10', 'planned', {duration:30})]);
  const context = {
    scheduleMode(record) { return record.scheduleMode || 'planned'; },
    transitionAssessmentsForDate(candidate) {
      const target = candidate.activities.find(record => record.id === 'b');
      const risk = target.time === '13:10';
      return {'activity:b': {date, risk, shortfallMinutes:risk ? 20 : 0, source:'estimate'}};
    }
  };
  const before = JSON.stringify(value), result = evaluate(value, {context});
  const alternative = result.alternatives.find(entry => entry.activityId === 'b');
  assert.equal(JSON.stringify(value), before);
  assert.equal(alternative.kind, 'move-activity');
  assert.equal(alternative.oldTime, '13:10');
  assert.equal(alternative.newTime, '13:30');
  assert.match(alternative.reason, /20/);
  assert.equal(alternative.provenance, 'routing:estimate');
  assert.equal(alternative.confidence, 'medium');
  assert.ok(Object.isFrozen(result.alternatives));
});

test('real alternatives never move fixed window completed or past activities and stay capped at three', () => {
  const value = trip([
    item('past', '11:00', 'flexible'),
    item('fixed', '14:00', 'fixed'),
    item('window', '15:00', 'window'),
    item('done', '16:00', 'flexible', {done:true}),
    item('flex1', '17:00', 'flexible', {duration:30}),
    item('flex2', '18:00', 'flexible', {duration:30})
  ]);
  const context = {freeTimeWindowsForDate() { return [{startTime:'12:30', endTime:'13:45', durationMinutes:75}, {startTime:'19:00', endTime:'21:00', durationMinutes:120}]; }};
  const result = evaluate(value, {context});
  assert.ok(result.alternatives.length <= 3);
  assert.ok(result.alternatives.every(entry => ['flex1','flex2'].includes(entry.activityId)));
  assert.ok(result.alternatives.every(entry => entry.kind === 'move-activity' && entry.oldTime !== entry.newTime));
});
