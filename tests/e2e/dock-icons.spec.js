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

const dockControlSemantics = {
  home: {
    home: { label: 'בית', name: 'בית' },
    places: { label: 'מקומות', name: 'מקומות' },
    destination: { label: 'טיול חדש', name: 'טיול חדש' },
    trips: { label: 'הטיולים שלי', name: 'הטיולים שלי' },
    // home.js owns the session-dependent aria-label; Profile is the visible
    // dock label. These were intentionally different before the icon change.
    account: { label: 'פרופיל', name: { authenticated: 'החשבון שלי', guest: 'התחברות' } }
  },
  trip: {
    overview: { label: 'סקירה', name: 'סקירה' },
    plan: { label: 'תוכנית', name: 'תוכנית' },
    places: { label: 'מקומות', name: 'מקומות' },
    more: { label: 'עוד', name: 'עוד' }
  }
};

function expectedDockControl(kind, hook, session = 'authenticated') {
  const control = dockControlSemantics[kind]?.[hook];
  if (!control) throw new Error('Unknown dock control: ' + kind + '/' + hook);
  const name = typeof control.name === 'string' ? control.name : control.name[session];
  if (!name) throw new Error('Unknown account session: ' + session);
  return { label: control.label, name };
}

async function assertDockControlSemantics(control, expected, options = {}) {
  const label = control.locator(':scope > span');
  await expect(label).toBeVisible(options);
  expect(await label.textContent()).toMatch(/[\u0590-\u05ff]/);
  await expect(label).toHaveText(expected.label, options);
  await expect(control).toHaveAccessibleName(expected.name, options);
}

async function assertDockNameNegatives(page) {
  const account = page.locator('.tm-home-dock > button[data-cloud-account-open]');
  const expected = expectedDockControl('home', 'account');
  await assertDockControlSemantics(account, expected);
  await expect(account).toHaveAttribute('aria-label', expected.name);
  const originalName = await account.getAttribute('aria-label');
  try {
    for (const invalid of ['שם שגוי', null]) {
      await account.evaluate((node, value) => value === null ? node.removeAttribute('aria-label') : node.setAttribute('aria-label', value), invalid);
      expect(await account.getAttribute('aria-label')).toBe(invalid);
      // Exercise the same semantic-name gate used by all 21 cases. A missing
      // aria-label falls back to Profile, which must not pass as My Account.
      await expect(assertDockControlSemantics(account, expected, { timeout: 100 })).rejects.toThrow();
    }
  } finally {
    await account.evaluate((node, value) => node.setAttribute('aria-label', value), originalName);
  }
  await assertDockControlSemantics(account, expected);
  const homeLink = page.locator('.tm-home-dock > a[data-home-route="home"]');
  const icon = homeLink.locator(':scope > i');
  const originalDecoration = await icon.textContent();
  await expect(icon).toHaveAttribute('aria-hidden', 'true');
  try {
    // The text-named Home link proves aria-hidden decoration is ignored even
    // without an aria-label overriding all descendant content.
    await icon.evaluate(node => { node.textContent = 'decorative QA sentinel'; });
    await assertDockControlSemantics(homeLink, expectedDockControl('home', 'home'));
  } finally {
    await icon.evaluate((node, value) => { node.textContent = value; }, originalDecoration);
  }
}

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

