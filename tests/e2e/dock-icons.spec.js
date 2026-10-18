'use strict';
const { test, expect } = require('@playwright/test');
const home = require('./fixtures/all-trips-v3.cjs');
const { readability } = require('./fixtures/six-screen-v3.cjs');

test.use({ serviceWorkers: 'block' });
const FA_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
const FA_FONT = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/6\.5\.2\/webfonts\/fa-solid-900\.(?:woff2|ttf)$/;
const LOCAL_ORIGIN = 'http://127.0.0.1:4173';
const FONT_READY_MS = 7000;
const homeHooks = ['home', 'places', 'destination', 'trips', 'account'];
const tripHooks = ['overview', 'plan', 'mate', 'places', 'more'];
const codepoints = { house: 0xf015, 'location-dot': 0xf3c5, plus: 0x2b, suitcase: 0xf0f2, user: 0xf007, 'calendar-days': 0xf073, ellipsis: 0xf141 };

async function installNetworkBoundary(context, { failFonts = false } = {}) {
  // One fresh Playwright context per test, blocked service workers, and routing
  // disable the HTTP cache. Reuse successful CDN bytes only within this test to
  // avoid repeated live font requests on Home -> trip navigation. Never cache
  // across tests or substitute a font. No shared fixture is modified.
  const cache = new Map();
  const evidence = { allowed: [], blocked: [], failed: [], cacheHits: [], blockedFonts: [] };
  await context.route('**/*', async route => {
    const request = route.request(), url = request.url(), parsed = new URL(url);
    if (parsed.origin === LOCAL_ORIGIN && !parsed.username && !parsed.password) return route.continue();
    const font = FA_FONT.test(url);
    const allowed = request.method() === 'GET' &&
      ((url === FA_CSS && request.resourceType() === 'stylesheet') || (font && request.resourceType() === 'font'));
    if (!allowed || (failFonts && font)) {
      evidence.blocked.push(url);
      if (failFonts && font) evidence.blockedFonts.push(url);
      return route.abort('blockedbyclient');
    }
    if (cache.has(url)) {
      evidence.cacheHits.push(url);
      return route.fulfill(cache.get(url));
    }
    // A redirect must not escape the exact allowlist. Bound the only real
    // external dependency, with no retries and no networkidle/global-font wait.
    let response;
    try {
      response = await route.fetch({ timeout: 5000, maxRedirects: 0, maxRetries: 0 });
      if (response.status() !== 200) throw new Error('Font Awesome response ' + response.status());
      const headers = response.headers();
      // Keep the CDN's existing cross-origin font policy when replaying bytes;
      // omit compression/length headers because response.body() is decoded.
      const policyHeaders = Object.fromEntries(['access-control-allow-origin', 'cross-origin-resource-policy']
        .filter(name => headers[name] !== undefined).map(name => [name, headers[name]]));
      const payload = { status: 200, contentType: headers['content-type'], headers: policyHeaders, body: await response.body() };
      cache.set(url, payload);
      evidence.allowed.push(url);
      await route.fulfill(payload);
    } catch (error) {
      evidence.failed.push({ url, message: error.message });
      await route.abort('failed');
    } finally {
      if (response) await response.dispose();
    }
  });
  return evidence;
}

