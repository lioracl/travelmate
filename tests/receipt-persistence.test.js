'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = process.env.RECEIPT_SOURCE_ROOT || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(sourceRoot, 'assets/trip-experience.js'), 'utf8');

// Exercise the complete feature module with controlled DOM/services and the real canonical store.
function harness(actor = 'qa') {
  const values = new Map([['travelmate-active-user', actor]]);
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
  const context = { fetch: async url => ({ blob: async () => new Blob([String(url)], { type: "text/plain" }) }), crypto: require("node:crypto").webcrypto, File, Blob, Uint8Array, window, localStorage, document, location: { pathname: '/trip/custom/', search: '?id=qa-budget' }, URLSearchParams, CustomEvent: function () {}, console, setTimeout: (fn) => setTimeout(fn, 0), clearTimeout() {}, Intl };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(sourceRoot, 'assets/trip-store.js'), 'utf8'), context);
  vm.runInContext(source.replace(/  init\(\);\s*\}\)\(\);\s*$/, `
    renderExpenseList = renderBudgetColumns = renderSummary = renderBudgetCharts = renderMemories = renderAlbumActions = function () {};
    toast = function (message) { window.lastToast = message; };
    window.budgetHarness = { state: state, hydrate: function(){ if(typeof localReceiptExpenses === "function") state.expenses=localReceiptExpenses(state.trip.expenses || [], []); }, remove: deleteExpense, location: function(v){location.search=v}, cleanup: typeof flushReceiptCleanup === "function" ? flushReceiptCleanup : async function(){}, queue: typeof queueReceiptCleanup === "function" ? queueReceiptCleanup : function(){}, context: experienceContext, sync: syncPendingReceipts, migrate: migrateInlineReceipts, local: function(fns){if(fns.put)putLocalReceipt=fns.put;if(fns.get)getLocalReceipt=fns.get;if(fns.remove)deleteLocalReceipt=fns.remove;}, refresh: refreshFromCanonicalTrip, create: createBudgetTools, createConverter: createCurrencyConverter, render: renderCurrencyConverter, quote: null, capture: function () { experienceBaseline = JSON.parse(JSON.stringify(state.trip)); }, receipt: function (fn) { storePrivateReceiptWithRetry = fn; }, scan: function (fn) { scanReceipt = fn; } };
  })();`), context);
  const api = window.budgetHarness;
  Object.assign(api.state, { trip: { id: 'qa-budget', ownerId: actor, expenses: [], budget: 500 }, localCurrency: 'CZK', expenses: [], budgetCategories: [], memories: [] });
  rows = [JSON.parse(JSON.stringify(api.state.trip))]; localStorage.setItem('travelmate-trips', JSON.stringify(rows)); api.capture(); api.create(); api.createConverter();
  const fill = (amount = '42.50') => { form.amount.value = amount; form.note.value = 'Controlled expense'; form.currency.value = 'CZK'; form.category.value = 'Food'; form.date.value = '2026-10-17'; };
  const submitForm = () => form.onsubmit({ preventDefault() {} });
  return { values, context, realCloud: function(){
    const previous=window.TravelMateCloud;localStorage.setItem('travelmate-trips',JSON.stringify(previous.getLocalTrips()));
    const timers=[];context.setTimeout=(fn,delay)=>{timers.push({fn,delay,cancelled:false});return timers.length};context.clearTimeout=id=>{if(timers[id-1])timers[id-1].cancelled=true};
    vm.runInContext(fs.readFileSync(path.join(sourceRoot,'assets/cloud-sync.js'),'utf8'),context);
    Object.assign(previous,window.TravelMateCloud);window.TravelMateCloud=previous;return timers;
  }, window, events, api, form, submit, toggle, cancel, scan, attachment: attachmentNodes[0], accountFocus: node(), accountChanged: () => events['travelmate:account-context-changed']({ detail: { trips: [] } }), converter, card, status, localStorage, queued, fill, submitForm, focused: () => focused, saved: () => window.TravelMateTripStore.getTrip('qa-budget', api.state.trip && api.state.trip.ownerId || actor) };
}
function ready(h, override = {}) { Object.assign(h.api.state, { rate: 3.7, rates: { CZK: 25, ILS: 3.7 }, ilsRates: { ILS: 1, EUR: 3.7, CZK: 3.7 / 25 }, rateSource: 'Controlled FX', rateDate: new Date().toISOString(), rateStale: false }, override); }


