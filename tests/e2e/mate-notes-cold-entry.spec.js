const { test, expect } = require('@playwright/test');

// Synthetic module/DOM acceptance; full-app and real service-worker acceptance are separate.
async function boot(page, pending = false) {
  await page.route('**/mate-notes-fixture', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><body data-trip-id="same-trip"><section id="documents"><div class="doc-list"></div></section></body>' }));
  await page.goto('/mate-notes-fixture');
  await page.evaluate(pending => {
    const note = id => ({ id, question: 'Synthetic ' + id, answer: '**Synthetic** answer', createdAt: '2026-10-20T00:00:00Z' });
    const trip = ownerId => ({ id: 'same-trip', ownerId, cloudRevision: 7, budget: 50, aiNotes: [note(ownerId + '-old')] });
    const qa = window.notesQA = { note, trip, records: [trip('A')], saves: [], copied: [], refreshes: 0 };
    localStorage.setItem('travelmate-active-user', 'A');
    qa.replace = records => { qa.records = records; dispatchEvent(new CustomEvent('travelmate:local-trips-updated')); };
    qa.switch = owner => {
      localStorage.setItem('travelmate-active-user', owner);
      qa.records = [trip(owner)];
      dispatchEvent(new CustomEvent('travelmate:account-context-changed', { detail: { userId: owner } }));
    };
    window.TravelMateTripStore = {
      getTrips: () => JSON.parse(JSON.stringify(qa.records)),
      saveTrip: value => { qa.saves.push(value); qa.replace(qa.records.map(t => t.id === value.id && t.ownerId === value.ownerId ? value : t)); }
    };
    window.TravelMateDocuments = { refresh: () => qa.refreshes++ };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: value => { qa.copied.push(value); return Promise.resolve(); } } });
    if (pending) window.travelMateTripReady = new Promise(resolve => { qa.release = resolve; });
  }, pending);
  await page.addScriptTag({ url: '/assets/mate-notes.js' });
}

test('cold module renders exactly one ordinary archive without loading assistant or voice', async ({ page }) => {
  const requests = []; page.on('request', request => requests.push(new URL(request.url()).pathname));
  await boot(page);
  await expect(page.locator('[data-ai-notes-archive]')).toHaveCount(1);
  await expect(page.locator('[data-ai-note-id="A-old"]')).toHaveCount(1);
  await page.addScriptTag({ url: '/assets/mate-notes.js' });
  await expect(page.locator('[data-ai-notes-archive]')).toHaveCount(1);
  expect(requests.filter(path => /ai-assistant|voice|settings/.test(path))).toEqual([]);
  expect(await page.evaluate(() => notesQA.saves)).toEqual([]);
});

test('canonical update preserves expanded row and focused control while stale delete keeps latest revision', async ({ page }) => {
  await boot(page);
  const row = page.locator('[data-ai-note-id="A-old"]');
  await row.locator('summary').click(); await row.locator('[data-delete-ai-note]').focus();
  await page.evaluate(() => { const t = notesQA.trip('A'); t.aiNotes.unshift(notesQA.note('late')); t.cloudRevision = 9; t.budget = 99; notesQA.replace([t]); });
  await expect(row).toHaveAttribute('open', '');
  await expect(row.locator('[data-delete-ai-note]')).toBeFocused();
  await row.locator('[data-delete-ai-note]').click();
  expect(await page.evaluate(() => notesQA.saves.map(t => ({ ids: t.aiNotes.map(n => n.id), revision: t.cloudRevision, budget: t.budget })))).toEqual([{ ids: ['late'], revision: 9, budget: 99 }]);
  await expect(page.locator('[data-ai-note-id="late"]')).toHaveCount(1);
});

test('detached archive handler cannot delete a new account record', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const archive = document.querySelector('[data-ai-notes-archive]');
    const handler = archive.onclick, target = archive.querySelector('[data-delete-ai-note]');
    notesQA.switch('B'); handler({ target });
  });
  await expect(page.locator('[data-ai-note-id="A-old"]')).toHaveCount(0);
  await expect(page.locator('[data-ai-note-id="B-old"]')).toHaveCount(1);
  expect(await page.evaluate(() => notesQA.saves)).toEqual([]);
});

test('late canonical copy uses revised content and never a removed record', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const t = notesQA.trip('A'); t.aiNotes[0].answer = 'Synthetic revised answer'; notesQA.replace([t]); });
  const row = page.locator('[data-ai-note-id="A-old"]'); await row.locator('summary').click(); await row.locator('[data-copy-ai-note]').click();
  expect(await page.evaluate(() => notesQA.copied)).toEqual(['Synthetic A-old\n\nSynthetic revised answer']);
  await page.evaluate(() => { const archive = document.querySelector('[data-ai-notes-archive]'), handler = archive.onclick, target = archive.querySelector('[data-copy-ai-note]'); const t = notesQA.trip('A'); t.aiNotes = []; notesQA.replace([t]); handler({ target }); });
  expect(await page.evaluate(() => notesQA.copied)).toHaveLength(1);
  await expect(page.locator('.ai-notes-empty')).toHaveCount(1);
});

test('pending hydration selects canonical shared owner despite colliding cached ID', async ({ page }) => {
  await boot(page, true); await expect(page.locator('[data-ai-note-id]')).toHaveCount(0);
  await page.evaluate(() => { notesQA.replace([notesQA.trip('A'), notesQA.trip('shared-owner')]); notesQA.release(notesQA.trip('shared-owner')); });
  await expect(page.locator('[data-ai-note-id="shared-owner-old"]')).toHaveCount(1);
  await expect(page.locator('[data-ai-note-id="A-old"]')).toHaveCount(0);
  await page.locator('[data-ai-note-id] summary').click(); await page.locator('[data-delete-ai-note]').click();
  expect(await page.evaluate(() => ({ savedOwner: notesQA.saves[0].ownerId, untouched: notesQA.records[0].aiNotes.length }))).toEqual({ savedOwner: 'shared-owner', untouched: 1 });
});

test('account switch during pending initialization rejects former-account completion', async ({ page }) => {
  await boot(page, true);
  await page.evaluate(() => { notesQA.switch('B'); notesQA.release(notesQA.trip('A')); });
  await expect(page.locator('[data-ai-note-id="B-old"]')).toHaveCount(1);
  await expect(page.locator('[data-ai-note-id="A-old"]')).toHaveCount(0);
  expect(await page.evaluate(() => notesQA.saves)).toEqual([]);
});

test('archive remount reconstructs unchanged canonical notes', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { document.querySelector('[data-ai-notes-archive]').remove(); TravelMateMateNotes.refresh(); });
  await expect(page.locator('[data-ai-notes-archive]')).toHaveCount(1);
  await expect(page.locator('[data-ai-note-id="A-old"]')).toHaveCount(1);
  expect(await page.evaluate(() => notesQA.saves)).toEqual([]);
});
