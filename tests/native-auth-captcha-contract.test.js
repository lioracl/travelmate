const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Capacitor localhost renders Turnstile instead of disabling CAPTCHA', () => {
  const security = read('assets/security-center.js');
  assert.doesNotMatch(security, /בדיקת האבטחה זמינה באתר המאובטח ולא בתצוגה המקומית/);
  assert.doesNotMatch(security, /security-captcha-development/);
  assert.match(security, /window\.turnstile\.render/);
  assert.match(security, /'expired-callback': function \(\) \{ if \(active && attempt === generation\) showCaptchaFailure\('expired'\)/);
  assert.match(security, /'error-callback': function \(code\) \{ if \(active && attempt === generation\) showCaptchaFailure\(code\)/);
  assert.match(security, /String\(code \|\| ''\) === '110200'/);
  assert.match(security, /script\.onerror = function/);
});

test('Supabase auth fails closed without a Turnstile token and resets one-shot tokens', () => {
  const cloud = read('assets/cloud-sync.js');
  const security = read('assets/security-center.js');
  assert.match(cloud, /CAPTCHA_REQUIRED/);
  assert.match(cloud, /async function withCaptcha\(action\)/);
  assert.match(cloud, /finally \{ captchaActionPending = false; resetCaptcha\(\); \}/);
  assert.match(cloud, /captchaToken: token/);
  assert.match(security, /if \(captchaController\) captchaController\.restart\(\)/);
});

test('Home login reports a specific security-check failure', () => {
  const home = read('assets/home.js');
  assert.match(home, /CAPTCHA_REQUIRED\|captcha\|verification\.\*failed/);
  assert.match(home, /יש להשלים את בדיקת האבטחה לפני הפעולה/);
});

test('Signup resend also passes a fresh one-shot Turnstile token to Supabase', () => {
  const cloud = read('assets/cloud-sync.js');
  assert.match(cloud, /async function resendSignup\(email, redirectTo\) \{[\s\S]*?return withCaptcha\(function \(token\)/);
  assert.match(cloud, /client\.auth\.resend\(\{ type: 'signup', email: email, options: options \}\)/);
});
