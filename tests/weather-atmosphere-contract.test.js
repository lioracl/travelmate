'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'assets', 'weather-widget.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'weather-widget.css'), 'utf8');

function dailyClassifier() {
  const start = js.indexOf('function weatherDetails(');
  const end = js.indexOf('function contextSnapshot(', start);
  assert.ok(start >= 0 && end > start, 'daily Weather presentation must exist before context snapshot');
  const context = {};
  vm.runInNewContext(js.slice(start, end) + '\nthis.daily = dailyWeatherPresentation;', context);
  return context.daily;
}

function classifier() {
  const start = js.indexOf('function weatherAtmosphere(');
  const end = js.indexOf('function contextSnapshot(', start);
  assert.ok(start >= 0 && end > start, 'weather atmosphere classifier must exist before context snapshot');
  const context = {};
  vm.runInNewContext(js.slice(start, end) + '\nthis.classify = weatherAtmosphere;', context);
  return context.classify;
}

test('weather atmosphere maps Open-Meteo current conditions deterministically', () => {
  const classify = classifier();
  assert.equal(classify(0, 1, 22, 22), 'clear-day');
  assert.equal(classify(0, 0, 18, 18), 'clear-night');
  assert.equal(classify(2, 1, 24, 24), 'clouds');
  assert.equal(classify(45, 1, 18, 18), 'fog');
  assert.equal(classify(51, 1, 18, 18), 'rain');
  assert.equal(classify(61, 1, 18, 18), 'rain');
  assert.equal(classify(80, 1, 18, 18), 'rain');
  assert.equal(classify(71, 1, -2, -5), 'snow');
  assert.equal(classify(85, 1, 0, -2), 'snow');
  assert.equal(classify(95, 1, 38, 42), 'storm');
  assert.equal(classify(0, 1, 35, 37), 'heat');
  assert.equal(classify(3, 1, 36, 38), 'heat');
});

test('atmosphere stays inside the existing Weather owner and uses existing forecast fields only', () => {
  const start = js.indexOf('function weatherAtmosphere(');
  const end = js.indexOf('function contextSnapshot(', start);
  const block = js.slice(start, end);
  assert.doesNotMatch(block, /fetch\s*\(|geolocation|supabase|askAi|localStorage/);
  assert.match(js, /data-weather-atmosphere="idle" aria-hidden="true"/);
  assert.match(js, /var currentAtmosphere = weatherAtmosphere\(current\.weather_code, current\.is_day, current\.temperature_2m, current\.apparent_temperature\)/);
  assert.match(js, /ui\.atmosphere\.dataset\.weatherAtmosphere = currentAtmosphere/);
  assert.match(js, /atmosphere: button\.querySelector\('\[data-weather-atmosphere\]'\)/);
});

test('weather atmosphere is decorative, motion-safe and adds no specificity escalation', () => {
  const marker = '/* Dynamic Weather Atmosphere */';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, 'Dynamic Weather Atmosphere CSS block must exist');
  const block = css.slice(start);
  assert.match(block, /\.weather-atmosphere\{[^}]*pointer-events:none/);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)\{[^}]*animation:none;transition:none/);
  assert.match(block, /@media\(prefers-reduced-transparency:reduce\)\{\.weather-atmosphere\{display:none\}\}/);
  assert.match(block, /data-weather-atmosphere="clear-night"/);
  assert.match(block, /data-weather-atmosphere="storm"/);
  assert.match(block, /data-weather-atmosphere="snow"/);
  assert.match(block, /data-weather-atmosphere="fog"/);
  assert.match(block, /--tm-weather-cloud-scale:\.72/);
  assert.match(block, /weather-cloud-drift\{from\{transform:translate3d\(-5px,0,0\) scale\(var\(--tm-weather-cloud-scale\)\)/);
  assert.doesNotMatch(block, /!important/);
});


