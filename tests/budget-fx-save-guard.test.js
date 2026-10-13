const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets/trip-experience.js'), 'utf8');
const match = source.match(/  function budgetEditorEuros\(localValue\) \{[\s\S]*?\n  \}/);
assert.ok(match, 'budgetEditorEuros helper must exist');
function convert(state, input) {
  const context = { state, input, Number, String };
  vm.runInNewContext(match[0] + '\nresult = budgetEditorEuros(input);', context); return context.result;
}
test('EUR identity works offline without an FX quote', () => assert.equal(convert({localCurrency:'EUR',rates:{}}, 125), 125));
test('CZK quote converts local entry to canonical EUR', () => assert.equal(convert({localCurrency:'CZK',rates:{CZK:25},rateDate:'2026-10-12',rateSource:'ExchangeRate-API'},250), 10));
test('missing quote blocks foreign budget save', () => assert.equal(convert({localCurrency:'CZK',rates:{},rateDate:'2026-10-12',rateSource:'ExchangeRate-API'},250), null));
test('missing quote provenance blocks foreign budget save', () => assert.equal(convert({localCurrency:'CZK',rates:{CZK:25},rateDate:'',rateSource:'ExchangeRate-API'},250), null));
test('zero quote blocks foreign budget save', () => assert.equal(convert({localCurrency:'CZK',rates:{CZK:0},rateDate:'2026-10-12',rateSource:'ExchangeRate-API'},250), null));
test('negative input is rejected', () => assert.equal(convert({localCurrency:'EUR',rates:{}},-5), null));
test('empty input is rejected', () => assert.equal(convert({localCurrency:'EUR',rates:{}},''), null));
test('zero budget is allowed', () => assert.equal(convert({localCurrency:'EUR',rates:{}},0), 0));
test('guard precedes canonical budget mutation', () => {
  const guard = source.indexOf('if (!unlimited && euroValue === null)');
  const mutation = source.indexOf('state.trip.budget = euroValue;');
  assert.ok(guard >= 0 && mutation > guard);
  assert.match(source, /state\.trip\.budgetFx = \{/);
  assert.match(source, /rateDate: state\.localCurrency === 'EUR' \? null : state\.rateDate/);
});

function submitBudget(state, mode, value) {
  const handler = source.match(/    form\.onsubmit = function \(event\) \{[\s\S]*?\n    \};/);
  assert.ok(handler, 'budget submit handler must exist');
  const calls = { saves: 0, toasts: [] };
  const form = { elements: { budgetMode: { value: mode } }, total: { value } };
  const context = {
    state, form, Number, String, Boolean, experienceAvailable: true, localStorage: { getItem: () => null },
    document: { querySelectorAll: () => [] },
    saveTripData: () => { calls.saves += 1; },
    renderLocalBudgetTotals: () => {}, renderCurrency: () => {}, renderBudgetCharts: () => {},
    toast: message => calls.toasts.push(message)
  };
  vm.runInNewContext(match[0] + '\n' + handler[0], context);
  form.onsubmit({ preventDefault() {} });
  return calls;
}
test('foreign-currency save with missing FX leaves existing budget and mode unchanged', () => {
  const state = { trip: { budget: 500 }, localCurrency: 'CZK', rates: {}, budgetUnlimited: true };
  const calls = submitBudget(state, 'limited', '250');
  assert.equal(state.trip.budget, 500);
  assert.equal(state.budgetUnlimited, true);
  assert.equal(calls.saves, 0);
  assert.equal(calls.toasts.length, 1);
});
test('valid foreign-currency save records rate source, date, stale flag and EUR value', () => {
  const state = { trip: { budget: 500 }, localCurrency: 'CZK', rates: { CZK: 25 }, rateDate: '2026-10-12', rateSource: 'Test FX', rateSourceUrl: 'https://example.org/fx', rateStale: true, budgetUnlimited: false };
  const calls = submitBudget(state, 'limited', '250');
  assert.equal(state.trip.budget, 10);
  assert.equal(state.trip.budgetFx.enteredAmount, 250);
  assert.equal(state.trip.budgetFx.eurToEnteredCurrencyRate, 25);
  assert.equal(state.trip.budgetFx.rateDate, '2026-10-12');
  assert.equal(state.trip.budgetFx.source, 'Test FX');
  assert.equal(state.trip.budgetFx.stale, true);
  assert.equal(calls.saves, 1);
});
test('unlimited mode can be saved offline without a currency quote', () => {
  const state = { trip: { budget: 500 }, localCurrency: 'CZK', rates: {}, budgetUnlimited: false };
  const calls = submitBudget(state, 'unlimited', '');
  assert.equal(state.trip.budget, 500);
  assert.equal(state.budgetUnlimited, true);
  assert.equal(calls.saves, 1);
});

// Controlled mocks; executes full repository module and actual editor creation/save path.
function editorHarness(currency = 'CZK', cloudEnabled = true) {
  const data = new Map([['travelmate-active-user', 'A']]);
  const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  const events = {}, queued = [], nodes = [];
  let rows = [];
  const window = { addEventListener: (name, fn) => { events[name] = fn; }, dispatchEvent() {}, matchMedia: () => ({ matches: false }) };
  if (cloudEnabled) window.TravelMateCloud = {
    getLocalTrips: () => JSON.parse(JSON.stringify(rows)),
    upsertLocalTrip: trip => { rows = [JSON.parse(JSON.stringify(trip))]; },
    queueTripSave: trip => queued.push(JSON.parse(JSON.stringify(trip)))
  };
  const form = { dataset: {}, total: { value: '' }, elements: { budgetMode: { value: '' } }, classList: { toggle() {} }, prepend() {}, addEventListener() {}, querySelector: () => ({ focus() {} }) };
  const hero = { querySelector: () => null, append: (...items) => nodes.push(...items) };
  const document = { getElementById: () => ({ querySelector: () => hero }), querySelector: () => null, querySelectorAll: () => [], createElement: tag => tag === 'form' ? form : { dataset: {}, setAttribute() {} } };
  const context = { window, localStorage, document, location: { pathname: '/trip/custom/', search: '?id=same' }, URLSearchParams, CustomEvent: function () {}, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/trip-store.js'), 'utf8'), context);
  const fullSource = source.replace(/  init\(\);\s*\}\)\(\);\s*$/, `
    renderLocalBudgetTotals = renderCurrency = renderBudgetCharts = renderExpenseList = renderMemories = renderAlbumActions = renderSummary = renderBudgetColumns = function () {};
    toast = function (message) { window.lastToast = message; };
    window.harness = { state: state, create: createTotalBudgetEditor, refresh: refreshFromCanonicalTrip };
  })();`);
  vm.runInContext(fullSource, context);
  const state = window.harness.state;
  Object.assign(state, { trip: { id: 'same', ownerId: 'A', budget: 500, budgetUnlimited: true, budgetFx: { previous: true } }, localCurrency: currency, budgetUnlimited: true });
  window.harness.create();
  return { state, form, queued, localStorage, window, submit(mode, value) { form.elements.budgetMode.value = mode; form.total.value = value; form.onsubmit({ preventDefault() {} }); }, roundtrip() { return JSON.parse(JSON.stringify(window.TravelMateTripStore.getTrip('same', 'A'))); }, switchAccount(user, trips = []) { localStorage.setItem('travelmate-active-user', user); events['travelmate:account-context-changed']({ detail: { trips } }); } };
}
for (const [name, override] of Object.entries({
  'nonfinite rate': { rates: { CZK: Infinity } },
  'negative rate': { rates: { CZK: -25 } },
  'blank source': { rateSource: '  ' },
  'invalid date': { rateDate: 'not-a-date' },
  'overflow result': { rates: { CZK: Number.MIN_VALUE } }
})) test('actual editor preserves all canonical data for ' + name, () => {
  const h = editorHarness();
  Object.assign(h.state, { rates: { CZK: 25 }, rateSource: 'Controlled FX mock', rateDate: '2026-10-12' }, override);
  const before = JSON.stringify(h.state.trip);
  h.submit('limited', '250');
  assert.equal(JSON.stringify(h.state.trip), before);
  assert.equal(h.state.budgetUnlimited, true);
  assert.equal(h.queued.length, 0);
});
test('actual submit records input through canonical store and cloud queue stub', () => {
  const h = editorHarness();
  Object.assign(h.state, { rates: { CZK: 25 }, rateSource: 'Controlled FX mock', rateDate: '2026-10-12', rateStale: true });
  h.submit('limited', '250.5');
  const saved = h.roundtrip();
  assert.equal(saved.budget, 10.02);
  assert.equal(saved.budgetFx.enteredAmount, 250.5);
  assert.equal(saved.budgetFx.stale, true);
  assert.equal(saved.budgetUnlimited, false);
  assert.match(saved.budgetFx.rounding, /numeric local amount; stored EUR unrounded/);
  assert.deepEqual(h.queued[0].budgetFx, saved.budgetFx);
  h.window.harness.refresh({ userId: 'A', trip: saved });
  assert.deepEqual(JSON.parse(JSON.stringify(h.state.trip.budgetFx)), saved.budgetFx);
});
test('actual EUR submit persists identity offline via canonical fallback', () => {
  const h = editorHarness('EUR', false); h.submit('limited', '125');
  assert.equal(h.roundtrip().budget, 125);
  assert.equal(h.roundtrip().budgetFx.source, 'identity');
  assert.equal(h.roundtrip().budgetFx.eurToEnteredCurrencyRate, 1);
});
test('actual unlimited submit preserves budget and provenance offline', () => {
  const h = editorHarness('CZK', false); h.submit('unlimited', '');
  assert.equal(h.roundtrip().budget, 500);
  assert.deepEqual(h.roundtrip().budgetFx, { previous: true });
  assert.equal(h.roundtrip().budgetUnlimited, true);
});
test('account switch without matching trip cannot save through retained editor', () => {
  const h = editorHarness('EUR'); h.switchAccount('B'); h.submit('limited', '100');
  assert.equal(h.queued.length, 0); assert.equal(h.state.trip, null);
});
test('changed active owner cannot mutate previous owner budget or metadata', () => {
  const h = editorHarness('EUR'); const before = JSON.stringify(h.state.trip);
  h.localStorage.setItem('travelmate-active-user', 'B'); h.submit('limited', '100');
  assert.equal(JSON.stringify(h.state.trip), before); assert.equal(h.queued.length, 0);
});

