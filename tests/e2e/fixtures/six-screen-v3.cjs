'use strict';
const { expect } = require('@playwright/test');
const { assessSolidContrast } = require('../../helpers/contrast-solid.cjs');
const { open, trips } = require('./all-trips-v3.cjs');
const { record: planRecord } = require('./plan-v3.cjs');
const { record: placesRecord, pois } = require('./places-v3.cjs');
const OWNER = 'alltrips-A', ID = 'alltrips-rome';

async function boot(page, context, theme) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname.includes('overpass')) return route.fulfill({ json: { elements: pois } });
    if (url.hostname.includes('nominatim')) return route.fulfill({ json: [{ lat: '41.8902', lon: '12.4922', display_name: 'Synthetic Rome' }] });
    return route.abort();
  });
  await page.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:4173') return;
    localStorage.setItem('travelmate-eur-rates:EUR', JSON.stringify({
      rate: 3.7, rates: { EUR: 1, ILS: 3.7 }, ilsRates: { EUR: 3.7, ILS: 1 },
      date: '2026-10-17T07:30:00Z', savedAt: new Date('2026-10-17T07:30:00Z').getTime(),
      source: 'Synthetic six-screen QA', sourceUrl: 'https://example.invalid'
    }));
    // Same controlled MapLibre boundary as the pinned Places fixture. No real
    // GPS, map provider, production identity, or canonical application API.
    class MapMock {
      constructor(options) { this.container = options.container; this.zoom = options.zoom; this.center = { lat: options.center[1], lng: options.center[0] }; this.events = {}; this.container.dataset.controlledMap = 'true'; }
      addControl() {}
      on(event, fn) { (this.events[event] || (this.events[event] = [])).push(fn); if (event === 'style.load') queueMicrotask(fn); return this; }
      getStyle() { return { layers: [] }; }
      setLayoutProperty() {} resize() {}
      easeTo(options) { this.center = { lat: options.center[1], lng: options.center[0] }; this.zoom = options.zoom || this.zoom; }
      getZoom() { return this.zoom; } getCenter() { return this.center; }
      getBounds() { return { getSouth: () => 41.88, getNorth: () => 41.90, getWest: () => 12.48, getEast: () => 12.50 }; }
    }
    class MarkerMock {
      constructor(options) { this.element = options.element; }
      setLngLat() { return this; }
      addTo(map) { if (this.element) map.container.appendChild(this.element); return this; }
      remove() { if (this.element) this.element.remove(); }
    }
    window.maplibregl = { Map: MapMock, Marker: MarkerMock, NavigationControl: class {}, AttributionControl: class {}, getRTLTextPluginStatus: () => 'loaded', setRTLTextPlugin() {} };
  });
  const records = structuredClone(trips);
  Object.assign(records[0], {
    start: planRecord.start, end: planRecord.end, days: planRecord.days,
    activities: structuredClone(planRecord.activities),
    dayNotes: structuredClone(planRecord.dayNotes),
    savedPlaces: structuredClone(placesRecord.savedPlaces)
  });
  await open(page, { theme, records });
}

async function documents(page) {
  await expect(page.locator('script[src*="document-vault.js"]')).toHaveCount(0);
  await page.evaluate(({ owner, trip }) => {
    const client = window.__travelMateSupabaseClient, original = client.from;
    const row = (id, group, user = owner, tripId = trip) => ({
      id, category: group, file_name: 'Synthetic ' + group + ' metadata.txt', note: 'Synthetic integration record',
      user_id: user, trip_id: tripId, storage_path: user + '/' + tripId + '/' + id + '.vault',
      mime_type: 'text/plain', file_size: 20, created_at: '2026-10-17T07:00:00Z', encrypted: true
    });
    const qa = window.sixScreenQA = {
      requests: [], downloads: [], rows: [row('six-flight', 'flights'), row('six-lodging', 'lodging'), row('foreign-owner', 'flights', 'alltrips-B'), row('foreign-trip', 'flights', owner, 'alltrips-tokyo')],
      cloud: window.TravelMateCloud, store: window.TravelMateTripStore, auth: client.auth,
      getTrip: window.TravelMateTripStore.getTrip, getClient: window.TravelMateCloud.getClient
    };
    client.from = function (table, ...args) {
      if (table !== 'travel_documents') return original.call(this, table, ...args);
      const filters = [];
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
        then(resolve, reject) {
          const data = qa.rows.filter(record => filters.every(([key, value]) => record[key] === value));
          qa.requests.push({ table, filters: filters.map(pair => pair.slice()), ids: data.map(record => record.id) });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
      };
      return query;
    };
    client.storage = { from() { return { async download(path) { qa.downloads.push(path); throw new Error('Unexpected document download'); } }; } };
  }, { owner: OWNER, trip: ID });
}

