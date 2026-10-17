'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/trip-experience.js'), 'utf8');

// Exercise the complete feature module with controlled DOM/services and the real canonical store.
function harness() {
  const values = new Map([['travelmate-active-user', 'qa']]);
  const localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
  const events = {}, queued = []; let rows = [];
  const window = { addEventListener: (k, f) => { events[k] = f; }, dispatchEvent() {}, TravelMateCloud: {
    getLocalTrips: () => JSON.parse(JSON.stringify(rows)), upsertLocalTrip: t => { rows = [JSON.parse(JSON.stringify(t))]; }, queueTripSave: t => queued.push(JSON.parse(JSON.stringify(t)))
  } };
  let focused;
  const node = () => ({ dataset: {}, hidden: false, value: '', textContent: '', innerHTML: '', attrs: {}, events: {}, classList: { toggle() {}, contains: () => false, add() {} }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { focused = this; }, addEventListener(k, f) { this.events[k] = f; }, appendChild() {}, prepend() {}, insertBefore() {}, insertAdjacentElement() {}, querySelector: () => null, scrollIntoView() {} });
  const form = node(); form.hidden = true;
  for (const name of ['amount', 'currency', 'category', 'date', 'note', 'receiptCamera', 'receiptFile']) form[name] = Object.assign(node(), { files: [] });
  form.currency.querySelector = () => ({});
  const submit = node(), toggle = node(), cancel = node(), status = node(), preview = node(), scan = node(), attachmentNodes = [];
  form.reportValidity = () => Number(form.amount.value) > 0 && Boolean(form.note.value.trim());
  form.reset = () => { if (form.events.reset) form.events.reset(); for (const name of ['amount', 'note', 'currency', 'date']) form[name].value = ''; form.receiptCamera.files = []; form.receiptFile.files = []; };
  form.querySelector = s => s === 'button[type="submit"]' ? submit : null;
  const panel = node(); const panelNodes = { '[data-receipt-form]': form, '[data-expense-toggle]': toggle, '[data-expense-cancel]': cancel, '[data-receipt-status]': status, '[data-receipt-preview]': preview, '[data-receipt-scan]': scan };
  panel.querySelector = s => panelNodes[s] || (panelNodes[s] = node());
  const charts = node(); charts.querySelector = () => node();
  const card = node(), converter = {};
  for (const key of ['amount', 'from', 'to', 'result', 'source', 'swap']) converter[key] = node();
  card.querySelector = s => converter[s.replace(/^\[data-converter-/, '').replace(/\]$/, '')] || (s === 'footer a' ? node() : null);
  const section = node(); section.querySelector = () => null;
  let sections = 0;
  const document = { getElementById: () => section, querySelector: s => s === '[data-currency-converter]' ? card : null, querySelectorAll: selector => selector === '[data-memory-form], [data-album-form], [data-receipt-form]' ? [form] : [], createElement(tag) {
    if (tag === 'div') return panel;
    if (tag === 'section') return sections++ === 0 ? charts : card;
    const e = node(); if (tag === 'details') attachmentNodes.push(e); return e;
  } };
  const context = { window, localStorage, document, location: { pathname: '/trip/custom/', search: '?id=qa-budget' }, URLSearchParams, CustomEvent: function () {}, console, setTimeout: () => 0, clearTimeout() {}, Intl };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/trip-store.js'), 'utf8'), context);
  vm.runInContext(source.replace(/  init\(\);\s*\}\)\(\);\s*$/, `
    renderExpenseList = renderBudgetColumns = renderSummary = renderBudgetCharts = renderMemories = renderAlbumActions = function () {};
    toast = function () {};
    window.budgetHarness = { state: state, create: createBudgetTools, createConverter: createCurrencyConverter, render: renderCurrencyConverter, quote: converterQuote, capture: function () { experienceBaseline = JSON.parse(JSON.stringify(state.trip)); }, receipt: function (fn) { storePrivateReceiptWithRetry = fn; }, scan: function (fn) { scanReceipt = fn; } };
  })();`), context);
  const api = window.budgetHarness;
  Object.assign(api.state, { trip: { id: 'qa-budget', ownerId: 'qa', expenses: [], budget: 500 }, localCurrency: 'CZK', expenses: [], budgetCategories: [], memories: [] });
  rows = [JSON.parse(JSON.stringify(api.state.trip))]; localStorage.setItem('travelmate-trips', JSON.stringify(rows)); api.capture(); api.create(); api.createConverter();
  const fill = (amount = '42.50') => { form.amount.value = amount; form.note.value = 'Controlled expense'; form.currency.value = 'CZK'; form.category.value = 'Food'; form.date.value = '2026-10-17'; };
  const submitForm = () => form.onsubmit({ preventDefault() {} });
  return { api, form, submit, toggle, cancel, scan, attachment: attachmentNodes[0], accountFocus: node(), accountChanged: () => events['travelmate:account-context-changed']({ detail: { trips: [] } }), converter, card, status, localStorage, queued, fill, submitForm, focused: () => focused, saved: () => window.TravelMateTripStore.getTrip('qa-budget', 'qa') };
}
function ready(h, override = {}) { Object.assign(h.api.state, { rate: 3.7, rates: { CZK: 25, ILS: 3.7 }, ilsRates: { ILS: 1, EUR: 3.7, CZK: 3.7 / 25 }, rateSource: 'Controlled FX', rateDate: new Date().toISOString(), rateStale: false }, override); }

