'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

// Parse the bounded navigation fragment into a tree so order, nesting, labels
// and control attributes are checked together. Browser DOM/paint is tested in
// dock-icons.spec.js; this deliberately makes no layout or font-load claim.
function dockTree(html) {
  const fragments = html.match(/<nav\b[^>]*class="[^"]*\btm-trip-dock\b[^"]*"[^>]*>[\s\S]*?<\/nav>/g) || [];
  assert.equal(fragments.length, 1, 'one canonical dock');
  const root = { children: [] }, stack = [root];
  for (const token of fragments[0].match(/<[^>]+>|[^<]+/g)) {
    if (token.startsWith('</')) {
      assert.equal(stack.pop().tag, token.slice(2, -1));
    } else if (token.startsWith('<')) {
      const [, tag, raw] = token.match(/^<([\w-]+)([^>]*)>$/);
      const attrs = Object.fromEntries([...raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m => [m[1], m[2] ?? '']));
      const node = { tag, attrs, children: [], text: '' };
      stack.at(-1).children.push(node);
      stack.push(node);
    } else {
      if (token.trim()) stack.at(-1).text += token;
    }
  }
  assert.equal(stack.length, 1);
  return root.children[0];
}
const contracts = {
  'index.html': [
    ['a', { href: '#home', 'data-home-route': 'home' }, 'house', 'בית'],
    ['a', { href: '#home-places', 'data-home-route': 'places' }, 'location-dot', 'מקומות'],
    ['button', { type: 'button', 'data-modal': 'destination', class: 'tm-new-trip' }, 'plus', 'טיול חדש'],
    ['a', { href: '#active-trips', 'data-home-route': 'trips' }, 'suitcase', 'הטיולים שלי'],
    ['button', { type: 'button', 'data-cloud-account-open': '' }, 'user', 'פרופיל']
  ],
  'trip/custom/index.html': [
    ['a', { href: '?view=overview', 'data-shell-view': 'overview' }, 'house', 'סקירה'],
    ['a', { href: '?view=plan', 'data-shell-view': 'plan' }, 'calendar-days', 'תוכנית'],
    ['span', { class: 'tm-trip-dock-mate', 'data-shell-mate': '' }],
    ['a', { href: '?view=places', 'data-shell-view': 'places' }, 'location-dot', 'מקומות'],
    ['button', { type: 'button', class: 'mobile-menu-button', 'data-mobile-menu': '', 'data-shell-more': '', 'aria-expanded': 'false' }, 'ellipsis', 'עוד']
  ]
};
for (const [file, expected] of Object.entries(contracts)) test(`${file}: canonical order, hooks and Hebrew names survive decorative FA icons`, () => {
  const html = read(file), dock = dockTree(html);
  assert.match(html, /<html[^>]*dir="rtl"/);
  assert.match(dock.attrs['aria-label'], /[\u0590-\u05ff]/);
  assert.equal(dock.children.length, expected.length);
  expected.forEach(([tag, attrs, icon, label], index) => {
    const node = dock.children[index];
    assert.equal(node.tag, tag);
    assert.deepEqual(node.attrs, attrs);
    if (!icon) { assert.deepEqual(node.children, []); return; }
    assert.deepEqual(node.children.map(n => n.tag), ['i', 'span']);
    assert.deepEqual(node.children[0].attrs, { class: `fa-solid fa-${icon}`, 'aria-hidden': 'true' });
    assert.equal(node.children[0].text, '');
    assert.equal(node.children[1].text, label);
    assert.deepEqual(node.children[1].attrs, {}, 'label remains visible and participates in the accessible name');
  });
  assert.match(html, /href="https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/font-awesome\/6\.5\.2\/css\/all\.min\.css"/);
});

