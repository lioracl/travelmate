import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const allowedOrigins = new Set([
  'https://lioracl.github.io',
  'http://127.0.0.1:8000',
  'http://localhost:8000'
]);

function headers(origin: string) {
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://lioracl.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
}

function reply(origin: string, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function safeText(value: unknown, limit = 500) {
  return String(value || '').trim().slice(0, limit);
}

function jwtPayload(token: string) {
  try {
    let part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    part += '='.repeat((4 - part.length % 4) % 4);
    return JSON.parse(atob(part));
  } catch (_) {
    return {};
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || 'https://lioracl.github.io';
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(origin) });
  if (request.method !== 'POST' || !allowedOrigins.has(origin)) return reply(origin, { error: 'REQUEST_NOT_ALLOWED' }, 403);

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token) return reply(origin, { error: 'AUTH_REQUIRED' }, 401);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !publicKey || !serviceKey) return reply(origin, { error: 'SERVER_NOT_CONFIGURED' }, 500);

  const authClient = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userResult = await authClient.auth.getUser(token);
  const user = userResult.data.user;
  if (userResult.error || !user) return reply(origin, { error: 'INVALID_SESSION' }, 401);

  const roleResult = await service.from('app_admins').select('role').eq('user_id', user.id).maybeSingle();
  if (roleResult.error || !roleResult.data) return reply(origin, { error: 'ADMIN_REQUIRED' }, 403);
  const role = roleResult.data.role;

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch (_) {}
  const action = safeText(body.action, 80) || 'status';
  const sensitive = new Set(['update-user', 'update-role', 'update-settings']);
  if (sensitive.has(action) && jwtPayload(token).aal !== 'aal2') {
    return reply(origin, { error: 'MFA_REQUIRED', message: 'יש לאמת קוד דו־שלבי לפני פעולה רגישה.' }, 403);
  }

  async function audit(name: string, targetUserId?: string, details: Record<string, unknown> = {}) {
    await service.from('admin_audit_log').insert({ admin_user_id: user!.id, action: name, target_user_id: targetUserId || null, details });
  }

  if (action === 'status') return reply(origin, { admin: true, role });

  if (action === 'list-users') {
    const page = Math.max(1, Math.min(100, Number(body.page || 1)));
    const usersResult = await service.auth.admin.listUsers({ page, perPage: 50 });
    if (usersResult.error) return reply(origin, { error: usersResult.error.message }, 400);
    const adminRows = await service.from('app_admins').select('user_id,role');
    const roles = new Map((adminRows.data || []).map((row) => [row.user_id, row.role]));
    const users = usersResult.data.users.map((entry) => ({
      id: entry.id,
      email: entry.email || '',
      createdAt: entry.created_at,
      lastSignInAt: entry.last_sign_in_at,
      bannedUntil: entry.banned_until || null,
      role: roles.get(entry.id) || 'user'
    }));
    return reply(origin, { users, total: usersResult.data.total || users.length, page, role });
  }

  if (action === 'update-user') {
    const target = safeText(body.userId, 60);
    const enabled = Boolean(body.enabled);
    if (!target || target === user.id) return reply(origin, { error: 'INVALID_TARGET' }, 400);
    const update = await service.auth.admin.updateUserById(target, { ban_duration: enabled ? 'none' : '876000h' });
    if (update.error) return reply(origin, { error: update.error.message }, 400);
    await audit(enabled ? 'user.enabled' : 'user.disabled', target);
    return reply(origin, { ok: true });
  }

  if (action === 'update-role') {
    if (role !== 'super_admin') return reply(origin, { error: 'SUPER_ADMIN_REQUIRED' }, 403);
    const target = safeText(body.userId, 60);
    const nextRole = safeText(body.role, 30);
    if (!target || target === user.id || !['user', 'admin'].includes(nextRole)) return reply(origin, { error: 'INVALID_ROLE_CHANGE' }, 400);
    const result = nextRole === 'user'
      ? await service.from('app_admins').delete().eq('user_id', target)
      : await service.from('app_admins').upsert({ user_id: target, role: 'admin', created_by: user.id });
    if (result.error) return reply(origin, { error: result.error.message }, 400);
    await audit('role.updated', target, { role: nextRole });
    return reply(origin, { ok: true });
  }

  if (action === 'settings') {
    const settings = await service.from('app_settings').select('key,value,updated_at').order('key');
    return settings.error ? reply(origin, { error: settings.error.message }, 400) : reply(origin, { settings: settings.data || [] });
  }

  if (action === 'update-settings') {
    const key = safeText(body.key, 80);
    const allowedKeys = new Set(['announcement', 'features']);
    if (!allowedKeys.has(key) || !body.value || typeof body.value !== 'object') return reply(origin, { error: 'INVALID_SETTING' }, 400);
    const result = await service.from('app_settings').upsert({ key, value: body.value, updated_by: user.id, updated_at: new Date().toISOString() });
    if (result.error) return reply(origin, { error: result.error.message }, 400);
    await audit('settings.updated', undefined, { key });
    return reply(origin, { ok: true });
  }

  if (action === 'audit') {
    const log = await service.from('admin_audit_log').select('id,admin_user_id,action,target_user_id,details,created_at').order('created_at', { ascending: false }).limit(100);
    return log.error ? reply(origin, { error: log.error.message }, 400) : reply(origin, { events: log.data || [] });
  }

  return reply(origin, { error: 'UNKNOWN_ACTION' }, 400);
});
