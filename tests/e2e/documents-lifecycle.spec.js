const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.route('**/documents-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><body data-trip-id="synthetic-trip"><section id="documents"><div class="section-head"></div><div data-documents-library></div><div data-document-category-list><article class="doc-row" data-document-group="personal"><strong>אישי</strong><button>העלאה</button></article></div></section></body>' }));
  await page.goto('/documents-fixture');
  await page.evaluate(() => {
    const qa = window.documentsQA = { user: { id: 'A', email: 'a@example.invalid' }, rows: [], uploaded: [], removed: [], holdUpload: false, holdMetadata: false, offline: false, quota: false };
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: qa.user } } }), onAuthStateChange: fn => { qa.auth = fn; } },
      storage: { from: () => ({
        upload: async (path, blob) => { qa.uploaded.push({ path, size: blob.size }); if (qa.holdUpload) await new Promise(resolve => { qa.releaseUpload = resolve; }); return qa.quota ? { error: { code: 'EntityTooLarge', message: 'exceeded maximum allowed size' } } : {}; },
        remove: async paths => { if (qa.offline) throw new Error('network offline'); qa.removed.push(...paths); return {}; }
      }) },
      from: () => {
        let operation = 'select'; const filters = [];
        const query = {
          select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
          delete() { operation = 'delete'; return query; },
          async insert(row) { if (qa.holdMetadata) await new Promise(resolve => { qa.releaseMetadata = resolve; }); qa.rows.push({ ...row, id: 'synthetic-id', created_at: '2026-10-01T00:00:00Z' }); return {}; },
          then(resolve, reject) { return Promise.resolve().then(() => {
            const matches = row => filters.every(([key, value]) => row[key] === value);
            const data = qa.rows.filter(matches); if (operation === 'delete') qa.rows = qa.rows.filter(row => !matches(row));
            return { data, error: null };
          }).then(resolve, reject); }
        }; return query;
      }
    };
    window.TRAVELMATE_SUPABASE = { url: 'https://example.invalid', publishableKey: 'synthetic', documentBucket: 'travel-documents' };
    window.TravelMateCloud = { getClient: async () => client, getPrivateStorageSession: async () => ({ session: { user: qa.user } }) };
    qa.switch = user => { qa.user = user; qa.auth(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null); };
  });
  await page.addScriptTag({ url: '/assets/document-vault.js' });
  await expect(page.locator('[data-vault-email]')).toHaveText('a@example.invalid');
  await page.locator('[data-vault-passphrase]').fill('synthetic-vault-password');
}
async function upload(page) {
  await page.locator('input[name="files"]').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic document') });
}
test('encrypted upload persists metadata, refresh keeps passphrase, switch clears it and rows immediately', async ({ page }) => {
  await boot(page); await upload(page);
  await expect(page.locator('[data-vault-status]')).toContainText('נשמרו בהצלחה');
  await expect(page.locator('[data-document-id]')).toHaveCount(1);
  const result = await page.evaluate(() => ({ upload: documentsQA.uploaded[0], row: documentsQA.rows[0] }));
  expect(result.upload.path).toMatch(/^A\/synthetic-trip\/.+\.vault$/); expect(result.upload.size).toBe(Buffer.byteLength('synthetic document') + 16);
  expect(result.row.encrypted).toBe(true); expect(result.row).not.toHaveProperty('blob');
  await page.evaluate(() => documentsQA.auth('TOKEN_REFRESHED', { user: documentsQA.user }));
  await expect(page.locator('[data-vault-passphrase]')).toHaveValue('synthetic-vault-password');
  await page.evaluate(() => documentsQA.switch({ id: 'B', email: 'b@example.invalid' }));
  await expect(page.locator('[data-vault-passphrase]')).toHaveValue(''); await expect(page.locator('[data-document-id]')).toHaveCount(0);
});
test('sign-out during upload leaves A cleanup intent and cannot create metadata', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.holdUpload = true; }); await upload(page);
  await expect.poll(() => page.evaluate(() => typeof documentsQA.releaseUpload)).toBe('function');
  await page.evaluate(() => { documentsQA.switch(null); documentsQA.releaseUpload(); });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-document-cleanup:A') || '[]').length)).toBe(1);
  expect(await page.evaluate(() => documentsQA.rows.length)).toBe(0); expect(await page.evaluate(() => documentsQA.removed.length)).toBe(0);
  await expect(page.locator('[data-vault-status]')).toContainText('יש להתחבר');
});
test('late metadata success belongs to A and cannot restore its passphrase in B', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.holdMetadata = true; }); await upload(page);
  await expect.poll(() => page.evaluate(() => typeof documentsQA.releaseMetadata)).toBe('function');
  await page.evaluate(() => { documentsQA.switch({ id: 'B', email: 'b@example.invalid' }); documentsQA.releaseMetadata(); });
  await expect.poll(() => page.evaluate(() => documentsQA.rows.length)).toBe(1);
  await expect(page.locator('[data-vault-passphrase]')).toHaveValue(''); await expect(page.locator('[data-document-id]')).toHaveCount(0);
  expect(await page.evaluate(() => documentsQA.rows[0].user_id)).toBe('A'); expect(await page.evaluate(() => documentsQA.removed.length)).toBe(0);
});
test('offline delete removes metadata and reconnect retries owner-scoped storage cleanup', async ({ page }) => {
  await boot(page); await upload(page); await expect(page.locator('[data-document-id]')).toHaveCount(1);
  await page.evaluate(() => { documentsQA.offline = true; }); page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-delete-document]').click(); await expect(page.locator('[data-vault-status]')).toContainText('ניקוי הקובץ');
  await expect(page.locator('[data-document-id]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-document-cleanup:A')).length)).toBe(1);
  await page.evaluate(() => { documentsQA.offline = false; dispatchEvent(new Event('online')); });
  await expect.poll(() => page.evaluate(() => documentsQA.removed.length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('travelmate-document-cleanup:A'))).toBeNull();
});
test('server upload limit failure is clear and the selected file can be retried', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.quota = true; }); await upload(page);
  await expect(page.locator('[data-vault-status]')).toContainText('חורג ממגבלת האחסון');
  await expect(page.locator('.vault-upload-button')).toBeEnabled(); expect(await page.evaluate(() => documentsQA.rows.length)).toBe(0);
  await page.evaluate(() => { documentsQA.quota = false; }); await page.locator('.vault-upload-button').click();
  await expect(page.locator('[data-vault-status]')).toContainText('נשמרו בהצלחה');
});