test('legacy Italy/Japan entries keep their existing navigation; no second dock is introduced', () => {
  for (const file of ['trip/italy-2028/index.html', 'trip/japan-2027/index.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /class="[^"]*tm-trip-dock/);
    assert.match(html, /font-awesome\/6\.5\.2\/css\/all\.min\.css/);
  }
});

test('dock icon rule sizes inherited ink without overriding the FA font or MATE brand', () => {
  const css = read('assets/app-shell.css');
  const rule = css.match(/html body\[data-design="v3"\] \.tm-trip-dock :is\(a,button\)>\.fa-solid\{([^}]+)\}/);
  assert.ok(rule);
  const declarations = Object.fromEntries(rule[1].split(';').map(x => x.split(':')));
  assert.equal(declarations.display, 'inline-grid');
  assert.equal(declarations.width, '24px');
  assert.equal(declarations.height, '24px');
  assert.equal(declarations['font-size'], '24px');
  assert.equal(declarations.color, 'inherit');
  assert.equal(declarations.font, undefined);
  assert.equal(declarations['font-family'], undefined);
  assert.doesNotMatch(css, /\.tm-trip-dock svg\{/);
  assert.match(css, /\.tm-trip-dock \.ai-orb::after\{content:"MATE"/);
  assert.match(css, /\.tm-trip-dock \.ai-orb :is\(\.ai-orb-badge,\.ai-orb-ring,i\)\{display:none\}/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\) 72px repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:56px/);
  assert.match(css, /:focus-visible\{outline:3px solid var\(--tm-action-primary\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\).*\.tm-trip-dock :is\(a,button\)\{transition:none\}/);
});

test('dedicated browser network boundary permits only local origin and exact FA resources, without redirect or cache escape', async () => {
  const vm = require('node:vm');
  const register = () => {}; register.use = () => {};
  const context = { URL, require(name) {
    if (name === '@playwright/test') return { test: register, expect() {} };
    if (name.startsWith('./fixtures/')) return {};
    throw new Error('Unexpected dedicated spec dependency: ' + name);
  } };
  // Exercise the actual dedicated-spec route handler without browser/network I/O.
  // No shared fixture, production source or browser assertion is stubbed in CI.
  vm.runInNewContext(read('tests/e2e/dock-icons.spec.js') + '\nthis.install = installNetworkBoundary;', context);
  const css = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
  const font = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/webfonts/fa-solid-900.woff2';
  async function boundary(options) {
    let handler;
    const evidence = await context.install({ async route(pattern, callback) {
      assert.equal(pattern, '**/*'); handler = callback;
    } }, options);
    return { evidence, async request(url, type = 'font', method = 'GET', status = 200) {
      const calls = { fetch: 0, continued: 0, aborted: null, fulfilled: null, disposed: 0 };
      await handler({
        request: () => ({ url: () => url, method: () => method, resourceType: () => type }),
        async continue() { calls.continued++; },
        async abort(reason) { calls.aborted = reason; },
        async fulfill(payload) { calls.fulfilled = payload; },
        async fetch(options) {
          calls.fetch++;
          assert.deepEqual({ ...options }, { timeout: 5000, maxRedirects: 0, maxRetries: 0 });
          return { status: () => status, headers: () => ({ 'content-type': type === 'font' ? 'font/woff2' : 'text/css', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'content-encoding': 'gzip' }), body: async () => Buffer.from('synthetic route bytes'), async dispose() { calls.disposed++; } };
        }
      });
      return calls;
    } };
  }
  const live = await boundary();
  assert.equal((await live.request('http://127.0.0.1:4173/trip/custom/index.html', 'document')).continued, 1);
  for (const [url, type] of [[css, 'stylesheet'], [font, 'font'], [font.replace('.woff2', '.ttf'), 'font']]) {
    const first = await live.request(url, type), cached = await live.request(url, type);
    assert.equal(first.fetch, 1); assert.equal(first.disposed, 1); assert.equal(first.fulfilled.status, 200);
    assert.deepEqual({ ...first.fulfilled.headers }, { 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, 'retain existing CDN policy without replaying decoded-body compression headers');
    assert.equal(cached.fetch, 0); assert.deepEqual(cached.fulfilled.body, first.fulfilled.body);
  }
  for (const [url, type, method] of [
    ['https://example.invalid/analytics', 'script'],
    ['https://example.supabase.co/rest/v1/trips', 'fetch'],
    ['https://images.unsplash.com/photo-test', 'image'],
    ['https://127.0.0.1:4173/index.html', 'document'],
    ['http://127.0.0.1:4174/index.html', 'document'],
    ['http://user@127.0.0.1:4173/index.html', 'document'],
    [font + '?extra=1', 'font'], [font + '/extra', 'font'],
    [font.replace('cdnjs.cloudflare.com', 'cdnjs.cloudflare.com.example.invalid'), 'font'],
    [font.replace('fa-solid-900', 'fa-regular-400'), 'font'],
    [css, 'script'], [font, 'fetch'], [font, 'font', 'POST']
  ]) {
    const blocked = await live.request(url, type, method);
    assert.equal(blocked.aborted, 'blockedbyclient', url); assert.equal(blocked.fetch, 0); assert.equal(blocked.continued, 0);
  }
  const redirect = await boundary(), rejected = await redirect.request(font, 'font', 'GET', 302);
  assert.equal(rejected.fetch, 1); assert.equal(rejected.aborted, 'failed'); assert.equal(rejected.fulfilled, null); assert.equal(redirect.evidence.failed.length, 1);
  assert.equal((await redirect.request(font)).fetch, 1, 'failed responses must not be cached');
  const failure = await boundary({ failFonts: true });
  assert.equal((await failure.request(css, 'stylesheet')).fetch, 1);
  for (const url of [font, font.replace('.woff2', '.ttf')]) for (const phase of ['home', 'trip']) {
    const blocked = await failure.request(url);
    assert.equal(blocked.fetch, 0, phase); assert.equal(blocked.fulfilled, null); assert.equal(blocked.aborted, 'blockedbyclient');
  }
  assert.equal(failure.evidence.blockedFonts.length, 4);
  assert.deepEqual([...failure.evidence.allowed], [css], 'fresh context cannot inherit successful font cache');
});

test('account controller preserves explicit authenticated/guest names separately from the Profile dock label', () => {
  const vm = require('node:vm');
  const register = () => {}; register.use = () => {};
  const context = { URL, require(name) {
    if (name === '@playwright/test') return { test: register, expect() {} };
    if (name.startsWith('./fixtures/')) return {};
    throw new Error('Unexpected dedicated spec dependency: ' + name);
  } };
  vm.runInNewContext(read('tests/e2e/dock-icons.spec.js') + '\nthis.expectedControl = expectedDockControl;', context);
  const accountNode = dockTree(read('index.html')).children[4];
  assert.equal(accountNode.attrs['data-cloud-account-open'], '');
  assert.equal(accountNode.children[1].text, 'פרופיל');
  const home = read('assets/home.js');
  const start = home.indexOf('    accountOpenButtons.forEach(function (button) {', home.indexOf('    sessionPanel.hidden = !session;'));
  assert.ok(start >= 0, 'canonical account-render callback');
  const end = home.indexOf('\n    });', start);
  assert.ok(end > start);
  const callback = home.slice(start, end + '\n    });'.length);
  for (const [sessionState, name] of [['authenticated', 'החשבון שלי'], ['guest', 'התחברות']]) {
    const attributes = {}, button = {
      classList: { contains() { return false; } },
      setAttribute(key, value) { attributes[key] = value; },
      querySelector() { return null; }
    };
    vm.runInNewContext(callback, { accountOpenButtons: [button], session: sessionState === 'authenticated' ? { user: { id: 'synthetic-account' } } : null });
    const expected = context.expectedControl('home', 'account', sessionState);
    assert.equal(expected.label, 'פרופיל');
    assert.equal(expected.name, name);
    assert.equal(attributes['aria-label'], expected.name, 'test expectation follows the actual canonical session renderer');
    assert.equal(attributes.title, expected.name);
    assert.notEqual(expected.name, expected.label);
  }
  for (const [file, kind] of [['index.html', 'home'], ['trip/custom/index.html', 'trip']]) {
    for (const node of dockTree(read(file)).children.filter(n => n.tag === 'a' || n.tag === 'button')) {
      const attrs = node.attrs;
      const hook = attrs['data-home-route'] || attrs['data-shell-view'] || attrs['data-modal'] || ('data-cloud-account-open' in attrs ? 'account' : 'more');
      const expected = context.expectedControl(kind, hook);
      assert.equal(expected.label, node.children[1].text, 'exact visible Hebrew label');
      if (hook !== 'account') assert.equal(expected.name, node.children[1].text, 'text-named canonical control');
    }
  }
  assert.throws(() => context.expectedControl('home', 'account', 'unknown'), /Unknown account session/);
  assert.throws(() => context.expectedControl('home', 'unknown'), /Unknown dock control/);
});

test('shared icon sizing excludes canonical docks without changing ordinary sizing', () => {
  const css = read('assets/phone-visual-qa.css');
  const selector = 'html body :is(button,a[href],[role="button"]):not(:where(.tm-trip-dock *)) > :is(i.fa-solid,i.fa-regular,i.fa-brands,i.fa)';
  const firstRule = css.match(/html body :is\(button,a\[href\],\[role="button"\]\)[^{}]*\{([^}]+)\}/);
  assert.ok(firstRule, 'existing shared direct-icon rule');
  assert.equal(firstRule[0].slice(0, firstRule[0].indexOf('{')).trim(), selector, 'exclude dock descendants through a zero-specificity boundary at the existing owner');
  const declarations = Object.fromEntries(firstRule[1].split(';').map(s => s.trim()).filter(Boolean).map(s => s.split(':')));
  assert.equal(declarations['inline-size'], '1.12em');
  assert.equal(declarations['min-inline-size'], '1.12em');
  assert.equal(declarations['block-size'], '1.12em');
  assert.equal(declarations.flex, '0 0 1.12em');
  assert.equal(declarations['line-height'], '1');
  assert.match(css, /html body :is\(button,a\[href\],\[role="button"\]\) > :is\(i\.fa-solid,i\.fa-regular,i\.fa-brands,i\.fa\) \+ :is\(span,strong,small\)\{\s*vertical-align:middle;\s*\}/, 'unrelated sibling-label rule remains intact');
  const shell = read('assets/app-shell.css');
  assert.match(shell, /\.tm-trip-dock :is\(a,button\)>\.fa-solid\{[^}]*width:24px;height:24px;[^}]*font-size:24px;line-height:1/);
  assert.equal((css.match(/:not\(:where\(\.tm-trip-dock \*\)\)/g) || []).length, 1, 'one owner-boundary edit, no additional override layer');
});

test('exact browser box gates independently reject width and height regressions', () => {
  const vm = require('node:vm');
  const register = () => {}; register.use = () => {};
  const context = { URL, require(name) {
    if (name === '@playwright/test') return { test: register, expect(value) { return { toBe(expected) { assert.equal(value, expected); } }; } };
    if (name.startsWith('./fixtures/')) return {};
    throw new Error('Unexpected dedicated spec dependency: ' + name);
  } };
  vm.runInNewContext(read('tests/e2e/dock-icons.spec.js') + '\nthis.widthGate = assertIconWidth; this.heightGate = assertIconHeight;', context);
  assert.doesNotThrow(() => context.widthGate({ width: 24, height: 24 }));
  assert.doesNotThrow(() => context.heightGate({ width: 24, height: 24 }));
  assert.throws(() => context.widthGate({ width: 26.875, height: 24 }), /26\.875/);
  assert.doesNotThrow(() => context.heightGate({ width: 26.875, height: 24 }));
  assert.throws(() => context.heightGate({ width: 24, height: 26.875 }), /26\.875/);
  assert.doesNotThrow(() => context.widthGate({ width: 24, height: 26.875 }));
  assert.throws(() => context.widthGate({ width: 26.875, height: 26.875 }), /26\.875/);
  assert.throws(() => context.heightGate({ width: 26.875, height: 26.875 }), /26\.875/);
});