const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
function receipt(h){h.toggle.onclick();h.fill();h.form.receiptFile.files=[new File(['synthetic'],'receipt.txt',{type:'text/plain'})];}
function existing(h,extra={}){const e={id:7,amount:10,currency:'CZK',category:'Food',date:'2026-10-17',note:'old',receiptPath:'qa/receipts/qa-budget/old',...extra};h.api.state.trip.expenses=[e];h.api.state.expenses=[e];h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();return e;}
function service(h){const q={uploaded:[],removed:[],remoteExpenses:[],failUpload:false,failRemove:false,failQuery:false,holdUpload:null,holdQuery:null};const client={rpc:async()=>{throw Error('Unexpected RPC in service-only fixture')},storage:{from:()=>({upload:async p=>{q.uploaded.push(p);if(q.holdUpload)await q.holdUpload.promise;if(q.failUpload)return{error:Error('MFA_REQUIRED')};return{}},remove:async paths=>{q.removed.push(...paths);return q.failRemove?{error:Error('offline')}:{}}})},from:()=>{const filters=[];return{select(){return this},eq(k,v){filters.push([k,v]);return this},async limit(){if(q.holdQuery)await q.holdQuery.promise;return q.failQuery?{error:Error('offline')}:{data:[{id:'qa-budget',user_id:h.api.state.trip && h.api.state.trip.ownerId || 'qa',revision:q.remoteRevision,updated_at:q.remoteUpdatedAt,payload:{expenses:q.remoteExpenses}}]}}}}};h.window.TravelMateCloud.getPrivateStorageSession=async()=>({client,session:{user:{id:h.localStorage.getItem('travelmate-active-user')}}});return q;}
function remoteAccepted(h,q){const current=h.saved(),revision=Number(current.cloudRevision||0)+1,at='2026-10-21T09:00:00.'+String(revision).padStart(3,'0')+'Z';delete current.syncMutationId;delete current.syncConflict;Object.assign(current,{syncStatus:'synced',cloudRevision:revision,cloudUpdatedAt:at});h.window.TravelMateCloud.upsertLocalTrip(current);q.remoteExpenses=JSON.parse(JSON.stringify(current.expenses));q.remoteRevision=revision;q.remoteUpdatedAt=at;}
function entries(h){return JSON.parse(h.localStorage.getItem('travelmate-receipt-cleanup:qa')||'[]');}
async function flush(h){await tick();await h.api.cleanup();await tick();}
test('control: successful original-currency receipt saves once and closes draft',async()=>{const h=harness(),q=service(h);receipt(h);await h.submitForm();assert.equal(h.queued.length,1);assert.equal(h.saved().expenses[0].amount,42.5);assert.equal(h.saved().expenses[0].currency,'CZK');assert.equal(h.form.hidden,true);assert.equal(q.removed.length,0)});
test('null canonical trip keeps draft open without success or stale cache write',async()=>{const h=harness(),q=service(h);q.holdUpload=deferred();receipt(h);const p=h.submitForm();await tick();h.window.TravelMateCloud.getLocalTrips=()=>[];q.holdUpload.resolve();await p;assert.equal(h.queued.length,0);assert.equal(h.form.hidden,false);assert.equal(h.form.amount.value,'42.50');assert.equal(h.window.lastToast,undefined);assert.equal(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'),null);});
test('old receipt survives missing canonical trip during replacement',async()=>{const h=harness(),q=service(h);existing(h);q.holdUpload=deferred();receipt(h);h.form.dataset.editingId='7';const p=h.submitForm();await tick();h.window.TravelMateCloud.getLocalTrips=()=>[];q.holdUpload.resolve();await p;await flush(h);assert.equal(h.queued.length,0);assert.equal(h.form.hidden,false);assert(!q.removed.includes('qa/receipts/qa-budget/old'));});
test('quota canonical throw retains old receipt, draft and original record',async()=>{const h=harness(),q=service(h);existing(h);const upsert=h.window.TravelMateCloud.upsertLocalTrip;h.window.TravelMateCloud.upsertLocalTrip=()=>{throw Error('quota')};receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert.equal(h.saved().expenses[0].receiptPath,'qa/receipts/qa-budget/old');assert.equal(h.form.hidden,false);assert.equal(h.form.amount.value,'42.50');assert.equal(h.queued.length,0);assert(!q.removed.includes('qa/receipts/qa-budget/old'));h.window.TravelMateCloud.upsertLocalTrip=upsert;await h.submitForm();assert.equal(h.queued.length,1);assert.equal(h.saved().expenses.length,1);assert.equal(h.form.hidden,true)});
test('read-back rejects a false success when canonical service silently declines write',async()=>{const h=harness();service(h);h.window.TravelMateCloud.upsertLocalTrip=()=>null;receipt(h);await h.submitForm();assert.equal(h.form.hidden,false);assert.equal(h.saved().expenses.length,0);assert.equal(h.window.lastToast,undefined)});
test('replacement keeps remotely referenced old receipt until later sync evidence',async()=>{const h=harness(),q=service(h);const old=existing(h);q.remoteExpenses=[old];receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert(!q.removed.includes(old.receiptPath));assert(entries(h).some(x=>x.path===old.receiptPath));q.remoteExpenses=JSON.parse(JSON.stringify(h.saved().expenses));remoteAccepted(h,q);await flush(h);assert(q.removed.includes(old.receiptPath));assert(!entries(h).some(x=>x.path===old.receiptPath))});
test('reference query and remove failures retain cleanup for explicit retry',async()=>{const h=harness(),q=service(h);const old=existing(h);q.failQuery=true;receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert.equal(q.removed.length,0);q.failQuery=false;q.failRemove=true;remoteAccepted(h,q);await flush(h);assert(entries(h).some(x=>x.path===old.receiptPath));q.failRemove=false;await flush(h);assert(!entries(h).some(x=>x.path===old.receiptPath))});
test('same reference in another local trip prevents cleanup',async()=>{const h=harness(),q=service(h);const old=existing(h);receipt(h);h.form.dataset.editingId='7';q.failQuery=true;await h.submitForm();await flush(h);const current=h.window.TravelMateCloud.getLocalTrips;h.window.TravelMateCloud.getLocalTrips=()=>[...current(),{id:'other',ownerId:'qa',expenses:[old]}];q.failQuery=false;await flush(h);assert(!q.removed.includes(old.receiptPath))});
test('queue quota prevents creating an untracked new upload',async()=>{const h=harness(),q=service(h);const set=h.localStorage.setItem;h.localStorage.setItem=(k,v)=>{if(k.startsWith('travelmate-receipt-cleanup:'))throw Error('quota');set(k,v)};h.api.local({put:async()=>{throw Error('quota')}});receipt(h);await h.submitForm();assert.equal(q.uploaded.length,0);assert.equal(h.queued.length,0);assert.equal(h.form.hidden,false)});
test('partial canonical write then queue throw keeps draft; retry does not duplicate expense',async()=>{const h=harness(),q=service(h);const queue=h.window.TravelMateCloud.queueTripSave;h.window.TravelMateCloud.queueTripSave=()=>{throw Error('queue failure')};receipt(h);await h.submitForm();assert.equal(h.form.hidden,false);assert.equal(h.saved().expenses.length,1);await flush(h);assert(!q.removed.includes(h.saved().expenses[0].receiptPath));h.window.TravelMateCloud.queueTripSave=queue;await h.submitForm();assert.equal(h.form.hidden,true);assert.equal(h.saved().expenses.length,1);assert.equal(h.queued.length,1)});
test('late upload after account ABA creates no expense and retains initiating cleanup',async()=>{const h=harness(),q=service(h);q.holdUpload=deferred();receipt(h);const p=h.submitForm();await tick();h.localStorage.setItem('travelmate-active-user','other');h.events['travelmate:account-context-changed']({detail:{trips:[]}});h.localStorage.setItem('travelmate-active-user','qa');h.events['travelmate:account-context-changed']({detail:{trips:[]}});q.holdUpload.resolve();await p;assert.equal(h.queued.length,0);assert.equal(q.removed.length,0);assert(entries(h).some(x=>x.path===q.uploaded[0]));});
test('account ABA while cleanup query is pending cannot remove a receipt',async()=>{const h=harness(),q=service(h);const old=existing(h);q.holdQuery=deferred();receipt(h);h.form.dataset.editingId='7';await h.submitForm();await tick();h.localStorage.setItem('travelmate-active-user','other');h.events['travelmate:account-context-changed']({detail:{trips:[]}});h.localStorage.setItem('travelmate-active-user','qa');h.events['travelmate:account-context-changed']({detail:{trips:[]}});q.holdQuery.resolve();await tick();assert(!q.removed.includes(old.receiptPath));});
test('offline fallback retains original currency and does not discard old remote reference',async()=>{const h=harness(),q=service(h);existing(h);q.failUpload=true;h.api.local({put:async()=> 'qa:qa-budget:7:new-local'});receipt(h);h.form.dataset.editingId='7';await h.submitForm();const saved=h.saved().expenses[0];assert.equal(saved.receiptPending,true);assert.equal(saved.receiptLocalKey,'qa:qa-budget:7:new-local');assert.equal(saved.receiptPath,'qa/receipts/qa-budget/old');assert.equal(saved.currency,'CZK');assert.equal(h.queued.length,1);assert(!q.removed.includes(saved.receiptPath))});
test('pending-local sync failure retains local key/blob and pending state',async()=>{const h=harness(),q=service(h),deleted=[];existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});h.api.local({get:async()=>({blob:new Blob(['synthetic']),name:'receipt.txt'}),remove:async key=>deleted.push(key)});h.window.TravelMateCloud.upsertLocalTrip=()=>{throw Error('quota')};await h.api.sync();await flush(h);assert.equal(h.saved().expenses[0].receiptLocalKey,'qa:qa-budget:7');assert.equal(h.saved().expenses[0].receiptPending,true);assert.equal(deleted.length,0);assert(!q.removed.includes('qa/receipts/qa-budget/old'))});
test('pending-local sync commits before deleting local blob; repeated sync is single-flight',async()=>{const h=harness(),q=service(h),deleted=[];existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});q.holdUpload=deferred();h.api.local({get:async()=>({blob:new Blob(['synthetic']),name:'receipt.txt'}),remove:async key=>{assert.equal(h.saved().expenses[0].receiptPending,false);deleted.push(key)}});const p=h.api.sync();await tick();await h.api.sync();assert.equal(q.uploaded.length,1);q.holdUpload.resolve();await p;await flush(h);assert.equal(h.queued.length,1);assert.deepEqual(deleted,['qa:qa-budget:7']);assert.equal(h.saved().expenses[0].receiptLocalKey,undefined)});
test('deleted expense during pending-local sync is not resurrected',async()=>{const h=harness(),q=service(h),deleted=[];existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});q.holdUpload=deferred();h.api.local({get:async()=>({blob:new Blob(['synthetic'])}),remove:async k=>deleted.push(k)});const p=h.api.sync();await tick();h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),expenses:[]});q.holdUpload.resolve();await p;assert.equal(h.saved().expenses.length,0);assert.equal(h.queued.length,0);});
test('stale shared-trip owner cannot save through retained form',async()=>{const h=harness();service(h);receipt(h);h.api.state.trip.ownerId='another';await h.submitForm();assert.equal(h.form.hidden,false);assert.equal(h.queued.length,0)});
test('positive-entry policy remains unchanged for zero and negative amounts',async()=>{for(const v of ['0','-1','Infinity']){const h=harness();service(h);receipt(h);h.fill(v);await h.submitForm();assert.equal(h.queued.length,0)}});

