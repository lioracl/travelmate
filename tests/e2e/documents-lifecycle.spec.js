const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.route('**/documents-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><body data-trip-id="synthetic-trip"><section id="documents"><div class="section-head"></div><div data-documents-library></div><div data-document-category-list><article class="doc-row" data-document-group="personal"><strong>אישי</strong><button>העלאה</button></article></div></section></body>' }));
  await page.goto('/documents-fixture');
  await page.evaluate(() => {
    const qa = window.documentsQA = { user: { id: 'A', email: 'a@example.invalid' }, rows: [], uploaded: [], removed: [], journals: [], cleanupIntents: [], holdUpload: false, holdMetadata: false, holdJournal: false, offline: false, quota: false };
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: qa.user } } }), onAuthStateChange: fn => { qa.auth = fn; } },
      storage: { from: () => ({
        upload: async (path, blob) => { qa.uploaded.push({ path, size: blob.size }); if (qa.holdUpload) await new Promise(resolve => { qa.releaseUpload = resolve; }); return qa.quota ? { error: { code: 'EntityTooLarge', message: 'exceeded maximum allowed size' } } : {}; },
        remove: async paths => { if (qa.offline) throw new Error('network offline'); qa.removed.push(...paths); return {}; }
      }) },
      rpc: async (name,args) => {
        if (name === 'begin_document_upload') {
          if (qa.journalUnavailable) return { error: { code: 'PGRST202', message: 'begin_document_upload unavailable' } };
          if (args.p_expected_owner !== qa.user.id) return { error: new Error('DOCUMENT_SESSION_CHANGED') };
          const upload_id = crypto.randomUUID();
          const journal = { upload_id, user_id: qa.user.id, storage_path: qa.user.id + '/__lifecycle_v1/' + upload_id + '.vault', state: 'pending' };
          qa.journals.push(journal);
          if (qa.holdJournal) await new Promise(resolve => { qa.releaseJournal = resolve; });
          return { data: [journal] };
        }
        const journal = qa.journals.find(j => j.upload_id === args.p_upload_id);
        if (journal && journal.state === 'pending') journal.state = 'cleanup_requested';
        return {};
      },
      from: () => {
        let operation = 'select'; const filters = [];
        const query = {
          select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, limit() { return query; },
          delete() { operation = 'delete'; return query; },
          async insert(row) { if (qa.holdMetadata) await new Promise(resolve => { qa.releaseMetadata = resolve; }); qa.rows.push({ ...row, id: 'synthetic-id', created_at: '2026-10-01T00:00:00Z' }); qa.journals.find(j => j.storage_path === row.storage_path).state = 'committed'; return {}; },
          then(resolve, reject) { return Promise.resolve().then(() => {
            const matches = row => filters.every(([key, value]) => row[key] === value);
            const data = qa.rows.filter(matches); if (operation === 'delete') { qa.rows = qa.rows.filter(row => !matches(row)); qa.cleanupIntents.push(...data.map(row => ({ user_id: row.user_id, storage_path: row.storage_path }))); }
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
  expect(result.upload.path).toMatch(/^A\/__lifecycle_v1\/.+\.vault$/); expect(result.upload.size).toBe(Buffer.byteLength('synthetic document') + 16);
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
  await expect.poll(() => page.evaluate(() => documentsQA.journals.length)).toBe(1);
  expect(await page.evaluate(() => documentsQA.journals[0].user_id)).toBe('A');
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
test('offline cleanup and reconnect retain server deletion intent without browser blob deletion', async ({ page }) => {
  await boot(page); await upload(page); await expect(page.locator('[data-document-id]')).toHaveCount(1);
  await page.evaluate(() => { documentsQA.offline = true; }); page.on('dialog', dialog => dialog.accept());
  await page.locator('[data-delete-document]').click(); await expect(page.locator('[data-vault-status]')).toContainText('ניקוי הקובץ');
  await expect(page.locator('[data-document-id]')).toHaveCount(0);
  expect(await page.evaluate(() => documentsQA.cleanupIntents.length)).toBe(1);
  await page.evaluate(() => { documentsQA.offline = false; dispatchEvent(new Event('online')); });
  expect(await page.evaluate(() => documentsQA.removed.length)).toBe(0);
  expect(await page.evaluate(() => documentsQA.cleanupIntents[0].user_id)).toBe('A');
  expect(await page.evaluate(() => localStorage.getItem('travelmate-document-cleanup:A'))).toBeNull();
});
test('account switch while journal preparation is pending cannot start upload', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.holdJournal = true; }); await upload(page);
  await expect.poll(() => page.evaluate(() => typeof documentsQA.releaseJournal)).toBe('function');
  await page.evaluate(() => { documentsQA.switch({ id: 'B', email: 'b@example.invalid' }); documentsQA.releaseJournal(); });
  await expect(page.locator('[data-vault-email]')).toHaveText('b@example.invalid');
  expect(await page.evaluate(() => documentsQA.uploaded.length)).toBe(0);
  expect(await page.evaluate(() => documentsQA.journals[0].user_id)).toBe('A');
});
test('duplicate form submission while journal request is pending creates one intent', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.holdJournal = true; }); await upload(page);
  await expect.poll(() => page.evaluate(() => typeof documentsQA.releaseJournal)).toBe('function');
  await page.evaluate(() => document.querySelector('[data-vault-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(await page.evaluate(() => documentsQA.journals.length)).toBe(1);
  await page.evaluate(() => documentsQA.releaseJournal()); await expect(page.locator('[data-vault-status]')).toContainText('נשמרו בהצלחה');
  expect(await page.evaluate(() => documentsQA.uploaded.length)).toBe(1);
});
test('missing journal service fails before upload and supports a retry after recovery', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.journalUnavailable = true; }); await upload(page);
  await expect(page.locator('[data-vault-status]')).toContainText('שירות ההעלאה המאובטחת עדיין אינו זמין');
  expect(await page.evaluate(() => documentsQA.uploaded.length)).toBe(0);
  expect(await page.evaluate(() => documentsQA.rows.length)).toBe(0);
  await expect(page.locator('.vault-upload-button')).toBeEnabled();
  await page.evaluate(() => { documentsQA.journalUnavailable = false; }); await page.locator('.vault-upload-button').click();
  await expect(page.locator('[data-vault-status]')).toContainText('נשמרו בהצלחה');
});
test('server upload limit failure is clear and the selected file can be retried', async ({ page }) => {
  await boot(page); await page.evaluate(() => { documentsQA.quota = true; }); await upload(page);
  await expect(page.locator('[data-vault-status]')).toContainText('חורג ממגבלת האחסון');
  await expect(page.locator('.vault-upload-button')).toBeEnabled(); expect(await page.evaluate(() => documentsQA.rows.length)).toBe(0);
  await page.evaluate(() => { documentsQA.quota = false; }); await page.locator('.vault-upload-button').click();
  await expect(page.locator('[data-vault-status]')).toContainText('נשמרו בהצלחה');
});
