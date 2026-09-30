'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadProfileApi() {
  const window = { dispatchEvent() {} };
  const sandbox = {
    window,
    URL,
    Date,
    Object,
    Number,
    String,
    Array,
    Math,
    location: { href: 'https://example.test/' },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
  };
  vm.runInNewContext(read('assets/user-profile.js'), sandbox);
  return window.TravelMateUserProfile;
}

test('Profile Lite derives display name, initials, avatar and time-aware greeting from auth metadata', () => {
  const api = loadProfileApi();
  const morning = new Date('2026-09-30T08:30:00');
  const profile = api.fromUser({
    email: 'lior.acla@example.com',
    user_metadata: { display_name: 'ליאור אחלאו', avatar_url: 'https://example.test/avatar.jpg' }
  }, morning);

  assert.equal(profile.name, 'ליאור אחלאו');
  assert.equal(profile.firstName, 'ליאור');
  assert.equal(profile.initials, 'לא');
  assert.equal(profile.greeting, 'בוקר טוב');
  assert.equal(profile.avatarUrl, 'https://example.test/avatar.jpg');
});

test('Profile Lite falls back to the email name and blocks unsafe avatar protocols', () => {
  const api = loadProfileApi();
  const profile = api.fromUser({
    email: 'lior.acla@example.com',
    user_metadata: { avatar_url: 'javascript:alert(1)' }
  }, new Date('2026-09-30T19:00:00'));

  assert.equal(profile.name, 'lior acla');
  assert.equal(profile.firstName, 'lior');
  assert.equal(profile.initials, 'LA');
  assert.equal(profile.greeting, 'ערב טוב');
  assert.equal(profile.avatarUrl, '');
});

test('Adaptive Home selects current, upcoming and recent trips deterministically', () => {
  const api = loadProfileApi();
  const now = new Date('2026-09-30T12:00:00');

  const current = api.selectHomeContext([
    { id: 'current', city: 'Prague', start: '2026-09-28', end: '2026-10-03' },
    { id: 'future', city: 'Rome', start: '2026-10-10', end: '2026-10-13' }
  ], now);
  assert.equal(current.type, 'current');
  assert.equal(current.trip.id, 'current');
  assert.equal(current.daysRemaining, 3);

  const upcoming = api.selectHomeContext([
    { id: 'later', city: 'Rome', start: '2026-10-15', end: '2026-10-18' },
    { id: 'soon', city: 'Athens', start: '2026-10-03', end: '2026-10-06' }
  ], now);
  assert.equal(upcoming.type, 'upcoming');
  assert.equal(upcoming.trip.id, 'soon');
  assert.equal(upcoming.daysUntil, 3);

  const recent = api.selectHomeContext([
    { id: 'old', city: 'Tokyo', start: '2026-08-01', end: '2026-08-05' },
    { id: 'recent', city: 'Berlin', start: '2026-09-20', end: '2026-09-27' }
  ], now);
  assert.equal(recent.type, 'recent');
  assert.equal(recent.trip.id, 'recent');
  assert.equal(recent.daysAgo, 3);
});

test('Home exposes one profile summary and reuses the existing account/profile owner', () => {
  const html = read('index.html');
  const home = read('assets/home.js');
  const app = read('assets/app.js');
  const sw = read('sw.js');
  const css = read('assets/home-organizer.css');
  const settings = read('assets/security-center.js');
  const settingsCss = read('assets/security-center.css');

  assert.match(html, /data-home-personal-summary/);
  assert.match(html, /data-home-greeting/);
  assert.match(html, /data-home-context/);
  assert.match(html, /data-home-context-action/);
  assert.match(html, /data-user-avatar/);
  assert.match(home, /window\.TravelMateUserProfile/);
  assert.match(home, /renderAdaptiveHome/);
  assert.match(home, /data-cloud-profile-form/);
  assert.match(app, /user-profile\.js/);
  assert.match(app, /learned-preferences\.js/);
  assert.match(sw, /\.\/assets\/user-profile\.js/);
  assert.match(settings, /data-security-profile/);
  assert.match(settings, /data-security-profile-form/);
  assert.match(settings, /cloud\.updateProfile\(displayName,\s*preferences\)/);
  assert.match(settings, /travelmate:profile-change/);

  const featureCss = css.slice(css.indexOf('/* 2.1 Profile Lite + Adaptive Home'));
  assert.ok(featureCss.length > 0);
  assert.doesNotMatch(featureCss, /!important/);
  const profileSettingsCss = settingsCss.slice(settingsCss.indexOf('/* 2.1 Profile Lite settings'));
  assert.ok(profileSettingsCss.length > 0);
  assert.doesNotMatch(profileSettingsCss, /!important/);
});
