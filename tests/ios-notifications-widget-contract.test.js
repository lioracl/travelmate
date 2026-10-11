import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const notifications = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateNotificationsWidget.swift', 'utf8');
const budget = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.swift', 'utf8');
const bridge = fs.readFileSync('ios/App/App/TravelMateWidgetBridgePlugin.swift', 'utf8');
const configure = fs.readFileSync('tools/configure-ios-budget-widget.rb', 'utf8');
const snapshot = fs.readFileSync('assets/native-widget-snapshot.js', 'utf8');

test('iOS Notifications is the fourth kind in the existing WidgetKit extension', () => {
  assert.match(budget, /TravelMateBudgetWidget\(\)[\s\S]*TravelMateLiveTodayWidget\(\)[\s\S]*TravelMateWeatherWidget\(\)[\s\S]*TravelMateNotificationsWidget\(\)/);
  assert.match(notifications, /struct TravelMateNotificationsWidget: Widget/);
  assert.match(notifications, /let kind = "TravelMateNotificationsWidget"/);
  assert.match(configure, /add_source\(widget_group, widget, 'TravelMateNotificationsWidget\.swift'\)/);
  assert.equal((configure.match(/project\.new_target\(:app_extension/g) || []).length, 1);
});

test('Notifications consumes only the bounded redacted unread count', () => {
  assert.match(notifications, /group\.com\.travelmate\.app/);
  assert.match(notifications, /privacyMode == "redacted"/);
  assert.match(notifications, /schemaVersion == 1/);
  assert.match(notifications, /let unreadChanges: Int\?/);
  assert.match(notifications, /max\(0, min\(999, snapshot\?\.unreadChanges \?\? 0\)\)/);
  assert.match(snapshot, /unreadChanges:/);
  assert.doesNotMatch(notifications, /URLSession|Supabase|Realtime|HealthKit|HKHealthStore|CLLocationManager|document|messageBody|actorName|eventSummary/);
});

test('Notifications uses the existing changes-center deep link only', () => {
  assert.match(notifications, /components\.scheme = "travelmate"/);
  assert.match(notifications, /URLQueryItem\(name: "view", value: "overview"\)/);
  assert.match(notifications, /URLQueryItem\(name: "panel", value: "changes"\)/);
  assert.match(notifications, /\.widgetURL\(changesURL\)/);
});

test('Bridge refreshes all four WidgetKit kinds from one lifecycle', () => {
  assert.match(bridge, /"TravelMateBudgetWidget", "TravelMateLiveTodayWidget", "TravelMateWeatherWidget", "TravelMateNotificationsWidget"/);
  assert.match(bridge, /unreadChanges": max\(0, min\(999,/);
  assert.match(bridge, /reloadWidgetTimelines\(\)/);
  assert.match(bridge, /clearSnapshot/);
});

test('Notifications exposes zero unread stale RTL accessibility and OS-managed refresh states', () => {
  assert.match(notifications, /הכול מעודכן/);
  assert.match(notifications, /מידע שמור/);
  assert.match(notifications, /layoutDirection, \.rightToLeft/);
  assert.match(notifications, /\.privacySensitive\(\)/);
  assert.match(notifications, /accessibilityLabel/);
  assert.match(notifications, /policy: \.after\(refresh\)/);
  assert.match(notifications, /supportedFamilies\(\[\.systemSmall, \.systemMedium\]\)/);
  assert.doesNotMatch(notifications, /scheduledTimer|Timer\.|60\s*\*\s*1000/);
});
