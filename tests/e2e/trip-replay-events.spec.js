'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.resolve(__dirname, '../../assets', name), 'utf8');

async function mount(page, { lateContract = false } = {}) {
  // Synthetic page and in-memory persistence only. No accounts, server, CDN,
  // GPS or persistent browser storage are involved in these browser tests.
  await page.route('**/*', route => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><section id="memories"></section></body></html>' })
    : route.abort());
  await page.goto('/trip/custom/?id=replay-synthetic');
  await page.evaluate(() => {
    const trip = { id: 'replay-synthetic', ownerId: 'collaborative-owner', activities: [], expenses: [],
      savedPlaces: [{ id: 'p1', name: 'Old idea', done: false }],
      memories: [{ date: '2026-10-01', note: 'PRIVATE_SYNTHETIC_NOTE' }] };
    const data = new Map([['travelmate-trips', JSON.stringify([trip])], ['travelmate-active-user', 'account-A']]);
    const writes = [];
    const storage = { getItem: key => data.get(key) ?? null, setItem: (...args) => writes.push(['setItem', ...args]),
      removeItem: (...args) => writes.push(['removeItem', ...args]), clear: () => writes.push(['clear']) };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage });
    window.__replayFixture = { trip, data, writes, maps: [] };
  });
  if (!lateContract) await page.addScriptTag({ content: source('event-contracts.js') });
  for (const name of ['trip-store.js', 'trip-context.js', 'trip-analytics.js', 'trip-replay.js']) await page.addScriptTag({ content: source(name) });
  await expect(page.locator('[data-trip-replay]')).toHaveCount(1);
  await expect(page.locator('[data-trip-replay-timeline]')).toContainText('PRIVATE_SYNTHETIC_NOTE');
  if (lateContract) await page.addScriptTag({ content: source('event-contracts.js') });
}
async function updateCanonical(page, emit = true) {
  await page.evaluate(shouldEmit => {
    const f = window.__replayFixture;
    f.trip.savedPlaces = [
      { id: 'p1', name: 'Fresh canonical visit', date: '2026-10-01', done: true, lat: 50.08, lon: 14.42 },
      { id: 'p2', name: 'Second visit', date: '2026-10-01', done: true, lat: 50.09, lon: 14.43 },
      { id: 'p3', name: 'Planned only', date: '2026-10-01', done: false }
    ];
    f.data.set('travelmate-trips', JSON.stringify([f.trip]));
    if (shouldEmit) window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated, { tripId: f.trip.id });
  }, emit);
}
for (const lateContract of [false, true]) test(`canonical places event refreshes once with ${lateContract ? 'document fallback' : 'canonical subscription'}`, async ({ page }) => {
  await mount(page, { lateContract });
  await page.addScriptTag({ content: source('trip-replay.js') });
  await page.evaluate(() => {
    for (const view of ['memories', 'summary', 'memories']) window.dispatchEvent(new CustomEvent('travelmate:feature-ready', { detail: { view } }));
    const f = window.__replayFixture; f.refreshes = 0; f.documentEvents = 0; f.windowEvents = 0;
    new MutationObserver(records => { f.refreshes += records.length; }).observe(document.querySelector('[data-trip-replay-summary]'), { childList: true });
    document.addEventListener('travelmate:places-updated', event => { f.documentEvents++; f.bubbles = event.bubbles; });
    window.addEventListener('travelmate:places-updated', () => f.windowEvents++);
  });
  await updateCanonical(page, false);
  await page.evaluate(() => window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated, { tripId: 'unrelated' }));
  expect(await page.evaluate(() => window.__replayFixture.refreshes)).toBe(0);
  await page.evaluate(() => window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated, { tripId: 'replay-synthetic' }));
  await expect(page.locator('[data-trip-replay-timeline]')).toContainText('Fresh canonical visit');
  await expect(page.locator('[data-trip-replay-timeline]')).not.toContainText('Planned only');
  await expect(page.locator('[data-trip-replay]')).toHaveCount(1);
  const observed = await page.evaluate(() => {
    const f = window.__replayFixture;
    return { refreshes: f.refreshes, documentEvents: f.documentEvents, windowEvents: f.windowEvents, bubbles: f.bubbles,
      writes: f.writes, sameData: f.data.get('travelmate-trips') === JSON.stringify([f.trip]), mapScripts: document.querySelectorAll('script[src*="maplibre"]').length };
  });
  expect(observed).toEqual({ refreshes: 1, documentEvents: 2, windowEvents: 0, bubbles: false, writes: [], sameData: true, mapScripts: 0 });
});
test('account switch blocks a delayed map library and all stale render triggers', async ({ page }) => {
  await mount(page); await updateCanonical(page);
  await page.evaluate(() => {
    const append = document.head.appendChild.bind(document.head), f = window.__replayFixture;
    document.head.appendChild = node => {
      if (node.tagName === 'SCRIPT' && node.src.includes('maplibre-gl')) { f.pendingScript = node; return node; }
      if (node.tagName === 'LINK' && node.href.includes('maplibre-gl')) return node;
      return append(node);
    };
  });
  await page.locator('[data-trip-summary-map-toggle]').click();
  expect(await page.evaluate(() => !!window.__replayFixture.pendingScript)).toBe(true);
  await page.evaluate(async () => {
    const f = window.__replayFixture;
    f.data.set('travelmate-active-user', 'account-B');
    // Even a new account with the same collaborative owner must retire this
    // page while app.js performs its existing account navigation.
    window.dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { userId: 'account-B', trips: [f.trip] } }));
    window.maplibregl = { Map: class { constructor() { f.maps.push('stale'); } } };
    f.pendingScript.onload(); await Promise.resolve();
    window.TravelMateEvents.emit(window.TravelMateEvents.names.placesUpdated, { tripId: f.trip.id });
    document.dispatchEvent(new CustomEvent('travelmate:planner-rendered'));
    window.dispatchEvent(new CustomEvent('travelmate:feature-ready', { detail: { view: 'memories' } }));
    window.TravelMateTripReplay.render();
  });
  await page.addScriptTag({ content: source('trip-replay.js') });
  await expect(page.locator('[data-trip-replay]')).toHaveCount(0);
  await expect(page.locator('#memories')).not.toContainText('PRIVATE_SYNTHETIC_NOTE');
  expect(await page.evaluate(() => ({ maps: window.__replayFixture.maps, writes: window.__replayFixture.writes }))).toEqual({ maps: [], writes: [] });
});
