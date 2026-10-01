const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ownedClaim(claim) {
  return claim && UUID.test(claim.user_id) && UUID.test(claim.upload_id)
    && UUID.test(claim.object_id) && UUID.test(claim.claim_token)
    && typeof claim.storage_path === 'string'
    && claim.storage_path.startsWith(claim.user_id + '/')
    && !claim.storage_path.includes('\\')
    && claim.storage_path.split('/').every(part => part && part !== '.' && part !== '..');
}

async function rpc(service, name, args) {
  const result = await service.rpc(name, args);
  if (result.error) throw new Error('RECOVERY_RPC_FAILED');
  return result.data;
}

export async function reconcileDocuments(service) {
  const claims = await rpc(service, 'claim_document_cleanup', { p_limit: 25 });
  const totals = { claimed: 0, attempted: 0, failed: 0, skipped: 0 };
  for (const claim of claims || []) {
    totals.claimed++;
    if (!ownedClaim(claim)) { totals.skipped++; continue; }
    const args = { p_upload_id: claim.upload_id, p_claim_token: claim.claim_token };
    try {
      // Only database-issued, still-valid fenced claims reach the Storage API.
      if (await rpc(service, 'authorize_document_cleanup', args) !== true) { totals.skipped++; continue; }
      const removed = await service.storage.from('travel-documents').remove([claim.storage_path]);
      totals.attempted++;
      if (removed.error) totals.failed++;
      // The database verifies actual object absence, even after a lost API reply.
      await rpc(service, 'finish_document_cleanup', { ...args, p_failed: Boolean(removed.error) });
    } catch (_) {
      totals.failed++;
      await rpc(service, 'finish_document_cleanup', { ...args, p_failed: true });
    }
  }
  return totals;
}

async function sameSecret(received, expected) {
  if (!expected || expected.length < 32 || !received) return false;
  const digest = text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(received), digest(expected)]);
  let difference = 0;
  new Uint8Array(a).forEach((byte, index) => { difference |= byte ^ new Uint8Array(b)[index]; });
  return difference === 0;
}

export function recoveryHandler({ getEnv, createService }) {
  const reply = (body, status) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  return async request => {
    if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!await sameSecret(token, getEnv('DOCUMENT_RECOVERY_SECRET'))) return reply({ error: 'UNAUTHORIZED' }, 401);
    // Deliberately disabled until separately authorized deployment and staging validation.
    if (getEnv('DOCUMENT_RECOVERY_ENABLED') !== 'true') return reply({ error: 'RECOVERY_DISABLED' }, 503);
    try { return reply(await reconcileDocuments(createService()), 200); }
    catch (_) { return reply({ error: 'RECOVERY_RETRY_REQUIRED' }, 503); }
  };
}
