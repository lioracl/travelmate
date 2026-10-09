'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const widget = require('../assets/native-widget-snapshot.js');

const root = path.join(__dirname, '..');
function read(...parts) { return fs.readFileSync(path.join(root, ...parts), 'utf8'); }

function budgetTrip(overrides={}) {
  return Object.assign({
    id:'budget-trip', ownerId:'user-1', country:'Czechia', city:'Prague',
    start:'2026-10-08', end:'2026-10-10', budget:100, budgetUnlimited:false,
    secondaryCurrency:'ILS',
    expenses:[
      {id:'e1',amount:250,currency:'CZK',date:'2026-10-08',category:'אוכל',note:'private merchant'},
      {id:'e2',amount:10,currency:'EUR',date:'2026-10-09',category:'תחבורה',note:'private note'}
    ]
  }, overrides);
}

function rates(savedAt) {
  return {rate:4,rates:{ILS:4,CZK:25,USD:1.1},ilsRates:{ILS:1,CZK:.16,EUR:4},date:'2026-10-09',savedAt};
}

test('budget widget uses canonical trip expense fields and converts into trip currency', () => {
  const now = new Date(2026,9,9,12,0);
  const budget = widget.buildBudgetWidget(budgetTrip(), now, rates(now.getTime()-60*60*1000));
  assert.equal(budget.ready,true);
  assert.equal(budget.tripCurrency,'CZK');
  assert.equal(budget.homeCurrency,'ILS');
  assert.equal(budget.mode,'limited');
  assert.equal(budget.spent,500);
  assert.equal(budget.limit,2500);
  assert.equal(budget.remaining,2000);
  assert.equal(budget.overrun,0);
  assert.equal(budget.dailyPace,250);
  assert.equal(budget.paceState,'active');
  assert.equal(budget.fx.rate,.16);
  assert.equal(budget.fx.convertedSpentValue,80);
  assert.equal(budget.fx.freshness,'fresh');
});

test('unlimited widget never invents remaining budget and exposes spending pace', () => {
  const now = new Date(2026,9,9,12,0);
  const budget = widget.buildBudgetWidget(budgetTrip({budgetUnlimited:true,budget:0}), now, rates(now.getTime()-1000));
  assert.equal(budget.mode,'unlimited');
  assert.equal(budget.limit,null);
  assert.equal(budget.remaining,null);
  assert.equal(budget.overrun,null);
  assert.equal(budget.dailyPace,250);
});

test('overrun and stale FX remain explicit instead of being clamped into misleading remaining', () => {
  const now = new Date(2026,9,9,12,0);
  const budget = widget.buildBudgetWidget(budgetTrip({budget:10}), now, rates(now.getTime()-13*60*60*1000));
  assert.equal(budget.remaining,0);
  assert.equal(budget.overrun,250);
  assert.equal(budget.fx.freshness,'stale');
  assert.equal(budget.fx.rate,.16);
});

test('missing conversion data fails budget completeness closed and FX stays unavailable', () => {
  const budget = widget.buildBudgetWidget(budgetTrip(), new Date(2026,9,9,12,0), null);
  assert.equal(budget.ready,false);
  assert.equal(budget.spent,0);
  assert.equal(budget.fx.freshness,'unavailable');
  assert.equal(budget.fx.rate,null);
});

test('budget widget snapshot leaks no merchant note category receipt or document content', () => {
  const now = new Date(2026,9,9,12,0);
  const trip = budgetTrip({documents:[{name:'secret.pdf'}],health:{steps:1}});
  trip.expenses[0].receiptPath='user/receipts/private.jpg';
  const snap = widget.buildSnapshot({trip,now,accountId:'user-1',fxCache:rates(now.getTime()-1000)});
  const encoded = JSON.stringify(snap.budgetWidget);
  assert.doesNotMatch(encoded,/private merchant|private note|אוכל|תחבורה|receipt|secret|health/i);
  assert.equal(snap.privacyMode,'redacted');
});

