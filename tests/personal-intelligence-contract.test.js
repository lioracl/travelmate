const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const contractPath = 'docs/PERSONAL_TRAVEL_INTELLIGENCE_CONTRACT.md';

test('Personal Travel Intelligence contract defines ownership and data classes', () => {
  const contract = fs.readFileSync(contractPath, 'utf8');

  for (const heading of [
    '## 1. Existing ownership',
    '## 2. Data classes',
    '### A. Observed facts',
    '### B. Declared preferences',
    '### C. Learned inferences',
    '### D. Sensitive/private data',
    '## 3. Profile Center ownership',
    '## 4. Preference contract',
    '## 5. Mate context boundary',
    '## 6. Trip Analytics contract',
    '## 7. Cross-trip learning',
    '## 8. User controls',
    '## 9. Implementation gate'
  ]) {
    assert.match(contract, new RegExp(heading.replace(/[.*+?^$\\{}()|[\]\\]/g, '\\$&')));
  }
});

test('Personal Travel Intelligence contract keeps private sources outside learning', () => {
  const contract = fs.readFileSync(contractPath, 'utf8');

  assert.match(contract, /document contents/);
  assert.match(contract, /credentials/);
  assert.match(contract, /medical\/private notes/);
  assert.match(contract, /must not receive:/);
  assert.match(contract, /raw GPS history/);
  assert.match(contract, /Never label coordinate-derived estimates as measured walking distance/);
});


test('user profile exposes a small normalized declared-preference contract', () => {
  const vm = require('node:vm');
  const source = fs.readFileSync('assets/user-profile.js', 'utf8');
  const sandbox = {
    URL,
    Date,
    Object,
    String,
    Array,
    window: {
      dispatchEvent() {}
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    location: { href: 'https://example.test/' }
  };
  vm.runInNewContext(source, sandbox, { filename: 'assets/user-profile.js' });

  const profile = sandbox.window.TravelMateUserProfile.fromUser({
    email: 'traveler@example.com',
    user_metadata: {
      display_name: 'Traveler',
      travelmate_preferences: {
        pace: 'active',
        activityDensity: 'dense',
        transport: 'transit',
        tripStyle: 'culture',
        interests: ['culture', 'food', 'invalid', 'food']
      }
    }
  });

  assert.equal(profile.firstName, 'Traveler');
  assert.deepEqual(JSON.parse(JSON.stringify(profile.preferences)), {
    pace: 'active',
    activityDensity: 'dense',
    transport: 'transit',
    tripStyle: 'culture',
    interests: ['culture', 'food']
  });
});


test('Mate context consumes declared preferences without converting them into learned inference', () => {
  const source = fs.readFileSync('assets/trip-intelligence.js', 'utf8');

  assert.match(source, /declaredPreferences/);
  assert.match(source, /declaredPreferenceLines/);
  assert.match(source, /העדפות אישיות שהמשתמש הצהיר עליהן/);
  assert.match(source, /התייחס להעדפות האישיות כהעדפות מוצהרות של המשתמש, לא כהסקה/);
  assert.match(source, /context\.declaredPreferences/);
  assert.doesNotMatch(source, /learnedPreferences\s*=\s*declaredPreferences/);
});

test('Mate auth refresh reads the session user instead of inventing a second identity source', () => {
  const source = fs.readFileSync('assets/trip-intelligence.js', 'utf8');

  assert.match(source, /service\.getSession\(\)/);
  assert.match(source, /TravelMateCloud\.onAuthChange/);
  assert.match(source, /function \(event, session\)/);
  assert.match(source, /TravelMateUserProfile\.fromUser/);
});
