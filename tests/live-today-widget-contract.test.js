'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const widget = require('../assets/native-widget-snapshot.js');
const today = require('../assets/custom-trip.js');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function trip() {
  return {
    id:'trip-live', ownerId:'owner-1', start:'2026-10-09', end:'2026-10-11', days:3,
    activities:[
      {id:'done',date:'2026-10-09',time:'09:00',duration:60,done:true,scheduleMode:'fixed'},
      {id:'flex',date:'2026-10-09',time:'10:00',duration:120,scheduleMode:'flexible'},
      {id:'current',date:'2026-10-09',time:'12:00',duration:90,scheduleMode:'fixed'},
      {id:'next',date:'2026-10-09',time:'15:00',duration:60,scheduleMode:'fixed'}
    ]
  };
}

test('Live Today consumes the canonical fixed agenda and never promotes done or flexible items', () => {
  const snap = widget.buildSnapshot({trip:trip(),now:new Date(2026,9,9,12,30),todayApi:today,accountId:'user-1'});
  assert.deepEqual(snap.agenda.map(item=>item.id),['current','next']);
  assert.ok(snap.agenda[0].startEpochMs <= new Date(2026,9,9,12,30).getTime());
  assert.ok(snap.agenda[0].endEpochMs > new Date(2026,9,9,12,30).getTime());
  assert.equal(snap.privacyMode,'redacted');
  assert.equal(snap.agenda[0].title,'');
  assert.equal(snap.agenda[0].location,'');
});

test('Android registers a separate Live Today widget using the existing snapshot store', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const bridge = read('android/app/src/main/java/com/travelmate/app/TravelMateWidgetBridgePlugin.java');
  assert.match(manifest,/\.TravelMateLiveTodayWidgetProvider/);
  assert.match(manifest,/@xml\/travelmate_live_today_widget_info/);
  assert.match(bridge,/safe\.put\("phase", phase\)/);
  assert.match(bridge,/TravelMateWidgetProvider\.refreshAll\(context\)/);
  assert.match(bridge,/TravelMateLiveTodayWidgetProvider\.refreshAll\(context\)/);
  assert.doesNotMatch(bridge,/title|locationName|address/);
});

test('Live Today provider is offline snapshot-only and uses bounded TravelMate deep links', () => {
  const source = read('android/app/src/main/java/com/travelmate/app/TravelMateLiveTodayWidgetProvider.java');
  assert.match(source,/readActiveSnapshot\(context\)/);
  assert.match(source,/snapshot\.optJSONObject\("liveToday"\)/);
  assert.match(source,/validUntilEpochMs/);
  assert.doesNotMatch(source,/optJSONObject\(0\)|start <= now|start > now/);
  assert.match(source,/appendQueryParameter\("view", "plan"\)/);
  assert.match(source,/appendQueryParameter\("view", "overview"\).*appendQueryParameter\("panel", "changes"\)/s);
  assert.match(source,/expiresAtEpochMs/);
  assert.doesNotMatch(source,/Http|fetch\(|URL\(|URLConnection|OkHttp/);
});

test('Live Today layout is RTL-aware, touchable and OS-managed rather than minute-exact', () => {
  const layout = read('android/app/src/main/res/layout/travelmate_live_today_widget.xml');
  const info = read('android/app/src/main/res/xml/travelmate_live_today_widget_info.xml');
  assert.match(layout,/android:layoutDirection="locale"/);
  assert.match(layout,/android:contentDescription="@string\/live_today_widget_description"/);
  assert.match(layout,/android:id="@\+id\/live_widget_open_plan"[\s\S]*android:layout_height="40dp"/);
  assert.match(info,/android:updatePeriodMillis="1800000"/);
  assert.match(info,/android:resizeMode="horizontal\|vertical"/);
  assert.doesNotMatch(info,/60000|600000/);
});

test('Live Today keeps weather and unread data inside the existing privacy-scoped snapshot', () => {
  const snap = widget.buildSnapshot({
    trip:trip(), now:new Date(2026,9,9,12,30), todayApi:today, accountId:'user-1',
    weather:{ready:true,currentLabel:'בהיר',temperature:23}, unreadCount:4
  });
  assert.equal(snap.weather.ready,true);
  assert.equal(snap.weather.temperatureC,23);
  assert.equal(snap.unreadChanges,4);
  const encoded=JSON.stringify(snap);
  assert.doesNotMatch(encoded,/documents|health|receipt|merchant|privateMessage/);
});