async function canonical(page) {
  return page.evaluate(({ id, owner }) => {
    const cloudTrip = TravelMateCloud.getCachedTrips().find(t => t.id === id && t.ownerId === owner);
    if (!cloudTrip) throw new Error('Canonical identity missing');
    const trip = window.TravelMateTripStore ? TravelMateTripStore.getTrip(id, owner) : cloudTrip;
    if (!trip || trip.ownerId !== owner) throw new Error('Canonical owner changed');
    return {
      id: trip.id, ownerId: trip.ownerId, start: trip.start, end: trip.end, budgetCurrency: trip.budgetCurrency,
      activities: (trip.activities || []).map(a => ({ id: a.id, title: a.title, date: a.date, time: a.time, done: Boolean(a.done) })),
      savedPlaces: (trip.savedPlaces || []).map(p => ({ id: p.id, name: p.name, date: p.date || '', time: p.time || '' })),
      expenses: trip.expenses || []
    };
  }, { id: ID, owner: OWNER });
}

async function navigate(page, view) {
  if (['overview', 'plan', 'places'].includes(view)) await page.locator('[data-shell-view="' + view + '"]').click();
  else {
    await page.locator('[data-shell-more]').click();
    const drawer = page.locator('.workspace > .sidebar:visible');
    await expect(drawer).toBeVisible();
    await drawer.locator('[data-view="' + view + '"]').click();
    await expect(drawer).toBeHidden();
  }
  await expect(page.locator('body')).toHaveAttribute('data-trip-view', view);
}

async function capture(page, testInfo, label) {
  const rectangles = await page.locator('.tm-trip-dock,.mobile-header,.mobile-bottom-nav,.trip-bottom-nav,[data-mobile-toolbar],.ai-orb').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return { className: node.className, rect: rect.toJSON(), display: style.display, visibility: style.visibility, viewport: { width: innerWidth, height: innerHeight }, intersectsViewport: rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight };
  }));
  await testInfo.attach(label + '-rectangles', { body: Buffer.from(JSON.stringify(rectangles, null, 2)), contentType: 'application/json' });
  const file = testInfo.outputPath(label + '.png');
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(label, { path: file, contentType: 'image/png' });
}

async function layout(page, theme) {
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

// Supported gate: solid source-over surfaces only. Every captured gradient,
// filter, opacity group, or unproven pseudo paint is explicitly NOT VERIFIED.
// The real mobile body::after canvas is captured in its proven negative-z
// position inside the isolated body; it is never omitted from the paint stack.
async function readability(page, testInfo, label, selectors) {
  const evidence = [];
  for (const selector of selectors) {
    const nodes = page.locator(selector);
    expect(await nodes.count(), selector).toBeGreaterThan(0);
    for (const node of await nodes.all()) {
      await expect(node).toBeVisible();
      const snapshot = await node.evaluate(element => {
        function color(value) {
          if (value === 'transparent') return [0, 0, 0, 0];
          let m = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
          if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])];
          m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(value);
          return m ? [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] == null ? 1 : Number(m[4])] : null;
        }
        function layer(style, name) {
          return {
            label: name, background: color(style.backgroundColor), opacity: style.opacity,
            backgroundImage: style.backgroundImage, filter: style.filter,
            backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
            maskImage: style.maskImage || style.webkitMaskImage || 'none', clipPath: style.clipPath,
            mixBlendMode: style.mixBlendMode, backgroundBlendMode: style.backgroundBlendMode,
            backgroundClip: style.backgroundClip, textShadow: style.textShadow, boxShadow: style.boxShadow
          };
        }
        const ancestors = []; for (let n = element; n; n = n.parentElement) ancestors.unshift(n);
        const layers = [], pseudoEvidence = [];
        for (const ancestor of ancestors) {
          const style = getComputedStyle(ancestor), name = ancestor.tagName + (ancestor.id ? '#' + ancestor.id : '');
          const surface = layer(style, name);
          if (ancestor !== document.body && ancestor !== document.documentElement && Number(style.zIndex) < 0) surface.issue = 'negative-z ancestor paint order is unsupported';
          layers.push(surface);
          for (const pseudo of ['::before', '::after']) {
            const ps = getComputedStyle(ancestor, pseudo);
            const exists = ps.content !== 'none' && ps.content !== 'normal' && ps.display !== 'none' && ps.visibility !== 'hidden' && ps.visibility !== 'collapse';
            const bg = color(ps.backgroundColor);
            const borders = ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(ps['border' + side + 'Width']) > 0 && ps['border' + side + 'Style'] !== 'none');
            const hasText = ps.content !== '""' && ps.content !== "''" && ps.content !== 'none' && ps.content !== 'normal';
            const paints = exists && (hasText || !bg || bg[3] > 0 || ps.backgroundImage !== 'none' || borders || ps.boxShadow !== 'none' || ps.filter !== 'none' || (ps.backdropFilter && ps.backdropFilter !== 'none'));
            if (!paints) {
              pseudoEvidence.push({ label: name + pseudo, painted: false, proof: !exists ? 'not generated/displayed' : 'empty content, transparent background, no image/border/shadow/filter' });
              continue;
            }
            const canvas = ancestor === document.body && pseudo === '::after' &&
              !hasText && style.isolation === 'isolate' && ps.position === 'fixed' && ps.zIndex === '-1' &&
              style.transform === 'none' && ps.transform === 'none' && !borders &&
              parseFloat(ps.left) <= 0 && parseFloat(ps.top) <= 0 &&
              parseFloat(ps.left) + parseFloat(ps.width) >= innerWidth &&
              parseFloat(ps.top) + parseFloat(ps.height) >= innerHeight;
            const paint = { ...layer(ps, name + pseudo), pseudo: true, mobileCanvasProven: canvas };
            layers.push(paint);
            pseudoEvidence.push({ ...paint, painted: true, position: ps.position, zIndex: ps.zIndex, bodyIsolation: style.isolation, top: ps.top, left: ps.left, width: ps.width, height: ps.height });
          }
        }
        const style = getComputedStyle(element);
        const foreground = style.webkitTextFillColor && style.webkitTextFillColor !== 'currentcolor' ? style.webkitTextFillColor : style.color;
        return { text: element.textContent.trim(), foreground: color(foreground), foregroundCSS: foreground, layers, pseudoEvidence };
      });
      evidence.push({ selector, snapshot, ...assessSolidContrast(snapshot) });
    }
  }
  // Attach every selector's assessment before enforcing the gate, including
  // NOT VERIFIED reasons. Unsupported paint can never count as readable.
  await testInfo.attach(label + '-contrast', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
  for (const metric of evidence) {
    const diagnostic = metric.selector + ' ' + JSON.stringify(metric);
    expect.soft(metric.status, diagnostic).toBe('VERIFIED');
    if (metric.status === 'VERIFIED') {
      expect.soft(metric.minimumContrast, diagnostic).toBeGreaterThanOrEqual(4.5);
    }
  }
}

