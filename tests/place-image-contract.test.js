const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('saved plan places never impersonate the destination image as a place photo', () => {
  const source = read('assets/app.js');
  assert.match(source, /image=safePlannerUrl\(place\.image\),links=''/);
  assert.doesNotMatch(source, /image=safePlannerUrl\(place\.image\)\|\|safePlannerUrl\(fallbackImage\)/);
  assert.match(source, /image\?'<img class="saved-place-image"/);
  assert.match(source, /אין תמונה זמינה עבור/);
});

test('nearby result keeps the resolved POI image available to the save flow', () => {
  const nearby = read('assets/nearby.js');
  const app = read('assets/app.js');
  assert.match(nearby, /data-place-image="'\+escapeHtml\(place\.image\)\+'"/);
  assert.match(nearby, /card\.dataset\.placeImage = place\.image/);
  assert.match(app, /result\.dataset\.placeImage\|\|''/);
});

test('POIs without OSM media metadata get a geospatially bounded Wikipedia image lookup', () => {
  const nearby = read('assets/nearby.js');
  assert.match(nearby, /async function fetchNamedPlaceThumbnail\(place\)/);
  assert.match(nearby, /generator:'search'/);
  assert.match(nearby, /distance\(Number\(place\.lat\), Number\(place\.lon\).*<= 1200/);
  assert.match(nearby, /if \(!media\.image\) media\.image = await fetchNamedPlaceThumbnail\(place\)/);
});
