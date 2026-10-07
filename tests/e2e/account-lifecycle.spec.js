const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../../trip/custom/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const trip = user => ({ id: 'same', ownerId: user, city: 'City ' + user, country: 'Italy', start: '2026-10-01', end: '2026-10-04', days: 4, budget: user === 'A' ? 1000 : 2000, type: 'סולו', expenses: [{ id: 'expense-' + user, note: 'PRIVATE EXPENSE ' + user, amount: 10, currency: 'EUR', date: '2026-10-01', category: 'אחר' }], memories: [{ id: 'memory-' + user, note: 'PRIVATE MEMORY ' + user, date: '2026-10-01T12:00:00Z' }], photoAlbumUrl: 'https://photos.google.com/' + user, budgetCategories: [] });
async function boot(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/trip/custom/index.html') return route.fulfill({ contentType: 'text/html', body: html });
    return route.continue();
  });
  await page.goto('/trip/custom/index.html?id=same');
  await page.evaluate(({ a, b }) => {
    localStorage.clear(); sessionStorage.clear();
    const snapshots = { A: [a], B: [b] };
    localStorage.setItem('travelmate-active-user', 'A');
    localStorage.setItem('travelmate-trips', JSON.stringify([a]));
    for (const user of ['A', 'B']) localStorage.setItem('travelmate-trips-user:' + user, JSON.stringify(snapshots[user]));
    localStorage.setItem('travelmate-eur-rates:EUR', JSON.stringify({ rate: 4, rates: { EUR: 1, ILS: 4 }, ilsRates: { EUR: .25, ILS: 1 }, date: new Date().toISOString(), source: 'Synthetic rates' }));
    const callbacks = []; let user = 'A'; const requests = []; const uploads = [];
    const session = () => user ? { user: { id: user }, expires_at: Math.floor(Date.now() / 1000) + 3600 } : null;
    const client = {
      auth: { getSession: async () => ({ data: { session: session() } }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }) }, onAuthStateChange(fn) { callbacks.push(fn); fn('INITIAL_SESSION', session()); return {}; } },
      functions: { invoke(name, options) { return new Promise((resolve, reject) => requests.push({ resolve, reject, options, user })); } },
      storage: { from: () => ({ upload: () => new Promise(resolve => uploads.push(resolve)), remove: async () => ({ data: [], error: null }) }) },
      rpc: async () => ({ data: [{ result_status: 'saved', result_revision: 1, result_updated_at: new Date().toISOString() }] })
    };
    window.__travelMateSupabaseClient = client;
    window.travelMateTripReady = Promise.resolve(a);
    window.qa = { requests, uploads, emit(next, event = next ? 'SIGNED_IN' : 'SIGNED_OUT') { user = next; callbacks.forEach(fn => fn(event, session())); }, resolve(index, answer) { requests[index].resolve({ data: { answer }, error: null }); } };
    client.auth.signOut = async () => { qa.emit(null); return { error: null }; };
    client.auth.signInWithPassword = async () => { qa.emit('B'); return { data: { session: session() }, error: null }; };
  }, { a: trip('A'), b: trip('B') });
  for (const name of ['cloud-sync', 'trip-store', 'event-contracts', 'trip-experience', 'ai-assistant', 'trip-intelligence']) await page.addScriptTag({ url: '/assets/' + name + '.js' });
  await expect(page.locator('[data-memory-list]')).toContainText('PRIVATE MEMORY A');
}
test('Budget, Memories and canonical empty values replace the previous account', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => qa.emit('B'));
  await expect(page.locator('[data-memory-list]')).toContainText('PRIVATE MEMORY B');
  await expect(page.locator('[data-memory-list]')).not.toContainText('PRIVATE MEMORY A');
  await expect(page.locator('[data-expense-records]')).toContainText('PRIVATE EXPENSE B');
  await expect(page.locator('[data-album-form] input')).toHaveValue('https://photos.google.com/B');
  await page.evaluate(() => {
    const canonical = TravelMateTripStore.getTrip('same'); canonical.memories = []; canonical.expenses = []; canonical.photoAlbumUrl = ''; canonical.budgetCategories = [];
    TravelMateTripStore.saveTrip(canonical, { queue: false });
    dispatchEvent(new CustomEvent('travelmate:canonical-trip-replaced', { detail: { userId: 'B', trip: canonical } }));
  });
  await expect(page.locator('[data-memory-list]')).not.toContainText('PRIVATE MEMORY');
  await expect(page.locator('[data-expense-records]')).not.toContainText('PRIVATE EXPENSE');
  await expect(page.locator('[data-album-form] input')).toHaveValue('');
  await page.evaluate(() => qa.emit(null));
  expect(await page.evaluate(() => TravelMateTripStore.getTrips())).toEqual([]);
});
test('Mate discards success and rejection from A while B can send immediately', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => dispatchEvent(new CustomEvent('travelmate:ask-ai', { detail: { prompt: 'A question' } })));
  await page.locator('.ai-composer').dispatchEvent('submit');
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(1);
  await page.evaluate(() => qa.emit('B'));
  await page.evaluate(() => dispatchEvent(new CustomEvent('travelmate:ask-ai', { detail: { prompt: 'B question' } })));
  await page.locator('.ai-composer').dispatchEvent('submit');
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(2);
  await page.evaluate(() => qa.requests[0].reject(new Error('PRIVATE A ERROR')));
  await expect(page.locator('.ai-chat')).not.toContainText('A question');
  expect(await page.locator('.ai-composer button[type=submit]').isDisabled()).toBe(true);
  await page.evaluate(() => qa.resolve(1, 'B ANSWER'));
  await expect(page.locator('.ai-chat')).toContainText('B ANSWER');
  await expect(page.locator('.ai-chat')).not.toContainText('PRIVATE A ERROR');
  await page.evaluate(() => qa.emit('B', 'TOKEN_REFRESHED'));
  await expect(page.locator('.ai-chat')).toContainText('B ANSWER');
});
test('pending recommendation and cached recommendation cannot cross accounts', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => TravelMateTripIntelligence.open(TravelMateTripIntelligence.normalizeContext({ id: 'same', city: 'City A', type: 'סולו' }, 'EXISTING_TRIP')));
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(1);
  await page.evaluate(() => qa.resolve(0, 'PRIVATE RECOMMENDATION A'));
  await expect(page.locator('[data-navo-content]')).toContainText('PRIVATE RECOMMENDATION A');
  await page.evaluate(() => qa.emit('B'));
  await expect(page.locator('.navo-intelligence-backdrop')).toBeHidden();
  await page.evaluate(() => TravelMateTripIntelligence.open(TravelMateTripIntelligence.normalizeContext({ id: 'same', city: 'City A', type: 'סולו' }, 'EXISTING_TRIP')));
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(2);
  await expect(page.locator('[data-navo-content]')).not.toContainText('PRIVATE RECOMMENDATION A');
  await page.evaluate(() => qa.emit(null));
  await page.evaluate(() => qa.resolve(1, 'PRIVATE RECOMMENDATION B'));
  await expect(page.locator('[data-navo-content]')).not.toContainText('PRIVATE RECOMMENDATION B');
});
test('pending memory upload cannot write into the next account trip', async ({ page }) => {
  await boot(page);
  await page.locator('[data-memory-form] textarea').fill('PRIVATE PENDING MEMORY A');
  await page.locator('[data-memory-form] input[type=file]').setInputFiles({ name: 'synthetic.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic QA data') });
  await page.locator('[data-memory-form]').dispatchEvent('submit');
  await expect.poll(() => page.evaluate(() => qa.uploads.length)).toBe(1);
  await page.evaluate(() => qa.emit('B'));
  await page.evaluate(() => qa.uploads[0]({ data: {}, error: null }));
  await expect(page.locator('[data-memory-list]')).not.toContainText('PRIVATE PENDING MEMORY A');
  expect(await page.evaluate(() => TravelMateTripStore.getTrip('same').memories.map(item => item.note))).toEqual(['PRIVATE MEMORY B']);
});
test('sign out and sign in through the Cloud API expose only account B state', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => TravelMateCloud.signOut());
  expect(await page.evaluate(() => TravelMateTripStore.getTrips())).toEqual([]);
  await expect(page.locator('[data-memory-list]')).not.toContainText('PRIVATE MEMORY A');
  await expect(page.locator('[data-expense-records]')).not.toContainText('PRIVATE EXPENSE A');
  await page.evaluate(() => TravelMateCloud.signIn('b@example.invalid', 'synthetic-test-password'));
  await expect(page.locator('[data-memory-list]')).toContainText('PRIVATE MEMORY B');
  expect(await page.evaluate(() => TravelMateTripStore.getTrips().map(item => item.ownerId))).toEqual(['B']);
});
test('a pending Mate continuation is rejected after account switch', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { window.qa.continuation = TravelMateNavo.continueResponse('PRIVATE PART A', [{ role: 'user', content: 'A' }], { id: 'same' }).then(() => 'accepted', error => error.message); });
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(1);
  await page.evaluate(() => qa.emit('B'));
  await page.evaluate(() => qa.resolve(0, 'PRIVATE CONTINUATION A'));
  expect(await page.evaluate(() => qa.continuation)).toBe('AI_REQUEST_STALE');
  await expect(page.locator('.ai-chat')).not.toContainText('PRIVATE CONTINUATION A');
});
test('receipt scan completion from A cannot fill the next account form', async ({ page }) => {
  await boot(page);
  await page.locator('[data-receipt-form] input[name=receiptFile]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('synthetic receipt QA data') });
  await page.locator('[data-receipt-scan]').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => qa.requests.length)).toBe(1);
  await page.evaluate(() => qa.emit('B'));
  await page.evaluate(() => qa.requests[0].resolve({ data: { receipt: { amount: 777, note: 'PRIVATE RECEIPT A', currency: 'EUR' } } }));
  await expect(page.locator('[data-receipt-form] input[name=amount]')).toHaveValue('');
  await expect(page.locator('[data-receipt-form] input[name=note]')).toHaveValue('');
});
test('the complete custom trip page reloads for B and exits on sign-out', async ({ page }) => {
  await boot(page);
  await page.route('**/trip/custom/index.html*', route => route.continue());
  await page.addInitScript(() => {
    const callbacks = [];
    let user = localStorage.getItem('travelmate-active-user') || null;
    const session = () => user ? { user: { id: user } } : null;
    window.qaActualEmit = next => { user = next; callbacks.forEach(fn => fn(next ? 'SIGNED_IN' : 'SIGNED_OUT', session())); };
    window.__travelMateSupabaseClient = { auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: fn => { callbacks.push(fn); fn('INITIAL_SESSION', session()); return {}; },
      signOut: async () => { qaActualEmit(null); return { error: null }; },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }) }
    } };
  });
  await page.reload();
  await expect(page.locator('.hero')).toContainText('City A');
  await page.evaluate(() => qaActualEmit('B'));
  await expect(page.locator('.hero')).toContainText('City B');
  expect(await page.evaluate(() => TravelMateTripStore.getTrips().map(item => item.ownerId))).toEqual(['B']);
  await page.evaluate(() => TravelMateCloud.signOut());
  await expect(page).toHaveURL(/\/index\.html$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('travelmate-trips')))).toEqual([]);
});