test('modal reuses current atmosphere and forecast days expose condition accents', () => {
  assert.match(js, /weather-live-scene weather-atmosphere/);
  assert.match(js, /data-weather-atmosphere="' \+ currentAtmosphere/);
  assert.match(js, /data-weather-day="' \+ dayAtmosphere/);
  assert.match(js, /var day = dailyWeatherPresentation\(daily\.weather_code\[index\], daily\.precipitation_probability_max\[index\]/);
});

test('advice names its target day and explains mixed-condition UV peaks', () => {
  assert.match(js, /title: uvDay === 'היום' \? 'UV גבוה היום' : 'UV גבוה ב' \+ uvDay/);
  assert.match(js, /זהו שיא ה־UV היומי הצפוי, גם אם בחלק מהיום התחזית מעוננת או גשומה/);
  assert.match(js, /title: rainDay === 'היום' \? 'גשם צפוי היום' : 'גשם צפוי ב' \+ rainDay/);
  assert.match(js, /title: windDay === 'היום' \? 'רוח חזקה צפויה היום' : 'רוח חזקה צפויה ב' \+ windDay/);
});

test('color pass enriches all atmosphere states without accessibility or specificity debt', () => {
  const marker = '/* Weather Atmosphere Color Pass */';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1);
  const block = css.slice(start);
  for (const state of ['clear-day','heat','clear-night','clouds','rain','storm','snow','fog']) assert.match(block, new RegExp('data-weather-atmosphere="' + state + '"'));
  assert.match(block, /weather-live-scene\.weather-atmosphere/);
  assert.match(block, /data-weather-day="rain"/);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(block, /!important/);
});


test('color and motion pass is visible on the compact card and modal scene', () => {
  assert.match(js, /ui\.button\.dataset\.weatherAtmosphere = currentAtmosphere/);
  const marker = '/* Weather Color & Motion Pass 2 */';
  const block = css.slice(css.indexOf(marker));
  assert.match(block, /weather-top-widget\[data-weather-atmosphere="rain"\]/);
  assert.match(block, /weather-top-widget\[data-weather-atmosphere="clouds"\]/);
  assert.match(block, /weather-live-scene\[data-weather-atmosphere="rain"\]/);
  assert.match(block, /min-height:112px/);
  assert.match(block, /opacity:\.78/);
  assert.match(block, /weather-cloud-drift\{from\{transform:translate3d\(-18px/);
  assert.match(block, /prefers-reduced-motion:reduce/);
  assert.match(block, /prefers-reduced-transparency:reduce/);
  assert.doesNotMatch(block, /!important/);
});


test('low precipitation probability prevents drizzle from dominating daily presentation', () => {
  const daily = dailyClassifier();
  const lowDrizzle = daily(51, 5, 26);
  assert.equal(lowDrizzle.label, '\u05de\u05e2\u05d5\u05e0\u05df \u05d7\u05dc\u05e7\u05d9\u05ea');
  assert.equal(lowDrizzle.icon, 'fa-cloud-sun');
  assert.equal(lowDrizzle.atmosphere, 'clouds');
  const mediumDrizzle = daily(51, 30, 26);
  assert.equal(mediumDrizzle.label, '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05d8\u05e4\u05d8\u05d5\u05e3');
  assert.equal(mediumDrizzle.atmosphere, 'clouds');
  const likelyDrizzle = daily(51, 49, 26);
  assert.equal(likelyDrizzle.label, '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05d8\u05e4\u05d8\u05d5\u05e3');
  assert.equal(likelyDrizzle.atmosphere, 'rain');
  const realDrizzle = daily(51, 60, 26);
  assert.equal(realDrizzle.label, '\u05d8\u05e4\u05d8\u05d5\u05e3');
  assert.equal(realDrizzle.atmosphere, 'rain');
});

test('daily rain codes use probability-aware labels while current conditions stay raw', () => {
  const daily = dailyClassifier();
  assert.equal(daily(61, 6, 25).label, '\u05de\u05e2\u05d5\u05e0\u05df \u05d7\u05dc\u05e7\u05d9\u05ea');
  assert.equal(daily(61, 35, 25).label, '\u05e1\u05d9\u05db\u05d5\u05d9 \u05dc\u05d2\u05e9\u05dd');
  assert.equal(daily(61, 60, 25).label, '\u05d2\u05e9\u05dd');
  assert.match(js, /var details = weatherDetails\(current\.weather_code, current\.is_day\)/);
  assert.match(js, /dailyWeatherPresentation\(daily\.weather_code\[index\], daily\.precipitation_probability_max\[index\]/);
});

test('weather icons are multicolor SVGs owned by Weather', () => {
  assert.match(js, /class="weather-icon-svg"/);
  assert.match(js, /weather-icon__sun/);
  assert.match(js, /weather-icon__cloud/);
  assert.match(js, /weather-icon__rain/);
  assert.match(js, /weatherSvg\(day\.icon\)/);
  const marker = '/* Weather Colorful Icons */';
  const block = css.slice(css.indexOf(marker));
  assert.match(block, /weather-icon__sun{fill:#ffd34e/);
  assert.match(block, /weather-icon__cloud{fill:#d6edf4/);
  assert.match(block, /weather-icon__rain{fill:none;stroke:#168fd4/);
  assert.doesNotMatch(block, /!important/);
});


test('weather daily details open today by default and expose animated per-day data', () => {
  assert.match(js, /var expanded = index === 0/);
  assert.match(js, /data-weather-day-toggle aria-expanded="' \+ String\(expanded\)/);
  assert.match(js, /aria-controls="' \+ detailsId/);
  assert.match(js, /data-weather-day-details' \+ \(expanded \? '' : ' hidden'\)/);
  assert.match(js, /weather-live-day-scene weather-atmosphere/);
  assert.match(js, /daily\.uv_index_max\[index\]/);
  assert.match(js, /daily\.wind_speed_10m_max\[index\]/);
  assert.match(js, /daily\.precipitation_probability_max\[index\]/);
  assert.match(js, /querySelectorAll\('\[data-weather-day-toggle\]'\)/);
  const block = css.slice(css.indexOf('/* Weather Daily Details */'));
  assert.match(block, /weather-live-day-detail-grid/);
  assert.match(block, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(block, /weather-live-day-scene\.weather-atmosphere/);
  assert.match(block, /prefers-reduced-motion:reduce/);
  assert.match(block, /prefers-reduced-transparency:reduce/);
  assert.doesNotMatch(block, /!important/);
});

test('weather Mate action lazy-loads assistant before emitting ask-ai', () => {
  const start = js.indexOf("var aiButton = ui.content.querySelector('[data-weather-ai]')");
  const end = js.indexOf('  function renderError(ui)', start);
  assert.ok(start >= 0 && end > start, 'Weather Mate handler must exist inside render');
  const block = js.slice(start, end);
  assert.match(block, /window\.TravelMateFeatures/);
  assert.match(block, /TravelMateFeatures\.load\('assistant'\)/);
  assert.match(block, /window\.__travelMateAiAssistantLoaded/);
  assert.match(block, /TravelMateEvents\.emit\(window\.TravelMateEvents\.names\.askAi/);
  assert.match(block, /source: 'weather'/);
  assert.ok(block.includes('var forecastSummary = (daily.time || []).map'));
  assert.match(block, /forecastSummary/);
  assert.doesNotMatch(block, /context: context/);
  assert.ok(block.indexOf("TravelMateFeatures.load('assistant')") < block.lastIndexOf('emitToMate()'), 'assistant load path must precede final emit path');
});
