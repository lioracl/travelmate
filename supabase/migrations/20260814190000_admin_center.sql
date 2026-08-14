-- TravelMate global administration. Apply through Supabase migrations.
-- Browser clients never receive the service-role key and cannot grant themselves roles.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin(required_role text default 'admin')
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
      and (required_role = 'admin' or role = 'super_admin')
  );
$$;

revoke all on function public.is_app_admin(text) from public;
grant execute on function public.is_app_admin(text) to authenticated;

alter table public.app_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins can read administrator roles" on public.app_admins;
create policy "Admins can read administrator roles" on public.app_admins
  for select to authenticated using (public.is_app_admin());

drop policy if exists "Authenticated users read public app settings" on public.app_settings;
create policy "Authenticated users read public app settings" on public.app_settings
  for select to authenticated using (true);

drop policy if exists "Admins can read audit log" on public.admin_audit_log;
create policy "Admins can read audit log" on public.admin_audit_log
  for select to authenticated using (public.is_app_admin());

revoke all on table public.app_admins from anon, authenticated;
revoke all on table public.app_settings from anon;
revoke insert, update, delete on table public.app_settings from authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;
grant select on table public.app_admins to authenticated;
grant select on table public.app_settings to authenticated;
grant select on table public.admin_audit_log to authenticated;

insert into public.app_settings (key, value)
values
  ('announcement', '{"enabled":false,"text":""}'::jsonb),
  ('features', '{"newTrips":true,"aiAssistant":true,"collaboration":true}'::jsonb)
on conflict (key) do nothing;

-- One-time bootstrap requested by the owner. This UUID is an identifier, not a credential.
insert into public.app_admins (user_id, role, created_by)
values ('38846d5e-22f4-4155-b4d5-d59aa71b1f3f'::uuid, 'super_admin', '38846d5e-22f4-4155-b4d5-d59aa71b1f3f'::uuid)
on conflict (user_id) do update set role = excluded.role;