async function structure(page, kind, session = 'authenticated') {
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
  const controlHooks = kind === 'home' ? homeHooks : tripHooks.filter(hook => hook !== 'mate');
  for (const [index, control] of (await dock.locator(':scope > a, :scope > button').all()).entries()) {
    await assertDockControlSemantics(control, expectedDockControl(kind, controlHooks[index], session));
    const rect = await control.boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  return dock;
}

function assertIconWidth(data) { expect(data.width).toBe(24); }
function assertIconHeight(data) { expect(data.height).toBe(24); }

async function collectIconEvidence(page, expected, selector = '.tm-trip-dock > :is(a,button) > i.fa-solid') {
  return page.locator(selector).evaluateAll(async (nodes, options) => {
    const names = Object.keys(options.codepoints);
    function metrics(node) {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      const values = {};
      for (const key of ['display', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'inlineSize', 'blockSize', 'minInlineSize', 'minBlockSize', 'maxInlineSize', 'maxBlockSize', 'boxSizing', 'padding', 'borderWidth', 'fontSize', 'lineHeight', 'flexBasis', 'flexGrow', 'flexShrink', 'flexDirection', 'direction', 'writingMode', 'transform', 'scale', 'translate', 'zoom']) values[key] = style[key];
      return { tag: node.tagName, id: node.id, className: node.className, rect: { x: box.x, y: box.y, width: box.width, height: box.height }, offsetWidth: node.offsetWidth, offsetHeight: node.offsetHeight, computed: values, inlineStyle: node.getAttribute('style') };
    }
    function owners(node) {
      const matched = [], inaccessible = [];
      const properties = ['width', 'height', 'inline-size', 'block-size', 'min-width', 'min-height', 'min-inline-size', 'min-block-size', 'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'font-size', 'line-height', 'transform', 'scale', 'zoom'];
      function walk(rules, sheet, conditions = []) {
        for (const rule of rules) {
          if (rule.selectorText && rule.style) {
            let matches = false; try { matches = node.matches(rule.selectorText); } catch (_) {}
            if (matches) {
              const declarations = Object.fromEntries(properties.filter(key => rule.style.getPropertyValue(key)).map(key => [key, { value: rule.style.getPropertyValue(key), priority: rule.style.getPropertyPriority(key) }]));
              if (Object.keys(declarations).length) matched.push({ sheet, selector: rule.selectorText, conditions, declarations });
            }
          }
          if (rule.cssRules) walk(rule.cssRules, sheet, rule.conditionText ? [...conditions, rule.conditionText] : conditions);
        }
      }
      for (const sheet of document.styleSheets) try { walk(sheet.cssRules, sheet.href || 'test-local style'); } catch (error) { inaccessible.push({ sheet: sheet.href, reason: error.name }); }
      return { matched, inaccessible };
    }
    // Collect every icon before any acceptance assertion. One failed load must
    // not discard the geometry or diagnostic state of the remaining icons.
    return Promise.all(nodes.map(async (node, index) => {
      const iconName = options.expected[index] || names.find(name => node.classList.contains('fa-' + name));
      const glyph = String.fromCodePoint(options.codepoints[iconName] || options.codepoints.house);
      let faces = [], fontError = null, timer;
      try {
        faces = await Promise.race([
          document.fonts.load('900 24px "Font Awesome 6 Free"', glyph),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Bounded glyph load exceeded')), options.timeout); })
        ]);
      } catch (error) { fontError = error.message; } finally { clearTimeout(timer); }
      const style = getComputedStyle(node), pseudo = getComputedStyle(node, '::before'), box = node.getBoundingClientRect();
      const labelStyle = getComputedStyle(node.nextElementSibling || node);
      function raster(font) {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.font = font; ctx.fillStyle = '#000'; ctx.fillText(glyph, 8, 40);
        const pixels = ctx.getImageData(0, 0, 64, 64).data;
        return { pixels: Array.from(pixels), ink: pixels.filter((_, i) => i % 4 === 3 && pixels[i] > 0).length };
      }
      const loaded = raster('900 24px "Font Awesome 6 Free", monospace'), fallback = raster('900 24px monospace');
      const ancestors = []; for (let parent = node.parentElement; parent; parent = parent.parentElement) ancestors.push(metrics(parent));
      return {
        icon: iconName, ariaHidden: node.getAttribute('aria-hidden'), fontError,
        faces: faces.map(f => ({ family: f.family, status: f.status, weight: f.weight })),
        checked: document.fonts.check('900 24px "Font Awesome 6 Free"', glyph),
        family: pseudo.fontFamily, weight: pseudo.fontWeight, content: pseudo.content,
        display: style.display, visibility: style.visibility, opacity: style.opacity,
        pseudoDisplay: pseudo.display, pseudoVisibility: pseudo.visibility, pseudoOpacity: pseudo.opacity,
        pseudo: { fontSize: pseudo.fontSize, lineHeight: pseudo.lineHeight, width: pseudo.width, height: pseudo.height, content: pseudo.content, display: pseudo.display, visibility: pseudo.visibility, opacity: pseudo.opacity, transform: pseudo.transform, scale: pseudo.scale, zoom: pseudo.zoom },
        color: pseudo.color, fill: pseudo.webkitTextFillColor, labelColor: labelStyle.color, labelFill: labelStyle.webkitTextFillColor, width: box.width, height: box.height,
        inkPixels: loaded.ink, differsFromFallback: loaded.pixels.some((v, i) => v !== fallback.pixels[i]),
        hit: node.closest('a,button').contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
        host: metrics(node), parent: metrics(node.parentElement), ancestors, rules: owners(node)
      };
    }));
  }, { expected, codepoints, timeout: FONT_READY_MS });
}

async function paintedGlyphs(page, info, name, expected) {
  let readinessError = null;
  try {
    try {
      await page.waitForFunction(() => [...document.fonts].some(f =>
        f.family.replace(/["']/g, '') === 'Font Awesome 6 Free' && f.weight === '900' && f.status === 'loaded'), null, { timeout: FONT_READY_MS });
    } catch (error) { readinessError = error; }
    const evidence = await collectIconEvidence(page, expected);
    await info.attach(name + '-font-paint-evidence', { body: JSON.stringify({ readinessError: readinessError?.message || null, icons: evidence }, null, 2), contentType: 'application/json' });
    // Evidence is durable even when the first icon fails one of these gates.
    if (readinessError) throw readinessError;
    await expect(page.locator(`link[href="${FA_CSS}"]`)).toHaveCount(1);
    const icons = page.locator('.tm-trip-dock > :is(a,button) > i.fa-solid');
    await expect(icons).toHaveCount(expected.length);
    for (const [index, iconName] of expected.entries()) {
      const data = evidence[index], glyph = String.fromCodePoint(codepoints[iconName]);
      await expect(icons.nth(index)).toHaveAttribute('aria-hidden', 'true');
      expect(data.fontError).toBeNull();
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
      assertIconWidth(data); assertIconHeight(data);
      expect(data.display).not.toBe('none');
      expect(data.visibility).toBe('visible'); expect(Number(data.opacity)).toBeGreaterThan(0);
      expect(data.color).toBe(data.labelColor); expect(data.fill).toBe(data.labelFill);
      expect(data.hit).toBe(true);
    }
    await readability(page, info, name + '-labels', ['.tm-trip-dock > a > span', '.tm-trip-dock > button > span']);
  } finally {
    await info.attach(name + '-capture', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
  }
}

async function proveSizingBoundary(page, info, name, expected) {
  const fixture = await page.evaluateHandle(() => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.dockBoundaryOrdinary = '';
    button.style.cssText = 'position:fixed;left:-1000px;top:0;display:flex;flex-direction:column;align-items:center';
    button.innerHTML = '<i class="fa-solid fa-house" aria-hidden="true" style="font-size:24px"></i><span>Synthetic ordinary control</span>';
    document.body.appendChild(button); return button;
  });
  let perturbation;
  const rejects = fn => { try { fn(); return false; } catch (_) { return true; } };
  try {
    const ordinary = await collectIconEvidence(page, ['house'], '[data-dock-boundary-ordinary] > i');
    const original = await collectIconEvidence(page, expected);
    await info.attach(name + '-ordinary-versus-dock', { body: JSON.stringify({ ordinary, dock: original }, null, 2), contentType: 'application/json' });
    expect(ordinary).toHaveLength(1);
    for (const dimension of ['width', 'height']) expect(Math.abs(ordinary[0][dimension] - 24 * 1.12)).toBeLessThanOrEqual(1 / 64);
    expect(ordinary[0].host.computed.fontSize).toBe('24px');
    expect(ordinary[0].host.computed.flexBasis).toBe('26.88px');
    for (const data of original) { assertIconWidth(data); assertIconHeight(data); }
    perturbation = await page.evaluateHandle(() => {
      const style = document.createElement('style');
      style.textContent = 'html body[data-design="v3"] .tm-trip-dock :is(a,button)>.fa-solid{min-inline-size:1.12em;flex:0 0 1.12em}';
      document.head.appendChild(style); return style;
    });
    const perturbed = await collectIconEvidence(page, expected);
    // Evaluate both dimension gates for every icon before asserting any result.
    const rejection = perturbed.map(data => ({ icon: data.icon, widthRejected: rejects(() => assertIconWidth(data)), heightRejected: rejects(() => assertIconHeight(data)) }));
    await info.attach(name + '-old-sizing-negative', { body: JSON.stringify({ icons: perturbed, rejection }, null, 2), contentType: 'application/json' });
    for (const result of rejection) { expect(result.widthRejected).toBe(true); expect(result.heightRejected).toBe(true); }
  } finally {
    if (perturbation) { await perturbation.evaluate(node => node.remove()); await perturbation.dispose(); }
    await fixture.evaluate(node => node.remove()); await fixture.dispose();
    const restored = await collectIconEvidence(page, expected);
    await info.attach(name + '-restored-sizing', { body: JSON.stringify(restored, null, 2), contentType: 'application/json' });
    for (const data of restored) { assertIconWidth(data); assertIconHeight(data); }
  }
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
    await proveSizingBoundary(page, info, 'home', ['house', 'location-dot', 'plus', 'suitcase', 'user']);
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
    await proveSizingBoundary(page, info, 'wizard', ['house', 'location-dot', 'plus', 'suitcase', 'user']);
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
    await proveSizingBoundary(page, info, 'trip', ['house', 'calendar-days', 'location-dot', 'ellipsis']);
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
  await assertDockNameNegatives(page);
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