test('actual Cloud Sync RPC stub preserves budgetFx through save and remote canonical read', async () => {
  const h = editorHarness();
  Object.assign(h.state, { rates: { CZK: 25 }, rateSource: 'Controlled FX mock', rateDate: '2026-10-12' });
  h.submit('limited', '250');
  const trip = h.roundtrip(), data = new Map([['travelmate-active-user', 'A']]);
  const localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  let sent;
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'A' } } } }) },
    rpc: async (name, args) => {
      assert.equal(name, 'save_travel_trip');
      sent = JSON.parse(JSON.stringify(args.p_trip));
      return { data: [{ result_status: 'saved', result_revision: 1, result_updated_at: '2026-10-13' }] };
    },
    from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, async limit() {
      return { data: [{ id: 'same', user_id: 'A', budget: sent.budget, payload: sent, revision: 2, updated_at: '2026-10-14' }] };
    } })
  };
  const window = { __travelMateSupabaseClient: client, dispatchEvent() {}, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/cloud-sync.js'), 'utf8'), {
    window, localStorage, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {}, console, setTimeout, clearTimeout, AbortController, CustomEvent: function () {}
  });
  await window.TravelMateCloud.saveTrip(trip, 'A');
  assert.deepEqual(sent.budgetFx, trip.budgetFx);
  const remote = await window.TravelMateCloud.getTrip('same', 'A');
  assert.deepEqual(JSON.parse(JSON.stringify(remote.budgetFx)), trip.budgetFx);
  assert.equal(remote.budget, 10);
  assert.equal(remote.budgetUnlimited, false);
});
