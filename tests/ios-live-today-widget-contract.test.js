import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateLiveTodayWidget.swift', 'utf8');
const budget = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.swift', 'utf8');
const bridge = fs.readFileSync('ios/App/App/TravelMateWidgetBridgePlugin.swift', 'utf8');
const configure = fs.readFileSync('tools/configure-ios-budget-widget.rb', 'utf8');
const snapshot = fs.readFileSync('assets/native-widget-snapshot.js', 'utf8');

test('iOS Live Today is a second widget in the existing WidgetKit bundle', () => {
  assert.match(budget, /TravelMateBudgetWidget\(\)[\s\S]*TravelMateLiveTodayWidget\(\)/);
  assert.match(live, /struct TravelMateLiveTodayWidget: Widget/);
  assert.match(live, /let kind = "TravelMateLiveTodayWidget"/);
  assert.match(configure, /add_source\(widget_group, widget, 'TravelMateLiveTodayWidget\.swift'\)/);
  assert.equal((configure.match(/project\.new_target\(:app_extension/g) || []).length, 1, 'Live Today should reuse the existing extension target');
});

test('Live Today consumes only the canonical redacted App Group snapshot', () => {
  assert.match(live, /group\.com\.travelmate\.app/);
  assert.match(live, /privacyMode == "redacted"/);
  assert.match(live, /schemaVersion == 1/);
  assert.match(live, /snapshot_json:/);
  assert.match(live, /accountId/);
  assert.match(live, /tripId/);
  assert.doesNotMatch(live, /URLSession|CLLocationManager|HealthKit|HKHealthStore|Supabase|fetch\s*\(/);
});

test('canonical native agenda excludes completed flexible and window commitments before WidgetKit', () => {
  assert.match(snapshot, /record\.done === true/);
  assert.match(snapshot, /mode === 'flexible' \|\| mode === 'window'/);
  assert.match(snapshot, /todayApi\.agenda/);
  assert.match(live, /selectedItem\(snapshot\.agenda/);
  assert.match(live, /endEpochMs > nowMs/);
});

test('Live Today exposes phase, fresh cached weather and collaboration unread state', () => {
  for (const phase of ['ACTIVE', 'BEFORE', 'AFTER']) assert.match(live, new RegExp(`case "${phase}"`));
  assert.match(live, /weather\.ready/);
  assert.match(live, /validUntilEpochMs/);
  assert.match(live, /unreadChanges/);
  assert.match(live, /מזג אוויר לא זמין/);
});

test('Live Today uses bounded TravelMate deep links only', () => {
  assert.match(live, /components\.scheme = "travelmate"/);
  assert.match(live, /components\.host = "trip"/);
  assert.match(live, /view == "plan" \|\| view == "overview"/);
  assert.match(live, /URLQueryItem\(name: "panel", value: "changes"\)/);
  assert.match(live, /\.widgetURL\(planURL\)/);
});

test('Bridge refreshes Budget and Live Today from the same snapshot lifecycle', () => {
  assert.match(bridge, /"TravelMateBudgetWidget", "TravelMateLiveTodayWidget"/);
  assert.match(bridge, /reloadWidgetTimelines\(\)/);
  assert.match(bridge, /reloadTimelines\(ofKind: \$0\)/);
  assert.match(bridge, /clearSnapshot/);
});

test('Live Today remains RTL accessible privacy-sensitive and OS-managed', () => {
  assert.match(live, /layoutDirection, \.rightToLeft/);
  assert.match(live, /\.privacySensitive\(\)/);
  assert.match(live, /accessibilityLabel/);
  assert.match(live, /policy: \.after\(refresh\)/);
  assert.match(live, /30 \* 60/);
  assert.doesNotMatch(live, /Timer\.|scheduledTimer|60\s*\*\s*1000/);
});
