import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const weather = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateWeatherWidget.swift', 'utf8');
const budget = fs.readFileSync('ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.swift', 'utf8');
const bridge = fs.readFileSync('ios/App/App/TravelMateWidgetBridgePlugin.swift', 'utf8');
const configure = fs.readFileSync('tools/configure-ios-budget-widget.rb', 'utf8');
const snapshot = fs.readFileSync('assets/native-widget-snapshot.js', 'utf8');

test('iOS Weather is a third kind in the existing WidgetKit extension', () => {
  assert.match(budget, /TravelMateBudgetWidget\(\)[\s\S]*TravelMateLiveTodayWidget\(\)[\s\S]*TravelMateWeatherWidget\(\)/);
  assert.match(weather, /struct TravelMateWeatherWidget: Widget/);
  assert.match(weather, /let kind = "TravelMateWeatherWidget"/);
  assert.match(configure, /add_source\(widget_group, widget, 'TravelMateWeatherWidget\.swift'\)/);
  assert.equal((configure.match(/project\.new_target\(:app_extension/g) || []).length, 1, 'Weather should reuse the existing extension target');
});

test('Weather widget is snapshot-only and never owns weather networking or GPS', () => {
  assert.match(weather, /group\.com\.travelmate\.app/);
  assert.match(weather, /privacyMode == "redacted"/);
  assert.match(weather, /schemaVersion == 1/);
  assert.match(weather, /snapshot_json:/);
  assert.doesNotMatch(weather, /URLSession|CLLocationManager|CoreLocation|fetch\s*\(|Open-Meteo|Supabase/);
  assert.match(snapshot, /TravelMateWeatherContext/);
});

test('Weather freshness remains explicit and zero is not invented for missing temperature', () => {
  assert.match(weather, /weather\.ready/);
  assert.match(weather, /validUntilEpochMs/);
  assert.match(weather, /temperatureC\.map/);
  assert.match(weather, /"—"/);
  assert.match(weather, /מזג האוויר לא זמין/);
  assert.match(snapshot, /temperatureC: ready && Number\.isFinite\(temperature\) \? Math\.round\(temperature\) : null/);
});

test('Weather widget uses only the existing overview navigation target', () => {
  assert.match(weather, /components\.scheme = "travelmate"/);
  assert.match(weather, /components\.host = "trip"/);
  assert.match(weather, /URLQueryItem\(name: "view", value: "overview"\)/);
  assert.doesNotMatch(weather, /view.*weather|nativeAction.*weather|panel.*weather/);
  assert.match(weather, /\.widgetURL\(overviewURL\)/);
});

test('Bridge refreshes Budget Live Today and Weather from the same lifecycle', () => {
  assert.match(bridge, /"TravelMateBudgetWidget", "TravelMateLiveTodayWidget", "TravelMateWeatherWidget"/);
  assert.match(bridge, /reloadWidgetTimelines\(\)/);
  assert.match(bridge, /clearSnapshot/);
});

test('Weather widget is RTL accessible privacy-sensitive and OS-managed', () => {
  assert.match(weather, /layoutDirection, \.rightToLeft/);
  assert.match(weather, /\.privacySensitive\(\)/);
  assert.match(weather, /accessibilityLabel/);
  assert.match(weather, /policy: \.after\(refresh\)/);
  assert.match(weather, /supportedFamilies\(\[\.systemSmall, \.systemMedium\]\)/);
  assert.doesNotMatch(weather, /scheduledTimer|Timer\.|60\s*\*\s*1000/);
});