test('uncertain partial save upload is retained across cleanup and duplicate intent',async()=>{
  const h=harness(),q=service(h);h.window.TravelMateCloud.upsertLocalTrip=()=>null;receipt(h);await h.submitForm();
  const path=q.uploaded[0];assert(entries(h).some(x=>x.path===path&&x.persistenceUncertain));
  h.api.queue(h.api.context(),{receiptPath:path});await flush(h);
  assert.equal(entries(h).filter(x=>x.path===path).length,1);assert(!q.removed.includes(path));
});
test('cleanup ignores another account path and malformed or foreign-owner intent',async()=>{
  const h=harness(),q=service(h);h.api.queue(h.api.context(),{receiptPath:'other/receipts/qa-budget/file'});assert.equal(entries(h).length,0);
  h.localStorage.setItem('travelmate-receipt-cleanup:qa',JSON.stringify([{userId:'qa',ownerId:'another',tripId:'qa-budget',path:'qa/receipts/qa-budget/file'}]));await flush(h);assert.equal(q.removed.length,0);
  h.localStorage.setItem('travelmate-receipt-cleanup:qa','invalid');await flush(h);assert.equal(q.removed.length,0);
});
test('local cleanup failure keeps retry intent until deletion succeeds',async()=>{
  const h=harness();service(h);let failed=true,calls=0;h.api.local({remove:async()=>{calls++;if(failed)throw Error('synthetic abort')}});
  h.api.queue(h.api.context(),{receiptLocalKey:'qa:qa-budget:unused'});await flush(h);assert.equal(entries(h).length,1);
  failed=false;await flush(h);assert.equal(entries(h).length,0);assert.equal(calls,2);
});
test('canonical newer receipt revision is not overwritten by stale pending-local sync',async()=>{
  const h=harness(),q=service(h);existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});
  h.api.local({get:async()=>({blob:new Blob(['synthetic'])})});q.holdUpload=deferred();const p=h.api.sync();await tick();
  h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),expenses:[{...h.saved().expenses[0],receiptPath:'qa/receipts/qa-budget/newer'}]});
  q.holdUpload.resolve();await p;assert.equal(h.saved().expenses[0].receiptPath,'qa/receipts/qa-budget/newer');assert.equal(h.queued.length,0);
});

test('delete metadata quota preserves canonical receipt and never removes old object',async()=>{
  const h=harness(),q=service(h);h.window.confirm=()=>true;existing(h);h.window.TravelMateCloud.upsertLocalTrip=()=>{throw Error('quota')};
  await h.api.remove(7);await flush(h);assert.equal(h.saved().expenses.length,1);assert(!q.removed.includes('qa/receipts/qa-budget/old'));
});
test('delete succeeds locally before deferred remote cleanup and retries removal safely',async()=>{
  const h=harness(),q=service(h);h.window.confirm=()=>true;q.remoteExpenses=[existing(h)];await h.api.remove(7);await flush(h);
  assert.equal(h.saved().expenses.length,0);assert.equal(q.removed.length,0);q.remoteExpenses=[];remoteAccepted(h,q);await flush(h);assert(q.removed.includes('qa/receipts/qa-budget/old'));
});
test('built-in trip saves to its existing local expense mirror and preserves draft on quota',async()=>{
  const h=harness();service(h);h.api.location('');receipt(h);await h.submitForm();assert.equal(h.form.hidden,true);
  assert.equal(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'))[0].amount,42.5);
  h.toggle.onclick();h.fill();const set=h.localStorage.setItem;h.localStorage.setItem=(k,v)=>{if(k.endsWith(':expenses'))throw Error('quota');set(k,v)};
  await h.submitForm();assert.equal(h.form.hidden,false);assert.equal(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses')).length,1);
});

test('stale delete cannot remove a newer canonical receipt revision',async()=>{
  const h=harness(),q=service(h);h.window.confirm=()=>true;existing(h);
  h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),expenses:[{...h.saved().expenses[0],receiptPath:'qa/receipts/qa-budget/newer'}]});
  await h.api.remove(7);await flush(h);assert.equal(h.saved().expenses[0].receiptPath,'qa/receipts/qa-budget/newer');assert.equal(h.queued.length,0);assert.equal(q.removed.length,0);
});
test('account reset clears both edit and retry record identities',()=>{
  const h=harness();h.form.dataset.editingId='7';h.form.dataset.receiptDraftId='8';h.accountChanged();
  assert.equal(h.form.dataset.editingId,undefined);assert.equal(h.form.dataset.receiptDraftId,undefined);
});
test('malformed remote reference payload retains cleanup intent',async()=>{
  const h=harness(),q=service(h);const old=existing(h);q.remoteExpenses='unreadable';receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert(!q.removed.includes(old.receiptPath));assert(entries(h).some(x=>x.path===old.receiptPath));
});
test('abandoned upload before persistence is reference-checked and cleaned on retry',async()=>{
  const h=harness(),q=service(h);q.failUpload=true;q.failRemove=true;h.api.local({put:async()=>{throw Error('synthetic disk failure')}});receipt(h);await h.submitForm();await flush(h);
  assert.equal(h.queued.length,0);assert.equal(h.form.hidden,false);assert(entries(h).some(x=>x.path===q.uploaded[0]&&!x.persistenceUncertain));
  q.failRemove=false;remoteAccepted(h,q);await flush(h);assert(q.removed.includes(q.uploaded[0]));assert.equal(entries(h).length,0);
});
test('shared-owner trip saves without replacing composite identity or uploader namespace',async()=>{
  const h=harness(),q=service(h);h.api.state.trip.ownerId='shared-owner';h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();receipt(h);await h.submitForm();
  const saved=h.window.TravelMateTripStore.getTrip('qa-budget','shared-owner');assert.equal(saved.ownerId,'shared-owner');assert.equal(saved.id,'qa-budget');assert.equal(saved.expenses[0].currency,'CZK');assert(saved.expenses[0].receiptPath.startsWith('qa/receipts/qa-budget/'));assert.equal(h.queued.length,1);
});

