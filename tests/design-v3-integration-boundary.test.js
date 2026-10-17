'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, 'e2e/fixtures/overview-v3.cjs'), 'utf8');

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