test('converter separates zero, blank, invalid and identity without a quote', () => {
  const h = harness();
  for (const [input, status] of [['', 'empty'], [' ', 'empty'], ['no', 'invalid'], ['-1', 'invalid'], ['Infinity', 'invalid']]) assert.equal(h.api.quote(input, 'EUR', 'EUR').status, status);
  assert.equal(h.api.quote('0', 'EUR', 'EUR').converted, 0);
  assert.equal(h.api.quote('42.5', 'EUR', 'EUR').rate, 1);
  assert.equal(h.api.quote('0', 'CZK', 'ILS').status, 'unavailable');
});
test('converter uses existing cross rates and preserves before-fee semantics', () => {
  const h = harness(); ready(h); h.api.state.fee = 12;
  const q = h.api.quote('250', 'CZK', 'ILS'); assert.equal(q.status, 'ready'); assert.ok(Math.abs(q.converted - 37) < 1e-12, 'unrounded FX arithmetic has only floating-point error'); assert.ok(Math.abs(q.rate - 0.148) < 1e-12); assert.equal(q.stale, false);
});
for (const [name, override] of Object.entries({ negative: { ilsRates: { CZK: -2, ILS: 1 } }, nonfinite: { ilsRates: { CZK: Infinity, ILS: 1 } }, date: { rateDate: 'bad-date' }, source: { rateSource: '  ' }, missing: { rates: {}, ilsRates: { ILS: 1 }, rate: null } })) test('converter hides misleading totals for ' + name + ' quote', () => {
  const h = harness(); ready(h, override); h.converter.from.value = 'CZK'; h.converter.to.value = 'ILS'; h.converter.amount.value = '250'; h.api.render();
  assert.equal(h.card.dataset.quoteState, 'unavailable'); assert.match(h.converter.result.textContent, /אין שער/); assert.equal(h.converter.result.innerHTML, '');
});
test('stale flag and age each produce an explicit warning and source', () => {
  for (const override of [{ rateStale: true }, { rateDate: '2020-01-01' }]) {
    const h = harness(); ready(h, override); h.converter.from.value = 'CZK'; h.converter.to.value = 'ILS'; h.converter.amount.value = '250'; h.api.render();
    assert.match(h.converter.result.innerHTML, /שער ישן/); assert.match(h.converter.source.textContent, /Controlled FX/); assert.match(h.converter.result.innerHTML, /1 CZK =/);
  }
});
test('manual expense opens with focus and saves original currency through real canonical store once', async () => {
  const h = harness(); h.toggle.onclick(); assert.equal(h.focused(), h.form.amount); assert.equal(h.toggle.attrs['aria-expanded'], 'true');
  h.fill(); await h.submitForm(); await h.submitForm();
  assert.equal(h.saved().expenses.length, 1); assert.equal(h.saved().expenses[0].amount, 42.5); assert.equal(h.saved().expenses[0].currency, 'CZK'); assert.equal(h.queued.length, 1); assert.equal(h.form.hidden, true); assert.equal(h.focused(), h.toggle); assert.equal(h.toggle.attrs['aria-expanded'], 'false');
});
test('cancel and Escape discard draft with no canonical write; reopening clears draft', async () => {
  const h = harness(); h.toggle.onclick(); h.fill(); h.cancel.onclick(); await h.submitForm(); assert.equal(h.queued.length, 0); assert.equal(h.form.hidden, true); assert.equal(h.focused(), h.toggle);
  h.toggle.onclick(); assert.equal(h.form.amount.value, ''); h.fill(); let prevented = false; h.form.events.keydown({ key: 'Escape', preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(h.queued.length, 0);
});
test('expense positive amount policy rejects zero, negative, blank and invalid', async () => {
  for (const input of ['0', '-1', '', 'no', 'Infinity']) { const h = harness(); h.toggle.onclick(); h.fill(input); await h.submitForm(); assert.equal(h.queued.length, 0); }
});
test('pending receipt snapshots input, blocks repeated submit/cancel and saves once', async () => {
  const h = harness(); let finish; h.api.receipt(() => new Promise(resolve => { finish = resolve; })); h.toggle.onclick(); h.fill(); h.form.receiptCamera.files = [{ name: 'mock.png', type: 'image/png', size: 10 }];
  const pending = h.submitForm(); h.fill('999'); await h.submitForm(); h.cancel.onclick(); assert.equal(h.form.hidden, false); assert.equal(h.submit.disabled, true);
  finish('private/mock'); await pending; assert.equal(h.saved().expenses[0].amount, 42.5); assert.equal(h.queued.length, 1); assert.equal(h.submit.disabled, false);
});
test('late receipt completion after account switch cannot write a canonical expense', async () => {
  const h = harness(); let finish; h.api.receipt(() => new Promise(resolve => { finish = resolve; })); h.toggle.onclick(); h.fill(); h.form.receiptCamera.files = [{ name: 'mock.png', type: 'image/png', size: 10 }];
  const pending = h.submitForm(); h.localStorage.setItem('travelmate-active-user', 'other'); finish('private/mock'); await pending; assert.equal(h.queued.length, 0); assert.equal(h.api.state.expenses.length, 0);
});
test('optional receipt scan is single-flight and cannot overwrite a saved or cancelled draft', async () => {
  const h = harness(); let finish; let calls = 0;
  h.api.scan(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  h.toggle.onclick(); h.fill(); const pending = h.scan.onclick();
  await h.scan.onclick(); await h.submitForm(); h.cancel.onclick();
  assert.equal(calls, 1); assert.equal(h.queued.length, 0); assert.equal(h.form.hidden, false); assert.equal(h.submit.disabled, true);
  finish(); await pending; assert.equal(h.submit.disabled, false); h.cancel.onclick(); assert.equal(h.form.hidden, true);
});
test('valid zero cross-currency is displayed, overflow and future provenance are rejected', () => {
  const h = harness(); ready(h); assert.equal(h.api.quote('0', 'CZK', 'ILS').converted, 0);
  ready(h, { ilsRates: { CZK: Number.MAX_VALUE, ILS: 1 } }); assert.equal(h.api.quote('2', 'CZK', 'ILS').status, 'invalid');
  ready(h, { rateDate: '2999-01-01' }); assert.equal(h.api.quote('1', 'CZK', 'ILS').status, 'unavailable');
});

test('generic reset cleans disclosure without moving focus from another control', () => {
  const h = harness(); h.toggle.onclick(); h.fill(); h.attachment.open = true; h.accountFocus.focus();
  h.form.reset(); assert.equal(h.focused(), h.accountFocus); assert.equal(h.attachment.open, false); assert.equal(h.toggle.attrs['aria-expanded'], 'false'); assert.equal(h.form.amount.value, '');
});
test('actual account-context reset never focuses expense opener or retains draft', () => {
  const h = harness(); h.toggle.onclick(); h.fill(); h.attachment.open = true; h.accountFocus.focus();
  h.localStorage.setItem('travelmate-active-user', 'other'); h.accountChanged();
  assert.equal(h.focused(), h.accountFocus); assert.equal(h.attachment.open, false); assert.equal(h.form.amount.value, ''); assert.equal(h.toggle.attrs['aria-expanded'], 'false'); assert.equal(h.queued.length, 0);
});
test('late upload after account-context reset never restores the previous expense focus', async () => {
  const h = harness(); let finish; h.api.receipt(() => new Promise(resolve => { finish = resolve; }));
  h.toggle.onclick(); h.fill(); h.form.receiptCamera.files = [{ name: 'mock.png', type: 'image/png', size: 10 }]; const pending = h.submitForm();
  h.accountFocus.focus(); h.localStorage.setItem('travelmate-active-user', 'other'); h.accountChanged(); finish('private/mock'); await pending;
  assert.equal(h.focused(), h.accountFocus); assert.equal(h.queued.length, 0);
});
