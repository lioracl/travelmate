'use strict';
const { test, expect } = require('@playwright/test');

// Reuse the routed synthetic-page + mocked-client boot pattern from
// documents-lifecycle.spec.js. No production account or document is accessed.
async function boot(page, options = {}) {
  const groups = ['flights', 'lodging', 'tickets', 'insurance', 'personal'];
  const filters = ['all', ...groups, 'mate'].map(group => `<button type="button" data-document-filter="${group}">${group} <span data-document-filter-count="${group}">0</span></button>`).join('');
  const rows = groups.map(group => `<article class="doc-row" data-document-group="${group}"><span class="icon"></span><div><strong>${group}</strong></div><button type="button">הוספה</button></article>`).join('');
  await page.route('**/documents-v3-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
    `<html lang="he" dir="rtl" data-theme="${options.theme || 'light'}" data-surface-theme="ice-aqua"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body class="tm-new-design" data-trip-kind="custom" data-trip-view="documents" data-trip-id="synthetic-trip"><div class="workspace"><main class="content"><section id="documents"><div class="section-head"><h2>מסמכים</h2><button type="button" data-vault-pick>הוספת מסמך</button></div><div data-documents-library></div><nav class="documents-category-nav" data-documents-category-nav>${filters}</nav><div data-document-category-list>${rows}</div><article data-ai-notes-archive><strong>Mate synthetic archive</strong></article></section></main></div></body></html>` }));
  await page.goto('/documents-v3-fixture');
  // Include the real shared cascade after vault CSS to exercise the 42px rule.
  for (const asset of ['styles.css', 'trip-redesign.css', 'theme.css', 'document-vault.css', 'readable-glass.css', 'phone-visual-qa.css', 'app-shell.css']) await page.addStyleTag({ url: '/assets/' + asset });
  await page.evaluate(options => {
    const qa = window.documentsV3QA = { user: options.signedOut ? null : { id: 'A', email: 'synthetic@example.invalid' }, error: Boolean(options.error), hold: Boolean(options.hold), requests: [], downloads: [], rows: [], blobs: {} };
    const make = (id, category, file_name, note) => ({ id, category, file_name, note, user_id: 'A', trip_id: 'synthetic-trip', storage_path: 'A/synthetic-trip/' + id, mime_type: 'text/plain', file_size: 20, created_at: '2026-10-01T00:00:00Z', encrypted: true });
    if (!options.empty) qa.rows = [make('flight-one', 'flights', 'טיסה Flight One.txt', 'תל אביב'), make('flight-two', 'flights', 'Flight Two.txt', 'לונדון'), make('personal', 'personal', 'Personal Flight notes.txt', 'תל אביב')];
    const client = {
      auth: { getSession: async () => ({ data: { session: qa.user ? { user: qa.user } : null } }), onAuthStateChange: fn => { qa.auth = fn; }, signOut: async () => { qa.switch(null); return {}; } },
      storage: { from: () => ({ download: async path => { qa.downloads.push(path); return { data: qa.blobs[path] }; } }) },
      from: table => {
        const filters = []; const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
          then(resolve, reject) {
            const result = { data: qa.rows.filter(row => filters.every(([key, value]) => row[key] === value)), error: qa.error ? { message: 'synthetic unavailable' } : null };
            qa.requests.push({ table, filters });
            return (qa.hold ? new Promise(r => { qa.release = () => r(result); }) : Promise.resolve(result)).then(resolve, reject);
          }
        }; return query;
      }
    };
    window.TRAVELMATE_SUPABASE = { url: 'https://example.invalid', publishableKey: 'synthetic' };
    window.TravelMateCloud = { getClient: async () => client, getPrivateStorageSession: async () => ({ session: { user: qa.user } }) };
    qa.switch = user => { qa.user = user; qa.auth(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null); };
    qa.encryptSynthetic = async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode('synthetic-vault-password'), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('Synthetic fixture contents only'));
      const b64 = bytes => btoa(String.fromCharCode(...bytes));
      qa.rows.forEach(row => { row.encryption_salt = b64(salt); row.encryption_iv = b64(iv); qa.blobs[row.storage_path] = new Blob([bytes]); });
    };
  }, options);
  await page.addScriptTag({ url: '/assets/document-vault.js' });
  const state = options.signedOut ? 'signed-out' : options.hold ? 'loading' : options.error ? 'error' : options.empty ? 'empty' : 'locked';
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', state);
}

