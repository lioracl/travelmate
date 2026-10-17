'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, 'e2e/fixtures/overview-v3.cjs'), 'utf8');

const sixScreenSpec = fs.readFileSync(path.join(__dirname, 'e2e/design-v3-six-screen.spec.js'), 'utf8');
test('six-screen saved Places control distinguishes button identity from panel state', () => {
  // nearby.js puts data-places-view on both the panel and its view buttons.
  // Require the canonical navigation button; never select by mutable state
  // alone or silently choose one match. Real DOM verification remains in CI.
  const declaration = /const savedPlacesView = page\.locator\('([^']+)'\);/.exec(sixScreenSpec);
  assert.ok(declaration, 'A reusable canonical saved-view button locator is required');
  assert.equal(declaration[1], '#places [data-nearby-places] .places-v3-views button[data-places-view="saved"]');
  assert.doesNotMatch(sixScreenSpec, /page\.locator\('\[data-places-view="saved"\]'\)/);
  assert.doesNotMatch(sixScreenSpec, /savedPlacesView\.(?:first|nth|last)\(/);
});

test('saved Places selection and restoration each require one visible pressed button', () => {
  const blocks = sixScreenSpec.split("await navigate(page, 'places');").slice(1);
  assert.equal(blocks.length, 2, 'Check initial selection and later restoration');
  for (const block of blocks) {
    const end = block.indexOf('await unchanged(baseline);');
    assert.ok(end >= 0);
    const checks = block.slice(0, end);
    assert.match(checks, /await expect\(savedPlacesView\)\.toHaveCount\(1\);/);
    assert.match(checks, /await expect\(savedPlacesView\)\.toBeVisible\(\);/);
    assert.match(checks, /await expect\(savedPlacesView\)\.toHaveAttribute\('aria-pressed', 'true'\);/);
  }
  assert.match(blocks[0], /await savedPlacesView\.click\(\);/);
});

// Exercise the real MATE owner assertions, stopping before browser lifecycle
// actions. This boundary regression does not substitute for real DOM coverage.
const sixScreenCode = fs.readFileSync(path.join(__dirname, 'e2e/fixtures/six-screen-v3.cjs'), 'utf8');
async function checkMateOwners(owners) {
  const reachedLifecycle = new Error('Owner checks passed; real DOM lifecycle still required');
  const sandbox = {
    module: { exports: {} },
    require(name) {
      if (name !== '@playwright/test') return {};
      return { expect(actual) {
        return {
          async toHaveCount(count) { assert.equal(count, 1); },
          async toBeVisible() {},
          toHaveLength(length) { assert.equal(actual.length, length); },
          toBe(expected) { assert.equal(actual, expected); },
          toContain(fragment) { assert.ok(actual.includes(fragment), JSON.stringify(actual) + ' must contain ' + fragment); }
        };
      } };
    }
  };
  vm.runInNewContext(sixScreenCode, sandbox);
  const page = {
    async evaluate() { return owners; },
    locator() { return { async all() { throw reachedLifecycle; } }; }
  };
  return { run: () => sandbox.module.exports.mate(page, {}, 'overview', 390), reachedLifecycle };
}

for (const combinator of ['>', ' > ', '> ', ' >', '\t>\n']) {
  test('MATE owner accepts equivalent direct-child CSSOM spacing: ' + JSON.stringify(combinator), async () => {
    const selector = 'html body.tm-new-design[data-design="v3"]:not(.ai-assistant-open):not(.ai-keyboard-open) .tm-trip-dock .tm-trip-dock-mate' + combinator + '.ai-orb';
    const check = await checkMateOwners([selector]);
    await assert.rejects(check.run(), error => error === check.reachedLifecycle);
  });
}

for (const selector of [
  '.tm-trip-dock-mate .ai-orb',
  '.tm-trip-dock-mate + .ai-orb',
  '.tm-trip-dock-mate ~ .ai-orb',
  '.ai-orb > .tm-trip-dock-mate',
  '.tm-trip-dock > .ai-orb',
  '.tm-trip-dock-mate > .wrapper .ai-orb',
  '.tm-trip-dock-mate > .wrapper > .ai-orb',
  '.tm-trip-dock-mate-extra>.ai-orb',
  '.tm-trip-dock-mate>.ai-orb-extra',
  '[data-selector=".tm-trip-dock-mate>.ai-orb"]',
  '/* .tm-trip-dock-mate>.ai-orb */ .ai-orb',
  'html body.tm-new-design[data-design="v3"]:not(.ai-assistant-open):not(.ai-keyboard-open) .tm-trip-dock [data-selector=".tm-trip-dock-mate>.ai-orb"]',
  'html body.tm-new-design[data-design="v3"]:not(.ai-assistant-open):not(.ai-keyboard-open) .tm-trip-dock .tm-trip-dock-mate>.ai-orb-extra'
]) {
  test('MATE owner rejects wrong selector: ' + selector, async () => {
    const check = await checkMateOwners([selector]);
    await assert.rejects(check.run(), { name: 'AssertionError' });
  });
}