async function dockDisplayOwners(page) {
  return page.evaluate(() => {
    const orb = document.querySelector('.ai-orb'), matches = [];
    const sheet = Array.from(document.styleSheets).find(s => s.href && new URL(s.href).pathname.endsWith('/app-shell.css'));
    if (!sheet || !orb) throw new Error('Expected real dock stylesheet and orb');
    function visit(rules) {
      for (const rule of rules) {
        if (rule.media && !matchMedia(rule.conditionText).matches) continue;
        if (rule.selectorText && rule.style.getPropertyValue('display') === 'flex' && rule.selectorText.includes('.tm-trip-dock') && orb.matches(rule.selectorText)) matches.push(rule.selectorText);
        if (rule.cssRules) visit(rule.cssRules);
      }
    }
    visit(sheet.cssRules);
    return matches;
  });
}

async function mate(page, testInfo, view, width) {
  const orb = page.locator('.ai-orb'), panel = page.locator('.ai-panel');
  await expect(orb).toHaveCount(1);
  await expect(orb).toBeVisible();
  const closedOwners = await dockDisplayOwners(page);
  expect(closedOwners).toHaveLength(1);
  expect(closedOwners[0]).toContain('.tm-trip-dock-mate>.ai-orb');
  for (const control of await page.locator('.tm-trip-dock [data-shell-view],.tm-trip-dock [data-shell-more]').all()) {
    await expect(control).toHaveCSS('display', 'flex');
  }
  const orbBox = await orb.boundingBox();
  expect(orbBox.width).toBeGreaterThanOrEqual(44); expect(orbBox.height).toBeGreaterThanOrEqual(44);
  expect(orbBox.x).toBeGreaterThanOrEqual(0); expect(orbBox.x + orbBox.width).toBeLessThanOrEqual(width + 1);
  await orb.click();
  await expect(panel).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/ai-assistant-open/);
  await expect(orb).toBeHidden();
  expect(await dockDisplayOwners(page), 'Neither generic nor specialized display owner may target the open orb').toEqual([]);
  expect(await page.locator('.ai-orb:visible').count()).toBe(0);
  const input = panel.locator('textarea');
  await expect(input).toBeFocused();
  await input.fill('Synthetic draft only; do not send');
  await page.setViewportSize({ width, height: 540 });
  await expect(page.locator('body')).toHaveClass(/ai-keyboard-open/);
  await expect(page.locator('.tm-trip-dock')).toBeHidden();
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1); expect(box.y + box.height).toBeLessThanOrEqual(541);
  const file = testInfo.outputPath('mate-keyboard-' + view + '.png');
  await page.screenshot({ path: file }); await testInfo.attach('mate-keyboard-' + view, { path: file, contentType: 'image/png' });
  await input.fill('');
  await panel.locator('[data-ai-close]').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/ai-assistant-open|ai-keyboard-open/);
  await page.setViewportSize({ width, height: 900 });
  await expect(orb).toBeVisible();
  await expect(orb).toBeFocused();
  expect(await dockDisplayOwners(page)).toEqual(closedOwners);
  await expect(page.locator('.ai-orb')).toHaveCount(1);
}

module.exports = { boot, documents, canonical, navigate, capture, layout, readability, mate, OWNER, ID };