for (const failure of ['account backup', 'queue']) test('review P1: pending sync partial '+failure+' preserves old bytes and retries acceptance without another upload',async()=>{
  const h=harness(),q=service(h),deleted=[];const old=existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});
  h.api.state.trip.syncStatus='synced';h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();
  h.api.local({get:async()=>({blob:new Blob(['only-local-copy'])}),remove:async key=>deleted.push(key)});
  const cloud=h.window.TravelMateCloud,upsert=cloud.upsertLocalTrip,queue=cloud.queueTripSave;
  if(failure==='account backup')cloud.upsertLocalTrip=t=>{upsert(t);throw Error('backup quota after primary write')};
  else cloud.queueTripSave=()=>{throw Error('queue quota after primary write')};
  await h.api.sync();await flush(h);
  assert.equal(h.saved().expenses[0].receiptPending,false,'fixture proves partial primary write');
  assert.equal(h.queued.length,0);assert.equal(h.saved().syncStatus,'synced');
  assert.deepEqual(deleted,[],'uncertain primary acceptance must not delete original local bytes');
  assert(entries(h).some(x=>x.localKey===old.receiptLocalKey&&x.persistenceUncertain),'durable cleanup protection survives failure');
  cloud.upsertLocalTrip=upsert;cloud.queueTripSave=queue;
  await h.api.sync();await flush(h);
  assert.equal(h.queued.length,1,'retry must queue even when canonical fields already equal candidate');
  assert.equal(q.uploaded.length,1,'accepted partial upload is reused');assert.deepEqual(deleted,[old.receiptLocalKey]);
});
test('review P1: pending recovery does not resurrect deleted or overwrite newer canonical receipt',async()=>{
  for(const removed of [false,true]){const h=harness(),q=service(h),deleted=[];existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});
    h.api.local({get:async()=>({blob:new Blob(['local'])}),remove:async k=>deleted.push(k)});
    const queue=h.window.TravelMateCloud.queueTripSave;h.window.TravelMateCloud.queueTripSave=()=>{throw Error('partial')};await h.api.sync();await flush(h);
    const latest={...h.saved(),expenses:removed?[]:[{...h.saved().expenses[0],receiptPath:'qa/receipts/qa-budget/newer'}]};h.window.TravelMateCloud.upsertLocalTrip(latest);h.window.TravelMateCloud.queueTripSave=queue;
    await h.api.sync();await flush(h);assert.deepEqual(h.saved(),latest);assert.equal(h.queued.length,0);assert.deepEqual(deleted,[]);
  }
});
function builtIn(h){const old=existing(h,{receiptPath:undefined,receiptLocalKey:'qa:qa-budget:7:original',receiptPending:true});h.api.location('');h.localStorage.setItem('travelmate-experience:qa:qa-budget:expenses',JSON.stringify([old]));h.window.TravelMateCloud.getLocalTrips=()=>[];h.localStorage.setItem('travelmate-trips','[]');return old;}
test('review P2: built-in offline replacement retires old local bytes after mirror acceptance',async()=>{
  const h=harness(),q=service(h),deleted=[];const old=builtIn(h);q.failUpload=true;h.api.local({put:async()=> 'qa:qa-budget:7:replacement',remove:async k=>deleted.push(k)});
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.form.hidden,true);assert.equal(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'))[0].receiptLocalKey,'qa:qa-budget:7:replacement');assert.deepEqual(deleted,[old.receiptLocalKey]);
});
test('review P2: built-in deletion cleans local bytes without inventing canonical trip',async()=>{
  const h=harness();service(h);const old=builtIn(h),deleted=[];h.window.confirm=()=>true;h.api.local({remove:async k=>deleted.push(k)});await h.api.remove(7);await flush(h);
  assert.deepEqual(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses')),[]);assert.deepEqual(deleted,[old.receiptLocalKey]);assert.equal(h.queued.length,0);
});
test('review P2: failed built-in mirror save retains old local receipt and retry draft',async()=>{
  const h=harness(),q=service(h),deleted=[];const old=builtIn(h);q.failUpload=true;h.api.local({put:async()=> 'qa:qa-budget:7:new',remove:async k=>deleted.push(k)});
  const set=h.localStorage.setItem;h.localStorage.setItem=(k,v)=>{if(k.endsWith(':expenses'))throw Error('mirror quota');set(k,v)};
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert.equal(h.form.hidden,false);assert(!deleted.includes(old.receiptLocalKey));assert.equal(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'))[0].receiptLocalKey,old.receiptLocalKey);
});
function inline(h){const expenses=[7,8,9].map(id=>({id,amount:10,currency:'CZK',category:'Food',date:'2026-10-17',note:'inline '+id,receiptData:'data:text/plain,synthetic-'+id}));
  h.api.state.trip.expenses=expenses.map(({receiptData,...e})=>e);h.api.state.expenses=expenses;h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();h.localStorage.setItem('travelmate-experience:qa:qa-budget:expenses',JSON.stringify(expenses));return expenses;
}
test('review P3: all legacy inline receipts migrate without losing remaining local-only bytes',async()=>{
  const h=harness(),q=service(h);inline(h);await h.api.migrate();await flush(h);
  assert.equal(h.saved().expenses.filter(e=>e.receiptPath).length,3);assert.equal(q.uploaded.length,3);
  assert.equal(h.queued.length,3);assert(h.queued.every(t=>t.expenses.every(e=>!e.receiptData)),'canonical queue never contains private inline bytes');
});
test('review P3: mixed migration upload failure retains inline bytes in existing mirror and retry succeeds',async()=>{
  const h=harness(),q=service(h);const originals=inline(h);let fail=true;
  const access=await h.window.TravelMateCloud.getPrivateStorageSession(),from=access.client.storage.from;
  access.client.storage.from=()=>{const bucket=from();return {...bucket,upload:async p=>p.includes('/8-')&&fail?{error:Error('MFA_REQUIRED')}:bucket.upload(p)}};
  await h.api.migrate();const mirror=JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'));
  assert.equal(h.saved().expenses.filter(e=>e.receiptPath).length,2);assert.equal(mirror.find(e=>e.id===8).receiptData,originals[1].receiptData);
  assert.equal(h.api.state.expenses.find(e=>e.id===8).receiptData,originals[1].receiptData);assert(h.queued.every(t=>t.expenses.every(e=>!e.receiptData)));
  fail=false;await h.api.migrate();assert.equal(h.saved().expenses.filter(e=>e.receiptPath).length,3);
});
test('review P3: partial persistence failure preserves untouched inline bytes locally',async()=>{
  const h=harness();service(h);const originals=inline(h);const queue=h.window.TravelMateCloud.queueTripSave;h.window.TravelMateCloud.queueTripSave=()=>{throw Error('queue after primary')};
  await h.api.migrate();const mirror=JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'));
  for(const e of originals)assert.equal(mirror.find(x=>x.id===e.id).receiptData,e.receiptData,'failed acceptance keeps original private local bytes');
  assert.equal(h.queued.length,0);h.window.TravelMateCloud.queueTripSave=queue;
});
test('review P3: account ABA cancels inline migration without erasing initiating mirror',async()=>{
  const h=harness(),q=service(h);const originals=inline(h);q.holdUpload=deferred();const p=h.api.migrate();await tick();
  h.localStorage.setItem('travelmate-active-user','other');h.accountChanged();h.localStorage.setItem('travelmate-active-user','qa');h.accountChanged();q.holdUpload.resolve();await p;
  assert.deepEqual(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses')),originals);assert.equal(h.queued.length,0);assert.equal(q.removed.length,0);
});

function reload(h){const next=harness(h.localStorage.getItem('travelmate-active-user')),trip=h.saved();for(const [k,v] of h.values)next.values.set(k,v);next.window.TravelMateCloud.upsertLocalTrip(trip);next.api.state.trip=JSON.parse(JSON.stringify(trip));next.api.state.expenses=JSON.parse(JSON.stringify(trip.expenses));next.api.capture();next.api.hydrate();return next;}
test('review P1: fresh module recovers partial pending save from durable intent',async()=>{
  const h=harness();service(h);const old=existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});h.api.local({get:async()=>({blob:new Blob(['local'])}),remove:async()=>{assert.fail('uncertain local delete')}});
  h.window.TravelMateCloud.queueTripSave=()=>{throw Error('queue after primary')};await h.api.sync();await flush(h);
  const fresh=reload(h),q=service(fresh),deleted=[];fresh.api.local({remove:async k=>deleted.push(k)});await fresh.api.sync();await flush(fresh);
  assert.equal(fresh.queued.length,1);assert.deepEqual(deleted,[old.receiptLocalKey]);assert.equal(q.uploaded.length,0);assert(!entries(fresh).some(x=>x.pendingSave));
});
for(const failAt of [1,2])test('review P1 actual cloud: backup quota at write '+failAt+' keeps local bytes until full owner and queue persistence',async()=>{
  const h=harness();existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});h.api.state.trip.syncStatus='synced';h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();
  const timers=h.realCloud(),q=service(h),deleted=[];h.api.local({get:async()=>({blob:new Blob(['local'])}),remove:async k=>deleted.push(k)});
  const set=h.localStorage.setItem;let backups=0;h.localStorage.setItem=(k,v)=>{if(k==='travelmate-trips-user:qa'&&++backups===failAt)throw Error('actual backup quota');set(k,v)};
  await h.api.sync();await flush(h);assert.equal(h.saved().expenses[0].receiptPending,false);assert.equal(timers.filter(t=>t.delay===650).length,0);assert.deepEqual(deleted,[]);
  h.localStorage.setItem=set;await h.api.sync();await flush(h);
  assert.equal(timers.filter(t=>t.delay===650).length,1);assert.equal(h.saved().syncStatus,'pending');assert.equal(JSON.parse(h.localStorage.getItem('travelmate-trips-user:qa'))[0].syncStatus,'pending');assert.deepEqual(deleted,['qa:qa-budget:7']);assert.equal(q.uploaded.length,1);
});
test('review P1: account ABA with pending recovery cannot queue or clean initiating bytes',async()=>{
  const h=harness();service(h);existing(h,{receiptLocalKey:'qa:qa-budget:7',receiptPending:true});const deleted=[];h.api.local({get:async()=>({blob:new Blob(['local'])}),remove:async k=>deleted.push(k)});h.window.TravelMateCloud.queueTripSave=()=>{throw Error('partial')};await h.api.sync();await flush(h);
  h.localStorage.setItem('travelmate-active-user','other');h.accountChanged();h.localStorage.setItem('travelmate-active-user','qa');h.accountChanged();await h.api.sync();await flush(h);assert.equal(h.queued.length,0);assert.deepEqual(deleted,[]);assert(entries(h).some(x=>x.pendingSave));
});
test('review P2: built-in cleanup fails closed for missing/malformed mirror and another trip reference',async()=>{
  for(const value of [null,'null','{}','invalid']){const h=harness();service(h);const old=builtIn(h),deleted=[];h.api.local({remove:async k=>deleted.push(k)});h.api.queue(h.api.context(),{receiptLocalKey:old.receiptLocalKey});if(value===null)h.localStorage.removeItem('travelmate-experience:qa:qa-budget:expenses');else h.localStorage.setItem('travelmate-experience:qa:qa-budget:expenses',value);await flush(h);assert.deepEqual(deleted,[]);assert.equal(entries(h).length,1);}
  const h=harness();service(h);const old=builtIn(h),deleted=[];h.api.local({remove:async k=>deleted.push(k)});h.localStorage.setItem('travelmate-experience:qa:qa-budget:expenses','[]');h.window.TravelMateCloud.getLocalTrips=()=>[{id:'other',ownerId:'qa',expenses:[old]}];h.api.queue(h.api.context(),{receiptLocalKey:old.receiptLocalKey});await flush(h);assert.deepEqual(deleted,[]);
});
test('review P2: built-in failed delete preserves mirror and local bytes',async()=>{
  const h=harness();service(h);const old=builtIn(h),deleted=[];h.window.confirm=()=>true;h.api.local({remove:async k=>deleted.push(k)});const set=h.localStorage.setItem;h.localStorage.setItem=(k,v)=>{if(k.endsWith(':expenses'))throw Error('quota');set(k,v)};await h.api.remove(7);await flush(h);assert.equal(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses'))[0].receiptLocalKey,old.receiptLocalKey);assert.deepEqual(deleted,[]);
});
test('review P3: fresh module retries partial inline acceptance while keeping private bytes out of canonical queue',async()=>{
  const h=harness();service(h);inline(h);h.window.TravelMateCloud.queueTripSave=()=>{throw Error('partial')};await h.api.migrate();
  const fresh=reload(h),q=service(fresh);await fresh.api.migrate();await flush(fresh);
  assert.equal(fresh.queued.length,3);assert.equal(q.uploaded.length,0);assert(fresh.queued.every(t=>t.expenses.every(e=>!e.receiptData)));
  assert(JSON.parse(fresh.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses')).every(e=>e.receiptPath&&!e.receiptData));assert(!entries(fresh).some(e=>e.pendingSave));
});
test('review P3: mirror quota stops inline canonical mutation before sanitization',async()=>{
  const h=harness();service(h);const originals=inline(h),before=JSON.stringify(h.saved()),set=h.localStorage.setItem;h.localStorage.setItem=(k,v)=>{if(k.endsWith(':expenses'))throw Error('quota');set(k,v)};
  await h.api.migrate();assert.equal(JSON.stringify(h.saved()),before);assert.equal(h.queued.length,0);assert.deepEqual(JSON.parse(h.localStorage.getItem('travelmate-experience:qa:qa-budget:expenses')),originals);
});
test('review P3: canonical deletion or newer receipt never recovers stale inline bytes',async()=>{
  for(const deleted of [false,true]){const h=harness();service(h);inline(h);h.window.TravelMateCloud.queueTripSave=()=>{throw Error('partial')};await h.api.migrate();const current=h.saved();current.expenses=deleted?[]:current.expenses.map(e=>({...e,receiptPath:'qa/receipts/qa-budget/newer-'+e.id}));h.window.TravelMateCloud.upsertLocalTrip(current);
    const fresh=reload(h);service(fresh);await fresh.api.migrate();assert.equal(fresh.queued.length,0);assert.deepEqual(fresh.saved(),current);assert(fresh.api.state.expenses.every(e=>!e.receiptData));
  }
});
test('review P3: unrelated canonical note edit preserves unmigrated inline receipt identity',async()=>{
  const h=harness();service(h);const originals=inline(h),current=h.saved();current.expenses[1].note='new canonical note';h.window.TravelMateCloud.upsertLocalTrip(current);
  const fresh=reload(h);service(fresh);assert.equal(fresh.api.state.expenses[1].receiptData,originals[1].receiptData);await fresh.api.migrate();assert.equal(fresh.saved().expenses[1].note,'new canonical note');assert.equal(fresh.saved().expenses.filter(e=>e.receiptPath).length,3);assert(fresh.queued.every(t=>t.expenses.every(e=>!e.receiptData)));
});

for(const failAt of [1,2])for(const recovery of ['reload','form retry'])test('manual review: local replacement partial backup '+failAt+' preserves bytes through '+recovery,async()=>{
  const h=harness(),old=existing(h,{receiptLocalKey:'qa:qa-budget:7:original',receiptPending:true});h.api.state.trip.syncStatus='synced';h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();
  const timers=h.realCloud(),q=service(h),deleted=[];h.api.local({remove:async k=>deleted.push(k)});const set=h.localStorage.setItem;let backups=0;
  h.localStorage.setItem=(k,v)=>{if(k==='travelmate-trips-user:qa'&&++backups===failAt)throw Error('actual partial backup');set(k,v)};
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.saved().expenses[0].receiptPath,q.uploaded[0]);assert.equal(h.saved().expenses[0].receiptLocalKey,undefined);assert.equal(timers.filter(t=>t.delay===650).length,0);
  assert.equal(h.form.hidden,false);assert.equal(h.form.amount.value,'42.50');assert.equal(h.window.lastToast,undefined);assert.deepEqual(deleted,[],'original bytes retained after partial write');assert(entries(h).some(i=>i.localKey===old.receiptLocalKey&&i.pendingSave&&i.persistenceUncertain));
  h.localStorage.setItem=set;
  if(recovery==='reload'){const fresh=reload(h),newTimers=fresh.realCloud(),newService=service(fresh);fresh.api.local({remove:async k=>deleted.push(k)});await fresh.api.sync();await flush(fresh);assert.equal(newService.uploaded.length,0);assert.equal(newTimers.filter(t=>t.delay===650).length,1);assert.equal(fresh.saved().syncStatus,'pending');assert.deepEqual(deleted,[old.receiptLocalKey]);}
  else {await h.submitForm();await flush(h);assert.equal(h.form.hidden,true);assert.equal(h.saved().expenses.length,1);assert.equal(h.saved().expenses[0].receiptPath,q.uploaded.at(-1));assert.deepEqual(deleted,[old.receiptLocalKey]);}
});
test('manual review: local replacement before primary failure keeps retryable original and succeeds later',async()=>{
  const h=harness(),q=service(h),old=existing(h,{receiptLocalKey:'qa:qa-budget:7:original',receiptPending:true}),deleted=[];h.api.local({remove:async k=>deleted.push(k)});const upsert=h.window.TravelMateCloud.upsertLocalTrip;h.window.TravelMateCloud.upsertLocalTrip=()=>{throw Error('before primary')};
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert.equal(h.saved().expenses[0].receiptLocalKey,old.receiptLocalKey);assert.deepEqual(deleted,[]);assert.equal(h.form.hidden,false);
  h.window.TravelMateCloud.upsertLocalTrip=upsert;await h.submitForm();await flush(h);assert.equal(h.form.hidden,true);assert.deepEqual(deleted,[old.receiptLocalKey]);assert.equal(h.saved().expenses.length,1);
});
test('manual review: failed offline local replacement also retains original local bytes',async()=>{
  const h=harness(),old=existing(h,{receiptLocalKey:'qa:qa-budget:7:original',receiptPending:true}),deleted=[];h.realCloud();const q=service(h);q.failUpload=true;h.api.local({put:async()=> 'qa:qa-budget:7:replacement',remove:async k=>deleted.push(k)});
  const set=h.localStorage.setItem;let fail=true;h.localStorage.setItem=(k,v)=>{if(fail&&k==='travelmate-trips-user:qa')throw Error('backup');set(k,v)};receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.form.hidden,false);assert.equal(h.saved().expenses[0].receiptLocalKey,'qa:qa-budget:7:replacement');assert.deepEqual(deleted,[]);
  fail=false;const fresh=reload(h);service(fresh);fresh.api.local({get:async()=>null,remove:async k=>deleted.push(k)});await fresh.api.sync();await flush(fresh);assert.equal(fresh.queued.length,1);assert.deepEqual(deleted,[old.receiptLocalKey]);assert.equal(fresh.saved().expenses[0].receiptLocalKey,'qa:qa-budget:7:replacement');
});
async function cloudRequests(h,q){const access=await h.window.TravelMateCloud.getPrivateStorageSession(),calls=[];access.client.auth={getSession:async()=>({data:{session:{user:{id:'qa'}}}})};access.client.rpc=(name,args)=>{const d=deferred();calls.push({name,args,...d});return d.promise};h.window.__travelMateSupabaseClient=access.client;return calls;}
function commitSynthetic(q,call,revision){q.remoteExpenses=JSON.parse(JSON.stringify(call.args.p_trip.expenses));q.remoteRevision=revision;q.remoteUpdatedAt=call.args.p_trip.updatedAt;call.resolve({data:{result_status:'saved',result_revision:revision,result_updated_at:q.remoteUpdatedAt}});}
for(const failAt of [1,2])test('manual review: prior remote timer survives replacement failure '+failAt+' without losing its object',async()=>{
  const h=harness(),timers=h.realCloud(),q=service(h),calls=await cloudRequests(h,q);receipt(h);await h.submitForm();const a=h.saved().expenses[0],timer=timers.find(t=>t.delay===650);assert(timer);
  const set=h.localStorage.setItem;let backups=0;h.localStorage.setItem=(k,v)=>{if(k==='travelmate-trips-user:qa'&&++backups===failAt)throw Error('backup before timer cancellation');set(k,v)};
  receipt(h);h.form.dataset.editingId=String(a.id);await h.submitForm();await flush(h);assert.equal(h.form.hidden,false);assert(!timer.cancelled,'older timer remains pending in actual cloud code');assert(!q.removed.includes(a.receiptPath),'old timer may still publish this path');
  h.localStorage.setItem=set;timer.fn();await tick();assert.equal(calls.length,1);assert.equal(calls[0].args.p_trip.expenses[0].receiptPath,a.receiptPath);commitSynthetic(q,calls[0],1);await tick();await flush(h);assert(!q.removed.includes(a.receiptPath));
});
for(const outcome of ['conflict','accepted'])test('manual review: in-flight A is retained until superseding B '+outcome+' evidence',async()=>{
  const h=harness(),timers=h.realCloud(),q=service(h),calls=await cloudRequests(h,q);receipt(h);await h.submitForm();const a=h.saved().expenses[0];timers.find(t=>t.delay===650).fn();await tick();assert.equal(calls.length,1);
  receipt(h);h.form.dataset.editingId=String(a.id);await h.submitForm();await flush(h);const b=h.saved().expenses[0];assert.notEqual(a.receiptPath,b.receiptPath);assert.equal(h.saved().syncStatus,'pending');assert(!q.removed.includes(a.receiptPath),'pre-A remote absence is not retirement evidence');
  timers.filter(t=>t.delay===650).at(-1).fn();await tick();assert.equal(calls.length,1,'actual save chain waits for A');commitSynthetic(q,calls[0],1);await tick();await tick();assert.equal(calls.length,2);await flush(h);assert(!q.removed.includes(a.receiptPath),'A is now remotely referenced');
  if(outcome==='conflict'){calls[1].resolve({data:{result_status:'conflict',result_revision:1,result_updated_at:q.remoteUpdatedAt}});await tick();await tick();await flush(h);assert(!q.removed.includes(a.receiptPath));assert(entries(h).some(i=>i.path===a.receiptPath));}
  else {
    // B was prepared before A's acknowledgement, so its old CAS base conflicts.
    calls[1].resolve({data:{result_status:'conflict',result_revision:1,result_updated_at:q.remoteUpdatedAt}});await tick();await tick();await flush(h);assert(!q.removed.includes(a.receiptPath));
    // Simulate explicit reconciliation of the observed revision, then exercise
    // the unchanged canonical queue and its new snapshot, not a blind retry.
    const reconciled={...h.saved(),cloudRevision:1,cloudUpdatedAt:q.remoteUpdatedAt};delete reconciled.syncConflict;h.window.TravelMateTripStore.saveTrip(reconciled);timers.filter(t=>t.delay===650).at(-1).fn();await tick();assert.equal(calls.length,3);assert.equal(calls[2].args.p_expected_revision,1);
    commitSynthetic(q,calls[2],2);await tick();await tick();await flush(h);assert.equal(h.saved().syncStatus,'synced');assert.equal(h.saved().cloudRevision,2);assert(q.removed.includes(a.receiptPath));assert(!q.removed.includes(b.receiptPath));
  }
});
test('manual review: absent old path without positive acknowledged revision remains retained',async()=>{
  for(const status of ['pending','failed','unknown','conflict','synced']){const h=harness(),q=service(h),old=existing(h);receipt(h);h.form.dataset.editingId='7';await h.submitForm();h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),syncStatus:status});await flush(h);assert(!q.removed.includes(old.receiptPath));assert(entries(h).some(i=>i.path===old.receiptPath));}
});
test('manual review: equal pre-replacement revision cannot authorize retirement',async()=>{
  const h=harness(),q=service(h),old=existing(h);Object.assign(h.api.state.trip,{syncStatus:'synced',cloudRevision:4,cloudUpdatedAt:'2026-10-21T09:00:00.004Z'});h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();receipt(h);h.form.dataset.editingId='7';await h.submitForm();q.remoteExpenses=JSON.parse(JSON.stringify(h.saved().expenses));q.remoteRevision=4;q.remoteUpdatedAt='2026-10-21T09:00:00.004Z';await flush(h);assert(!q.removed.includes(old.receiptPath));assert.equal(entries(h).find(i=>i.path===old.receiptPath).retireAfterRevision,4);
  remoteAccepted(h,q);await flush(h);assert(q.removed.includes(old.receiptPath));
});
test('manual review: mismatched or uncertain acknowledgement cannot authorize remote deletion',async()=>{
  for(const variant of ['timestamp','revision','payload','mutation','conflict','no-rpc']){const h=harness(),q=service(h),old=existing(h);receipt(h);h.form.dataset.editingId='7';await h.submitForm();remoteAccepted(h,q);
    if(variant==='timestamp')q.remoteUpdatedAt='2026-10-21T08:00:00Z';if(variant==='revision')q.remoteRevision=99;if(variant==='payload')q.remoteExpenses=[];
    if(variant==='mutation')h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),syncMutationId:'pending-new-write'});if(variant==='conflict')h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),syncConflict:{serverRevision:2}});if(variant==='no-rpc'){const access=await h.window.TravelMateCloud.getPrivateStorageSession();delete access.client.rpc;}
    await flush(h);assert(!q.removed.includes(old.receiptPath),variant);assert(entries(h).some(i=>i.path===old.receiptPath));
  }
});
test('manual review: pending mutation during remote reference read reblocks cleanup',async()=>{
  const h=harness(),q=service(h),old=existing(h);receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);remoteAccepted(h,q);q.holdQuery=deferred();const running=h.api.cleanup();await tick();h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),syncStatus:'pending',syncMutationId:'next'});q.holdQuery.resolve();await running;assert(!q.removed.includes(old.receiptPath));
});
test('manual review: missing or malformed retirement watermark retains remote intent',async()=>{
  for(const revision of [undefined,null,-1,'invalid']){const h=harness(),q=service(h),old=existing(h);receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);const items=entries(h);for(const item of items)if(item.path===old.receiptPath){if(revision===undefined)delete item.retireAfterRevision;else item.retireAfterRevision=revision;}h.localStorage.setItem('travelmate-receipt-cleanup:qa',JSON.stringify(items));remoteAccepted(h,q);await flush(h);assert(!q.removed.includes(old.receiptPath));}
});