for (const owners of [[], ['.tm-trip-dock-mate>.ai-orb', '.tm-trip-dock-mate > .ai-orb']]) {
  test('MATE requires exactly one display owner: ' + owners.length, async () => {
    const check = await checkMateOwners(owners);
    await assert.rejects(check.run(), { name: 'AssertionError' });
  });
}

function load(port) {
  const sandbox = {
    module: { exports: {} }, process: { env: { TRAVELMATE_V3_TEST_PORT: port } },
    require(name) {
      assert.equal(name, '@playwright/test');
      return { expect() { return { async toHaveClass() {} }; } };
    }
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}
async function capture(fixture, preserveTrip = false) {
  const scripts = [], routes = [], navigation = [];
  const page = {
    clock: { async setFixedTime(date) { assert.equal(date.toISOString(), '2026-10-17T07:30:00.000Z'); } },
    async addInitScript(fn, data) { scripts.push({ fn, data }); },
    async route(pattern, handler) { routes.push({ pattern, handler }); },
    async goto(url) { navigation.push(url); },
    async waitForFunction() {}, locator() { return {}; }
  };
  await fixture.open(page, { preserveTrip });
  return { scripts, routes, navigation };
}
function seed(script, origin, initial = null) {
  const items = new Map();
  if (initial != null) items.set('travelmate-trips', initial);
  const sandbox = {
    location: { origin },
    localStorage: { getItem(k) { return items.get(k) || null; }, setItem(k, value) { items.set(k, value); } },
    data: script.data
  };
  vm.runInNewContext('(' + script.fn.toString() + ')(data)', sandbox);
  return items;
}

for (const port of ['4173', '4174', '4175', undefined, '', '4176', '4174.evil.invalid', '443']) {
  test('Overview fixture confines navigation to supported loopback ports: ' + String(port), async () => {
    const fixture = load(port), allowed = ['4174', '4175'].includes(port) ? port : '4173';
    assert.equal(fixture.previewOrigin, 'http://127.0.0.1:' + allowed);
    const calls = await capture(fixture);
    assert.equal(calls.navigation.length, 1);
    const url = new URL(calls.navigation[0]);
    assert.equal(url.origin, fixture.previewOrigin);
    assert.equal(url.pathname, '/trip/custom/index.html');
    assert.equal(url.searchParams.get('id'), fixture.trip.id);
    assert.equal(url.searchParams.get('view'), 'overview');
    assert.equal(calls.scripts.length, 1);
    const own = seed(calls.scripts[0], fixture.previewOrigin);
    assert.equal(JSON.parse(own.get('travelmate-trips'))[0].id, fixture.trip.id);
    for (const foreign of ['https://127.0.0.1:' + allowed, 'http://localhost:' + allowed, 'http://127.0.0.1:4176', 'https://example.invalid']) {
      assert.equal(seed(calls.scripts[0], foreign).size, 0, foreign + ' must receive no fixture data');
    }
    const supabase = calls.routes.find(route => route.pattern === '**/*supabase.co/**');
    assert.ok(supabase, 'Existing Supabase abort remains installed');
    let aborted = 0;
    await supabase.handler({ abort() { aborted++; } });
    assert.equal(aborted, 1);
  });
}

for (const port of ['4173', '4174', '4175']) {
  test('preserveTrip retains prior canonical test records on reload at port ' + port, async () => {
    const fixture = load(port), calls = await capture(fixture, true);
    const prior = JSON.stringify([{ id: 'synthetic-persisted', activities: [{ id: 'retained' }] }]);
    assert.equal(seed(calls.scripts[0], fixture.previewOrigin, prior).get('travelmate-trips'), prior);
    const empty = seed(calls.scripts[0], fixture.previewOrigin);
    assert.equal(JSON.parse(empty.get('travelmate-trips'))[0].id, fixture.trip.id);
    const foreign = seed(calls.scripts[0], 'https://example.invalid', prior);
    assert.equal(foreign.size, 1);
    assert.equal(foreign.get('travelmate-trips'), prior);
  });
}