for (const width of [390, 430]) for (const theme of ['light', 'dark']) {
  test(`Documents search is RTL, scoped and usable at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await boot(page, { theme });
    await expect(page.locator('[data-vault-lock-state]')).toBeVisible();
    const search = page.locator('[data-vault-search]');
    await search.fill('FLIGHT אביב'); await expect(page.locator('[data-document-id]:visible')).toHaveCount(2);
    expect(await page.evaluate(() => documentsV3QA.downloads)).toEqual([]);
    await page.locator('[data-document-filter="flights"]').click();
    await expect(page.locator('[data-document-id]:visible')).toHaveCount(1);
    expect(await page.evaluate(() => documentsV3QA.downloads)).toEqual([]);
    await search.fill('אין תוצאה'); await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'no-results');
    await expect(page.locator('[data-document-id]:visible')).toHaveCount(0);
    expect(await page.evaluate(() => documentsV3QA.downloads)).toEqual([]);
    await page.locator('[data-vault-search-clear]').click(); await expect(search).toHaveValue(''); await expect(search).toBeFocused();
    await expect(page.locator('[data-vault-search-clear]')).toBeHidden();
    await expect(page.locator('[data-document-id]:visible')).toHaveCount(2);
    expect(await page.evaluate(() => documentsV3QA.downloads)).toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).direction)).toBe('rtl');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const sizes = await page.locator('#documents .vault-library button:visible, #documents .document-vault button:visible, [data-vault-search]').evaluateAll(nodes => nodes.map(node => ({ height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width })));
    for (const size of sizes) { expect(size.height).toBeGreaterThanOrEqual(44); expect(size.width).toBeGreaterThan(0); }
    const colors = await search.evaluate(node => ({ bg: getComputedStyle(node).backgroundColor, fg: getComputedStyle(node).color }));
    expect(colors.bg).not.toBe('rgba(0, 0, 0, 0)'); expect(colors.bg).not.toBe(colors.fg);
    await expect(page.locator('[data-ai-notes-archive] strong')).toHaveText('Mate synthetic archive');
  });
}

test('loading waits for success; empty, error/retry and offline remain distinct', async ({ page, context }) => {
  await boot(page, { hold: true, empty: true });
  await expect(page.locator('.vault-library')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-document-category-list]')).toBeHidden();
  await expect(page.locator('[data-vault-search-controls]')).toBeHidden();
  await expect.poll(() => page.evaluate(() => typeof documentsV3QA.release)).toBe('function');
  await page.evaluate(() => { documentsV3QA.hold = false; documentsV3QA.release(); });
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'empty');
  await page.evaluate(() => { documentsV3QA.error = true; documentsV3QA.switch({ id: 'B', email: 'b@example.invalid' }); });
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'error');
  await expect(page.locator('[data-vault-status]')).toHaveClass(/error/);
  await expect(page.locator('[data-vault-status]')).not.toHaveText('');
  await expect(page.locator('[data-document-id]')).toHaveCount(0);
  await page.evaluate(() => { documentsV3QA.error = false; documentsV3QA.hold = true; }); await page.locator('[data-vault-retry]').click();
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'loading');
  await expect(page.locator('[data-vault-status]')).toHaveText('');
  await expect(page.locator('[data-vault-status]')).not.toHaveClass(/error/);
  await page.evaluate(() => { documentsV3QA.hold = false; documentsV3QA.release(); });
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'empty');
  await expect(page.locator('[data-vault-status]')).toHaveText('');
  await expect(page.locator('[data-vault-status]')).not.toHaveClass(/error/);
  await context.setOffline(true); await expect(page.locator('[data-vault-offline]')).toBeVisible();
  await expect(page.locator('[data-vault-offline]')).toContainText('קבצים מהענן דורשים חיבור');
  await context.setOffline(false); await expect(page.locator('[data-vault-offline]')).toBeHidden();
});

test('signed-out upload routes to auth; signed-in category upload uses the existing picker', async ({ page }) => {
  await boot(page, { signedOut: true });
  await expect(page.locator('[data-vault-upload-section]')).toBeHidden();
  await expect(page.locator('[data-vault-lock-state]')).toBeHidden();
  await page.locator('[data-vault-pick]').click(); await expect(page.locator('[data-vault-auth-form] input[name="email"]')).toBeFocused();
  await page.evaluate(() => documentsV3QA.switch({ id: 'A', email: 'synthetic@example.invalid' }));
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'locked');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.doc-row[data-document-group="lodging"] > button').click()]);
  expect(chooser.isMultiple()).toBe(true);
  const picker = page.locator('input[name="files"]'); expect(await picker.getAttribute('accept')).toContain('.pdf');
  expect(await page.locator('select[name="category"]').inputValue()).toBe(await page.locator('select[name="category"] option').nth(1).textContent());
});

test('preview traps focus, Escape restores it and account changes clear query/preview/rows', async ({ page }) => {
  // Encrypt only synthetic bytes, then let the real vault decrypt/preview them.
  await boot(page, { hold: true });
  await expect.poll(() => page.evaluate(() => typeof documentsV3QA.release)).toBe('function');
  await page.evaluate(async () => { await documentsV3QA.encryptSynthetic(); documentsV3QA.hold = false; documentsV3QA.release(); });
  await expect(page.locator('.vault-library')).toHaveAttribute('data-vault-library-state', 'locked');
  await page.locator('[data-vault-passphrase]').fill('synthetic-vault-password');
  await page.locator('[data-vault-search]').fill('One');
  const open = page.locator('[data-document-id="flight-one"] [data-open-document]');
  await open.click(); const close = page.locator('[data-vault-preview-close]');
  await expect(close).toBeFocused(); await expect(page.locator('[data-vault-preview] pre')).toContainText('Synthetic fixture contents only');
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('[data-vault-preview-download]')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('[data-vault-preview]')).toHaveCount(0); await expect(open).toBeFocused();
  await open.click(); await expect(close).toBeVisible();
  await page.evaluate(() => documentsV3QA.switch({ id: 'B', email: 'b@example.invalid' }));
  await expect(page.locator('[data-vault-search]')).toHaveValue(''); await expect(page.locator('[data-vault-passphrase]')).toHaveValue('');
  await expect(page.locator('[data-vault-preview]')).toHaveCount(0); await expect(page.locator('[data-document-id]')).toHaveCount(0);
  await expect(page.locator('[data-vault-search-results]')).not.toContainText('1 מסמכים');
  expect(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('Flight One') || value === 'One'))).toBe(false);
});