test('budget deep-link actions are bounded to quick expense and converter', () => {
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/budget-trip?view=budget&action=quick-expense'),{tripId:'budget-trip',view:'budget',panel:'',action:'quick-expense'});
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/budget-trip?view=budget&action=converter'),{tripId:'budget-trip',view:'budget',panel:'',action:'converter'});
  assert.deepEqual(widget.parseDeepLink('travelmate://trip/budget-trip?view=budget&action=delete-all'),{tripId:'budget-trip',view:'budget',panel:'',action:''});
});

test('Android registers the widget and strict TravelMate deep-link entry point', () => {
  const manifest = read('android','app','src','main','AndroidManifest.xml');
  assert.match(manifest,/TravelMateWidgetProvider/);
  assert.match(manifest,/android\.appwidget\.action\.APPWIDGET_UPDATE/);
  assert.match(manifest,/@xml\/travelmate_widget_info/);
  assert.match(manifest,/android:scheme="travelmate"/);
  assert.match(manifest,/android:host="trip"/);
  assert.match(manifest,/@xml\/backup_rules/);
  assert.match(manifest,/@xml\/data_extraction_rules/);
});

test('native bridge storage is account-trip scoped and excludes widget prefs from backup', () => {
  const bridge = read('android','app','src','main','java','com','travelmate','app','TravelMateWidgetBridgePlugin.java');
  const backup = read('android','app','src','main','res','xml','backup_rules.xml');
  const extraction = read('android','app','src','main','res','xml','data_extraction_rules.xml');
  assert.match(bridge,/snapshot_json:/);
  assert.match(bridge,/ACTIVE_SNAPSHOT_KEY/);
  assert.match(bridge,/accountId/);
  assert.match(bridge,/tripId/);
  assert.doesNotMatch(bridge,/receiptPath|receiptName|merchant|note/);
  assert.match(backup,/travelmate_widget\.xml/);
  assert.match(extraction,/travelmate_widget\.xml/);
});

test('quick expense reuses Budget V2 UI and guards duplicate submit without a second store', () => {
  const actions = read('assets','budget-widget-actions.js');
  assert.match(actions,/data-receipt-form/);
  assert.match(actions,/widgetSubmitLocked/);
  assert.match(actions,/travelmate:local-trips-updated/);
  assert.match(actions,/TravelMateFeatures/);
  assert.doesNotMatch(actions,/supabase|\.from\(|localStorage\.setItem|queueTripSave|saveTrip\(/i);
});

test('converter action reuses the existing converter and never fetches rates itself', () => {
  const actions = read('assets','budget-widget-actions.js');
  assert.match(actions,/data-currency-converter/);
  assert.match(actions,/TravelMateCurrency/);
  assert.doesNotMatch(actions,/fetch\(|XMLHttpRequest|geolocation/i);
});

test('native staging injects widget actions and snapshot only into staged native HTML', () => {
  const stage = read('tools','stage-native-web.mjs');
  const pwa = read('trip','custom','index.html');
  assert.match(stage,/budget-widget-actions\.js/);
  assert.match(stage,/native-widget-snapshot\.js/);
  assert.doesNotMatch(pwa,/budget-widget-actions\.js|native-widget-snapshot\.js/);
});

test('Capacitor App deep-link plugin is pinned to the Capacitor 8 family', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@capacitor/app'],'8.1.2');
  assert.equal(pkg.dependencies['@capacitor/core'],'8.5.2');
});


test('native sanitizer preserves budget readiness and provider fails incomplete totals closed', () => {
  const bridge = read('android','app','src','main','java','com','travelmate','app','TravelMateWidgetBridgePlugin.java');
  const provider = read('android','app','src','main','java','com','travelmate','app','TravelMateWidgetProvider.java');
  assert.match(bridge,/safe\.put\("ready", input\.optBoolean\("ready", false\)\)/);
  assert.match(provider,/!budget\.optBoolean\("ready", false\)/);
  assert.match(provider,/unavailableBudgetViews/);
});

test('RemoteViews layout avoids unsupported spacer classes', () => {
  const layout = read('android','app','src','main','res','layout','travelmate_widget.xml');
  assert.doesNotMatch(layout,/<Space\b/);
  assert.match(layout,/android:layout_marginStart="8dp"/);
});