function sharedReceipt(){const h=harness('actor-b');h.api.state.trip.ownerId='shared-owner';const old=existing(h,{receiptPath:'actor-a/receipts/qa-budget/original-a'});return{h,old};}
function actorEntries(h){return JSON.parse(h.localStorage.getItem('travelmate-receipt-cleanup:actor-b')||'[]');}
test('shared review: B can replace A upload on shared owner trip without deleting A resource',async()=>{
  const {h,old}=sharedReceipt(),q=service(h);receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.form.hidden,true);assert.equal(h.queued.length,1);assert.equal(h.saved().ownerId,'shared-owner');assert.equal(h.saved().id,'qa-budget');assert.equal(h.saved().expenses.length,1);assert.equal(h.saved().expenses[0].id,7);assert.equal(h.saved().expenses[0].currency,'CZK');assert(h.saved().expenses[0].receiptPath.startsWith('actor-b/receipts/qa-budget/'));
  remoteAccepted(h,q);await flush(h);assert(!q.removed.includes(old.receiptPath));assert(!actorEntries(h).some(i=>i.path===old.receiptPath));assert.equal(h.localStorage.getItem('travelmate-receipt-cleanup:actor-a'),null);
});
for(const failAt of [1,2])for(const recovery of ['reload','form retry'])test('shared review: partial backup '+failAt+' recovers B replacement via '+recovery+' while retaining A',async()=>{
  const {h,old}=sharedReceipt();h.api.state.trip.syncStatus='synced';h.window.TravelMateCloud.upsertLocalTrip(h.api.state.trip);h.api.capture();const timers=h.realCloud(),q=service(h),set=h.localStorage.setItem;let backups=0;
  h.localStorage.setItem=(k,v)=>{if(k==='travelmate-trips-user:actor-b'&&++backups===failAt)throw Error('actual shared actor backup quota');set(k,v)};
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.saved().expenses[0].receiptPath,q.uploaded[0],'primary metadata is partially accepted before backup/queue throws');assert.equal(h.form.hidden,false);assert.equal(h.form.amount.value,'42.50');assert.equal(h.window.lastToast,undefined);assert.equal(timers.filter(t=>t.delay===650).length,0);
  assert(actorEntries(h).some(i=>i.path===q.uploaded[0]&&i.persistenceUncertain&&i.pendingSave&&i.pendingSave.previousPath===old.receiptPath));assert(!actorEntries(h).some(i=>i.path===old.receiptPath));assert(!q.removed.includes(old.receiptPath));
  h.localStorage.setItem=set;
  if(recovery==='reload'){const fresh=reload(h),freshTimers=fresh.realCloud(),freshQ=service(fresh);await fresh.api.sync();await flush(fresh);assert.equal(fresh.localStorage.getItem('travelmate-active-user'),'actor-b');assert.equal(fresh.saved().ownerId,'shared-owner');assert.equal(fresh.saved().expenses[0].receiptPath,q.uploaded[0]);assert.equal(freshQ.uploaded.length,0);assert.equal(freshTimers.filter(t=>t.delay===650).length,1);assert.equal(fresh.saved().syncStatus,'pending');assert(!actorEntries(fresh).some(i=>i.pendingSave));assert(!freshQ.removed.includes(old.receiptPath));}
  else {await h.submitForm();await flush(h);assert.equal(h.form.hidden,true);assert.equal(h.saved().expenses.length,1);assert.equal(h.saved().ownerId,'shared-owner');assert(h.saved().expenses[0].receiptPath.startsWith('actor-b/'));assert(!q.removed.includes(old.receiptPath));assert(!actorEntries(h).some(i=>i.path===old.receiptPath));}
});
test('shared review: offline B replacement uses its tracked local candidate and recovers after partial save',async()=>{
  const {h,old}=sharedReceipt();h.realCloud();const q=service(h);q.failUpload=true;const key='shared-owner:qa-budget:7:actor-b-new';h.api.local({put:async()=>{h.api.queue(h.api.context(),{receiptLocalKey:key});return key}});
  const set=h.localStorage.setItem;let fail=true;h.localStorage.setItem=(k,v)=>{if(fail&&k==='travelmate-trips-user:actor-b')throw Error('backup quota');set(k,v)};
  receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);assert.equal(h.form.hidden,false);assert.equal(h.saved().expenses[0].receiptPath,old.receiptPath);assert.equal(h.saved().expenses[0].receiptLocalKey,key);assert.equal(h.saved().expenses[0].receiptPending,true);
  assert(actorEntries(h).some(i=>i.localKey===key&&i.pendingSave));assert(!q.removed.includes(old.receiptPath));fail=false;
  const fresh=reload(h),freshQ=service(fresh);fresh.api.local({get:async()=>null});await fresh.api.sync();await flush(fresh);assert.equal(fresh.queued.length,1);assert.equal(fresh.saved().expenses[0].receiptLocalKey,key);assert(!actorEntries(fresh).some(i=>i.pendingSave));assert(!freshQ.removed.includes(old.receiptPath));
});
test('shared review: missing tracked replacement intent fails closed without authorizing A deletion',async()=>{
  const {h,old}=sharedReceipt(),q=service(h);h.api.receipt(async()=> 'actor-b/receipts/qa-budget/untracked');receipt(h);h.form.dataset.editingId='7';await h.submitForm();await flush(h);
  assert.equal(h.form.hidden,false);assert.equal(h.queued.length,0);assert.equal(h.saved().expenses[0].receiptPath,old.receiptPath);assert(!q.removed.includes(old.receiptPath));assert(!actorEntries(h).some(i=>i.path===old.receiptPath));
});
test('shared review: changed canonical receipt during B upload is not overwritten',async()=>{
  const {h,old}=sharedReceipt(),q=service(h);q.holdUpload=deferred();receipt(h);h.form.dataset.editingId='7';const pending=h.submitForm();await tick();h.window.TravelMateCloud.upsertLocalTrip({...h.saved(),expenses:[{...h.saved().expenses[0],receiptPath:'actor-a/receipts/qa-budget/newer-a'}]});q.holdUpload.resolve();await pending;await flush(h);
  assert.equal(h.form.hidden,false);assert.equal(h.saved().expenses[0].receiptPath,'actor-a/receipts/qa-budget/newer-a');assert.equal(h.queued.length,0);assert(!q.removed.includes(old.receiptPath));
});
