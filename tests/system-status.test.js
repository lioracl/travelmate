const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/about.js', 'utf8');
function load(options = {}) {
  const window = {addEventListener() {}, ...options};
  const document = {readyState: 'loading', addEventListener() {}};
  vm.runInNewContext(source, {window, document});
  return window;
}
test('unstamped browser reports unknown build/channel and no native API', () => {
  const window = load();
  const status = window.TravelMateSystemStatus();
  assert.equal(status.version, window.TravelMateRelease.version);
  assert.equal(status.runtime, 'דפדפן');
  assert.equal(status.sha, null);
  assert.equal(status.channel, null);
  assert.equal(status.nativeApiLevel, null);
});
test('installed PWA uses loaded build and explicit channel; does not expose native API', () => {
  const window = load({matchMedia: () => ({matches: true}), TravelMateWebBuild: {sha: 'a'.repeat(40), channel: 'preview', nativeApiLevel: 1}});
  const status = window.TravelMateSystemStatus();
  assert.equal(status.runtime, 'PWA מותקנת');
  assert.equal(status.sha, 'a'.repeat(40));
  assert.equal(status.channel, 'Preview');
  assert.equal(status.nativeApiLevel, null);
});
test('native shell never fabricates API or shell version', () => {
  const window = load({Capacitor: {isNativePlatform: () => true}, TravelMateWebBuild: {sha: '<invalid>', channel: 'unknown'}});
  let status = window.TravelMateSystemStatus();
  assert.equal(status.runtime, 'מעטפת Native');
  assert.equal(status.sha, null);
  assert.equal(status.nativeApiLevel, null);
  assert.equal(status.shellBuild, undefined);
  window.TravelMateWebBuild = {sha: 'b'.repeat(40), nativeApiLevel: 2};
  assert.equal(window.TravelMateSystemStatus().nativeApiLevel, 2);
  window.TravelMateWebBuild.nativeApiLevel = '2';
  assert.equal(window.TravelMateSystemStatus().nativeApiLevel, null);
});
test('About renders Hebrew diagnostic with escaped runtime cache data', () => {
  let html;
  const window = {addEventListener() {}, TravelMateWebBuild: {sha: 'c'.repeat(40), cacheRevision: '<img onerror="bad">'}};
  const document = {readyState: 'loading', addEventListener(event, fn) {if(event === 'DOMContentLoaded') this.init = fn;},
    querySelector: () => null, body: {insertAdjacentHTML(position, value) {html = value;}}};
  vm.runInNewContext(source, {window, document});
  document.init();
  assert.match(html, /מצב המערכת/);
  assert.match(html, /בניית ווב/);
  assert.match(html, /ערוץ עדכון: לא ידוע/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|רמת API של Native/);
});
