'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Prague background uses one optimized destination image owner',()=>{
  const images=read('assets/destination-images.js');
  const redesign=read('assets/trip-redesign.js');
  assert.match(images,/1280px-Prague_castle_panorama\.jpg/);
  assert.doesNotMatch(images,/Prague%20castle%20panorama\.jpg\?width=2200/);
  assert.doesNotMatch(redesign,/Prague%20castle%20panorama\.jpg|1280px-Prague_castle_panorama/);
  assert.match(images,/travelmate-destination-images-v7/);
});

test('custom trip renders local state before idle cloud hydration',()=>{
  const custom=read('assets/custom-trip.js');
  assert.match(custom,/if \(immediateTrip && !inviteToken\)/);
  assert.match(custom,/window\.travelMateTripReady = Promise\.resolve\(immediateTrip\)/);
  assert.match(custom,/scheduleCloudRefresh\(immediateTrip\)/);
  assert.match(custom,/requestIdleCallback\(run, \{ timeout: 2000 \}\)/);
  assert.match(custom,/resolveCloudTrip\(immediateTrip, inviteToken\)/);
});

test('Overview critical materials and stable dynamic slots exist before first paint',()=>{
  const html=read('trip/custom/index.html');
  for(const css of ['weather-widget.css','trip-intelligence.css','readable-glass.css']){
    assert.match(html,new RegExp('data-travelmate-style="'+css.replace('.','\\.')+'"'));
  }
  assert.match(html,/data-weather-top-widget/);
  assert.match(html,/data-navo-trip-banner/);
  assert.match(html,/<body class="tm-new-design" data-trip-kind="custom">/);
  assert.match(html,/document\.body\.dataset\.tripView=v/);
  assert.doesNotMatch(html,/security-center\.css[^\n]*admin-center\.css/);
  assert.doesNotMatch(html,/security-center\.js[^\n]*admin-center\.js/);
});

test('Weather hydrates its reserved slot and is excluded from generic control height',()=>{
  const weather=read('assets/weather-widget.js');
  const glass=read('assets/readable-glass.css');
  const weatherCss=read('assets/weather-widget.css');
  assert.match(weather,/hero\.querySelector\('\[data-weather-top-widget\]'\)/);
  assert.match(glass,/:is\(button:not\(\.weather-top-widget\),a\[href\]\)\{/);
  assert.match(weatherCss,/white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});

test('Mate hydrates its reserved Overview slot and loads assistant runtime on demand',()=>{
  const intelligence=read('assets/trip-intelligence.js');
  assert.match(intelligence,/document\.querySelector\('\[data-navo-trip-banner\]'\) \|\| document\.createElement\('aside'\)/);
  assert.match(intelligence,/ensureAssistant\?window\.TravelMateFeatures\.ensureAssistant\(\):Promise\.resolve\(\)/);
});

test('navigation boot no longer performs an unsolicited initial smooth scroll',()=>{
  const navigation=read('assets/navigation-memory.js');
  assert.match(navigation,/function scrollToCurrent\(\)/);
  assert.match(navigation,/updateExitButtons\(\);\s*\}\)\(\);\s*$/);
  assert.doesNotMatch(navigation,/updateExitButtons\(\);\s*scrollToCurrent\(\);\s*\}\)\(\);\s*$/);
});
