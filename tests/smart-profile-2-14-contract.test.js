'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = file => fs.readFileSync(file, 'utf8');

function profileApi() {
  const window = { dispatchEvent() {} };
  vm.runInNewContext(read('assets/user-profile.js'), {
    window, URL, Date, Object, Number, String, Array, Math,
    location: { href: 'https://travelmate.test/' },
    CustomEvent: function CustomEvent() {}
  });
  return window.TravelMateUserProfile;
}

test('learning consent is explicit opt-in and preserves explicit true and false', () => {
  const api = profileApi();
  assert.equal(api.normalizePreferences({}).learningEnabled, false);
  assert.equal(api.normalizePreferences({ learningEnabled: false }).learningEnabled, false);
  assert.equal(api.normalizePreferences({ learningEnabled: true }).learningEnabled, true);
  assert.equal(api.normalizePreferences({ learningEnabled: 'true' }).learningEnabled, false);
});

test('canonical labels and completion summary cap unique interests at six', () => {
  const api = profileApi();
  const preferences = api.normalizePreferences({
    pace: 'relaxed', activityDensity: 'dense', transport: 'transit', tripStyle: 'culture',
    interests: ['culture', 'food', 'nature', 'history', 'shopping', 'nightlife', 'photography', 'culture']
  });
  const summary = api.preferenceSummary(preferences);
  assert.deepEqual(Array.from(preferences.interests), ['culture', 'food', 'nature', 'history', 'shopping', 'nightlife']);
  assert.equal(api.preferenceLabels.transport.transit, 'תחבורה ציבורית');
  assert.equal(summary.configuredCount, 5);
  assert.equal(summary.totalGroups, 5);
  assert.equal(summary.isComplete, true);
  assert.match(summary.completionLabel, /כל קבוצות ההעדפה/);
  assert.match(summary.items.find(item => item.key === 'interests').valueLabel, /תרבות/);
});

test('Home and Security expose summaries and delegate editing to one wizard contract', () => {
  const home = read('assets/home.js');
  const security = read('assets/security-center.js');
  assert.match(home, /data-smart-profile-completion/);
  assert.match(home, /data-profile-wizard-open/);
  assert.match(home, /legacyProfileForm\.remove\(\)/);
  assert.doesNotMatch(home, /profileForm\.addEventListener\('submit'/);
  assert.match(security, /data-security-declared-summary/);
  assert.match(security, /data-profile-wizard-open/);
  assert.doesNotMatch(security, /data-security-profile-form|name="pace"|name="learningEnabled"/);
  assert.doesNotMatch(security, /cloud\.updateProfile\(/);
});

test('profile-change events from a stale account are ignored on both profile surfaces', () => {
  const home = read('assets/home.js');
  const security = read('assets/security-center.js');
  assert.match(home, /String\(event\.detail\.user\.id\) !== String\(currentSession\.user\.id\)\) return/);
  assert.match(security, /String\(changed\.id\) !== String\(currentSession\.user\.id\)\) return/);
});

test('Mate runtime consumes declared preferences only and leaves learned suggestions for 2.15', () => {
  const app = read('assets/app.js');
  const intelligence = read('assets/trip-intelligence.js');
  assert.doesNotMatch(app, /learned-preferences\.js/);
  assert.match(intelligence, /declaredPreferences/);
  assert.match(intelligence, /preferenceSummary\(preferences\)/);
  assert.doesNotMatch(intelligence, /TravelMateLearnedPreferences|learnedPreferences/);
  assert.match(intelligence, /לא כהסקה/);
});

test('390 and 430px RTL light-dark geometry remains bounded without important growth', () => {
  const html = read('index.html');
  const wizardCss = read('assets/profile-wizard.css');
  const accountCss = read('assets/cloud-sync.css');
  const securityCss = read('assets/security-center.css');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(wizardCss, /direction:rtl/);
  assert.match(wizardCss, /@media\(max-width:520px\)/);
  assert.match(wizardCss, /width:min\(680px,100%\)/);
  assert.match(accountCss, /@media\(max-width:560px\)/);
  assert.match(accountCss, /grid-template-columns:60px minmax\(0,1fr\)/);
  assert.match(securityCss, /width:min\(680px,100%\)/);
  assert.match(securityCss, /html\[data-theme="dark"\]/);
  assert.equal((wizardCss.match(/!important/g) || []).length, 0);
  assert.equal((accountCss.match(/!important/g) || []).length, 1);
  assert.equal((securityCss.match(/!important/g) || []).length, 3);
});
