import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const plugin = read('ios/App/App/TravelMateWidgetBridgePlugin.swift');
const bridge = read('ios/App/App/TravelMateBridgeViewController.swift');
const scene = read('ios/App/App/SceneDelegate.swift');
const appEntitlements = read('ios/App/App/App.entitlements');
const widget = read('ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.swift');
const widgetEntitlements = read('ios/App/TravelMateBudgetWidget/TravelMateBudgetWidget.entitlements');
const widgetInfo = read('ios/App/TravelMateBudgetWidget/Info.plist');
const appInfo = read('ios/App/App/Info.plist');
const configure = read('tools/configure-ios-budget-widget.rb');

test('iOS widget bridge is registered locally and reuses the existing privacy-redacted snapshot', () => {
  assert.match(bridge, /registerPluginInstance\(TravelMateWidgetBridgePlugin\(\)\)/);
  assert.match(scene, /TravelMateBridgeViewController\(\)/);
  assert.match(plugin, /jsName = "TravelMateWidgetBridge"/);
  assert.match(plugin, /privacyMode.*redacted/s);
  assert.match(plugin, /snapshot_json:/);
  assert.match(plugin, /accountId/);
  assert.match(plugin, /tripId/);
  assert.match(plugin, /WidgetCenter\.shared\.reloadTimelines/);
  assert.doesNotMatch(plugin, /URLSession|fetch\(|CLLocation|HealthKit|HKHealthStore/);
});

test('iOS app and widget share only the dedicated App Group and TravelMate deep-link scheme', () => {
  for (const entitlements of [appEntitlements, widgetEntitlements]) assert.match(entitlements, /group\.com\.travelmate\.app/);
  assert.match(appInfo, /<string>travelmate<\/string>/);
  assert.match(widgetInfo, /com\.apple\.widgetkit-extension/);
});

test('Budget WidgetKit is offline snapshot-only and preserves limited unlimited stale and FX semantics', () => {
  assert.match(widget, /UserDefaults\(suiteName: travelMateAppGroup\)/);
  assert.match(widget, /budget\.mode == "unlimited"/);
  assert.match(widget, /budget\.overrun/);
  assert.match(widget, /budget\.remaining/);
  assert.match(widget, /budget\.dailyPace/);
  assert.match(widget, /fx\.freshness == "fresh" \|\| fx\.freshness == "stale"/);
  assert.match(widget, /מידע שמור במכשיר/);
  assert.match(widget, /quick-expense/);
  assert.match(widget, /converter/);
  assert.match(widget, /supportedFamilies\(\[\.systemMedium\]\)/);
  assert.match(widget, /Timeline\(entries: \[entry\], policy: \.after\(refresh\)\)/);
  assert.doesNotMatch(widget, /URLSession|CLLocation|HealthKit|HKHealthStore|receipt|document|notes?/i);
});

test('Xcode bootstrap config is additive, version-aligned and embeds the WidgetKit extension', () => {
  assert.match(configure, /new_target\(:app_extension, widget_name, :ios, '15\.0'\)/);
  assert.match(configure, /com\.travelmate\.app\.budgetwidget/);
  assert.match(configure, /App\/App\.entitlements/);
  assert.match(configure, /TravelMateBudgetWidget\/TravelMateBudgetWidget\.entitlements/);
  assert.match(configure, /MARKETING_VERSION.*2\.21\.0/);
  assert.match(configure, /CURRENT_PROJECT_VERSION.*22100/);
  assert.match(configure, /Embed App Extensions/);
  assert.match(configure, /WidgetKit\.framework/);
});