async function failedIconFont(page, info, name, network, previousAttempts = 0) {
  await expect(page.locator(`link[href="${FA_CSS}"]`)).toHaveCount(1);
  await page.waitForFunction(() => [...document.fonts].some(f =>
    f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900' && f.status === 'error'), null, { timeout: FONT_READY_MS });
  const faces = await page.evaluate(() => [...document.fonts]
    .filter(f => f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900')
    .map(f => ({ family: f.family, weight: f.weight, status: f.status })));
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.every(f => f.status === 'error' || f.status === 'unloaded')).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900' && f.status === 'loaded'))).toBe(false);
  expect(await page.evaluate(() => document.fonts.check('900 24px "Font Awesome 6 Free"', '\uf015'))).toBe(false);
  expect(network.blockedFonts.length).toBeGreaterThan(previousAttempts);
  await info.attach(name + '-failed-font-status', { body: JSON.stringify({ faces, attempts: network.blockedFonts.slice(previousAttempts) }), contentType: 'application/json' });
  return network.blockedFonts.length;
}

async function structure(page, kind) {
  const dock = page.locator('.tm-trip-dock');
  await expect(dock).toHaveCount(1);
  await expect(page.locator('.tm-trip-dock:visible')).toHaveCount(1);
  const actual = await dock.locator(':scope > *').evaluateAll(nodes => nodes.map(n => ({
    hook: n.dataset.homeRoute || n.dataset.shellView || n.dataset.modal || (n.hasAttribute('data-cloud-account-open') ? 'account' : n.hasAttribute('data-shell-mate') ? 'mate' : n.hasAttribute('data-shell-more') ? 'more' : null),
    href: n.getAttribute('href'), center: n.getBoundingClientRect().x + n.getBoundingClientRect().width / 2
  })));
  expect(actual.map(n => n.hook)).toEqual(kind === 'home' ? homeHooks : tripHooks);
  for (let i = 1; i < actual.length; i++) expect(actual[i].center).toBeLessThan(actual[i - 1].center);
  if (kind === 'home') expect(actual.map(n => n.href)).toEqual(['#home', '#home-places', null, '#active-trips', null]);
  else for (const n of actual.filter(n => n.href)) {
    const url = new URL(n.href, page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.pathname).toBe('/trip/custom/index.html');
    expect(url.searchParams.get('id')).toBe('alltrips-rome');
    expect(url.searchParams.get('view')).toBe(n.hook);
  }
  for (const control of await dock.locator(':scope > a, :scope > button').all()) {
    const label = control.locator(':scope > span');
    await expect(label).toBeVisible();
    expect(await label.textContent()).toMatch(/[\u0590-\u05ff]/);
    await expect(control).toHaveAccessibleName((await label.textContent()).trim());
    const rect = await control.boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  return dock;
}

async function paintedGlyphs(page, info, name, expected) {
  await expect(page.locator(`link[href="${FA_CSS}"]`)).toHaveCount(1);
  await page.waitForFunction(() => [...document.fonts].some(f =>
    f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900' && f.status === 'loaded'), null, { timeout: FONT_READY_MS });
  const icons = page.locator('.tm-trip-dock > :is(a,button) > i.fa-solid');
  await expect(icons).toHaveCount(expected.length);
  const evidence = [];
  for (const [index, iconName] of expected.entries()) {
    const icon = icons.nth(index);
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    const glyph = String.fromCodePoint(codepoints[iconName]);
    // Require loaded FontFace objects, not just a declared family or a sized box.
    // No font stubs or substitute downloads: use the entrypoint's existing CDN.
    const data = await icon.evaluate(async (node, glyph) => {
      const faces = await document.fonts.load('900 24px "Font Awesome 6 Free"', glyph);
      const style = getComputedStyle(node), pseudo = getComputedStyle(node, '::before');
      const rect = node.getBoundingClientRect();
      const labelStyle = getComputedStyle(node.nextElementSibling);
      function raster(font) {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.font = font; ctx.fillStyle = '#000'; ctx.fillText(glyph, 8, 40);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        return { pixels: Array.from(pixels), ink: pixels.filter((_, i) => i % 4 === 3 && pixels[i] > 0).length };
      }
      const loaded = raster('900 24px "Font Awesome 6 Free", monospace'), fallback = raster('900 24px monospace');
      return {
        faces: faces.map(f => ({ family: f.family, status: f.status, weight: f.weight })),
        checked: document.fonts.check('900 24px "Font Awesome 6 Free"', glyph),
        family: pseudo.fontFamily, weight: pseudo.fontWeight, content: pseudo.content,
        display: style.display, visibility: style.visibility, opacity: style.opacity,
        pseudoDisplay: pseudo.display, pseudoVisibility: pseudo.visibility, pseudoOpacity: pseudo.opacity,
        color: pseudo.color, fill: pseudo.webkitTextFillColor, labelColor: labelStyle.color, labelFill: labelStyle.webkitTextFillColor, width: rect.width, height: rect.height,
        inkPixels: loaded.ink, differsFromFallback: loaded.pixels.some((v, i) => v !== fallback.pixels[i]),
        hit: node.closest('a,button').contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      };
    }, glyph);
    expect(data.faces.length, 'existing FA CDN font must load; an unavailable font is a failure, never a visibility pass').toBeGreaterThan(0);
    expect(data.faces.every(f => f.status === 'loaded' && f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900')).toBe(true);
    expect(data.checked).toBe(true);
    expect(data.family).toContain('Font Awesome 6 Free');
    expect(data.weight).toBe('900');
    expect(data.content.replace(/^["']|["']$/g, '')).toBe(glyph);
    expect(data.pseudoDisplay).not.toBe('none');
    expect(data.pseudoVisibility).toBe('visible');
    expect(Number(data.pseudoOpacity)).toBeGreaterThan(0);
    expect(data.inkPixels).toBeGreaterThan(0);
    expect(data.differsFromFallback).toBe(true);
    expect(data.width).toBe(24); expect(data.height).toBe(24);
    expect(data.display).not.toBe('none');
    expect(data.visibility).toBe('visible'); expect(Number(data.opacity)).toBeGreaterThan(0);
    expect(data.color).toBe(data.labelColor); expect(data.fill).toBe(data.labelFill);
    expect(data.hit).toBe(true);
    evidence.push({ icon: iconName, ...data });
  }
  await info.attach(name + '-font-paint-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  await readability(page, info, name + '-labels', ['.tm-trip-dock > a > span', '.tm-trip-dock > button > span']);
  await info.attach(name + '-capture', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
}

for (const width of [390, 430]) for (const theme of ['light', 'dark']) for (const accent of ['ocean', 'plum', 'pink', 'sunset', 'emerald']) {
  test(`canonical dock FA glyphs and captures ${width}/${theme}/${accent}`, async ({ page, context }, info) => {
    const network = await installNetworkBoundary(context);
    const fontResponses = [];
    page.on('response', response => { if (FA_FONT.test(response.url())) fontResponses.push({ url: response.url(), status: response.status() }); });
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await home.open(page, { theme });
    await page.waitForFunction(() => window.TravelMateTheme, null, { timeout: FONT_READY_MS });
    await page.evaluate(accent => TravelMateTheme.setAccent(accent), accent);
    const dock = await structure(page, 'home');
    await paintedGlyphs(page, info, 'home', ['house', 'location-dot', 'plus', 'suitcase', 'user']);
    await expect(dock.locator('[data-home-route="trips"]')).toHaveAttribute('aria-current', 'page');
    const homeLink = dock.locator('[data-home-route="home"]');
    await homeLink.focus(); await page.keyboard.press('Enter');
    await expect(homeLink).toHaveAttribute('aria-current', 'page');
    await expect(dock.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(homeLink).toHaveCSS('transition-duration', '0s');
    await expect(homeLink).toHaveCSS('outline-style', 'solid');
    const identity = await dock.elementHandle();
    await dock.locator('[data-modal="destination"]').click();
    await expect(page.locator('#modal-destination')).toHaveClass(/open/);
    expect(await dock.evaluate((node, original) => node === original, identity)).toBe(true);
    await expect(page.locator('#modal-destination .tm-home-dock[data-wizard-dock]')).toHaveCount(1);
    await structure(page, 'home');
    await paintedGlyphs(page, info, 'wizard', ['house', 'location-dot', 'plus', 'suitcase', 'user']);
    await page.keyboard.press('Escape');
    await expect(dock.locator('[data-modal="destination"]')).toBeFocused();
    expect(await dock.evaluate((node, original) => node === original, identity)).toBe(true);
    await dock.locator('[data-home-route="trips"]').click();
    await page.locator('[data-cloud-trip="alltrips-rome"] a').click();
    await page.waitForFunction(() => window.TravelMateHistory && document.querySelector('[data-shell-mate] .ai-orb'), null, { timeout: FONT_READY_MS });
    await structure(page, 'trip');
    await expect(page.locator('.ai-orb')).toHaveCount(1);
    await expect(page.locator('[data-shell-mate] > .ai-orb')).toBeVisible();
    await expect(dock.locator('[data-shell-view="overview"]')).toHaveAttribute('aria-current', 'page');
    await paintedGlyphs(page, info, 'trip', ['house', 'calendar-days', 'location-dot', 'ellipsis']);
    await dock.locator('[data-shell-more]').focus(); await page.keyboard.press('Enter');
    await expect(dock.locator('[data-shell-more]')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-shell-utilities]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dock.locator('[data-shell-more]')).toBeFocused();
    await expect(dock.locator('[data-shell-more]')).toHaveAttribute('aria-expanded', 'false');
    expect(fontResponses.some(r => r.status === 200), 'existing CDN webfont response').toBe(true);
    await info.attach('existing-font-route', { body: JSON.stringify(fontResponses), contentType: 'application/json' });
    expect(network.failed).toEqual([]);
    expect(network.allowed).toContain(FA_CSS);
    expect(network.allowed.some(url => FA_FONT.test(url))).toBe(true);
    await info.attach('restricted-network', { body: JSON.stringify(network), contentType: 'application/json' });
  });
}

test('font failure preserves Hebrew dock names, order and wizard reparenting', async ({ page, context }, info) => {
  const network = await installNetworkBoundary(context, { failFonts: true });
  await page.setViewportSize({ width: 390, height: 900 });
  // A fresh isolated context prevents successful-font cache contamination.
  // Fail both supported font formats while retaining the real stylesheet.
  await home.open(page);
  const dock = await structure(page, 'home');
  const homeAttempts = await failedIconFont(page, info, 'home', network);
  await readability(page, info, 'font-failure-home-labels', ['.tm-trip-dock > a > span', '.tm-trip-dock > button > span']);
  await dock.locator('[data-modal="destination"]').click();
  await structure(page, 'home');
  await page.keyboard.press('Escape');
  await expect(dock.locator('[data-modal="destination"]')).toBeFocused();
  await dock.locator('[data-home-route="trips"]').click();
  await page.locator('[data-cloud-trip="alltrips-rome"] a').click();
  await page.waitForFunction(() => window.TravelMateHistory && document.querySelector('[data-shell-mate] .ai-orb'), null, { timeout: FONT_READY_MS });
  await structure(page, 'trip');
  await failedIconFont(page, info, 'trip', network, homeAttempts);
  await readability(page, info, 'font-failure-trip-labels', ['.tm-trip-dock > a > span', '.tm-trip-dock > button > span']);
  expect(network.allowed).toEqual([FA_CSS]);
  expect(network.failed).toEqual([]);
  await info.attach('restricted-network-font-failure', { body: JSON.stringify(network), contentType: 'application/json' });
});
