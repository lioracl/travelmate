-- Shared trips, invitation links and persistent group chat.
alter table public.travel_trips
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.trip_members (
  trip_owner_id uuid not null,
  trip_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'מטייל',
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (trip_owner_id, trip_id, user_id),
  foreign key (trip_owner_id, trip_id) references public.travel_trips(user_id, id) on delete cascade
);

create index if not exists trip_members_user_idx on public.trip_members (user_id, joined_at desc);
alter table public.trip_members enable row level security;

create or replace function public.is_trip_member(p_owner uuid, p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_owner_id = p_owner and trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_trip(p_owner uuid, p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_owner_id = p_owner and trip_id = p_trip_id and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

revoke all on function public.is_trip_member(uuid, text) from public, anon;
revoke all on function public.can_edit_trip(uuid, text) from public, anon;
grant execute on function public.is_trip_member(uuid, text) to authenticated;
grant execute on function public.can_edit_trip(uuid, text) to authenticated;

insert into public.trip_members (trip_owner_id, trip_id, user_id, display_name, role)
select t.user_id, t.id, t.user_id,
       coalesce(nullif(split_part(u.email, '@', 1), ''), 'מארגן הטיול'), 'owner'
from public.travel_trips t
left join auth.users u on u.id = t.user_id
on conflict (trip_owner_id, trip_id, user_id) do nothing;

create or replace function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_name text;
begin
  select coalesce(nullif(split_part(email, '@', 1), ''), 'מארגן הטיול') into owner_name
  from auth.users where id = new.user_id;
  insert into public.trip_members (trip_owner_id, trip_id, user_id, display_name, role)
  values (new.user_id, new.id, new.user_id, coalesce(owner_name, 'מארגן הטיול'), 'owner')
  on conflict (trip_owner_id, trip_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists add_trip_owner_member_trigger on public.travel_trips;
create trigger add_trip_owner_member_trigger
after insert on public.travel_trips
for each row execute function public.add_trip_owner_member();

drop policy if exists "Users read their own trips" on public.travel_trips;
drop policy if exists "Members read shared trips" on public.travel_trips;
create policy "Members read shared trips"
  on public.travel_trips for select to authenticated
  using (public.is_trip_member(user_id, id));

drop policy if exists "Users add their own trips" on public.travel_trips;
create policy "Owners create trips"
  on public.travel_trips for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own trips" on public.travel_trips;
drop policy if exists "Editors update shared trips" on public.travel_trips;
create policy "Editors update shared trips"
  on public.travel_trips for update to authenticated
  using (public.can_edit_trip(user_id, id))
  with check (public.can_edit_trip(user_id, id));

drop policy if exists "Users delete their own trips" on public.travel_trips;
create policy "Owners delete trips"
  on public.travel_trips for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members see trip members" on public.trip_members;
create policy "Members see trip members"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_owner_id, trip_id));

drop policy if exists "Owners manage trip members" on public.trip_members;
create policy "Owners manage trip members"
  on public.trip_members for update to authenticated
  using ((select auth.uid()) = trip_owner_id)
  with check ((select auth.uid()) = trip_owner_id and (user_id <> trip_owner_id or role = 'owner'));

drop policy if exists "Members leave trips" on public.trip_members;
create policy "Members leave trips"
  on public.trip_members for delete to authenticated
  using (user_id <> trip_owner_id and ((select auth.uid()) = user_id or (select auth.uid()) = trip_owner_id));

revoke all on table public.trip_members from anon;
grant select, update, delete on table public.trip_members to authenticated;

create table if not exists public.trip_invites (
  token uuid primary key default gen_random_uuid(),
  trip_owner_id uuid not null,
  trip_id text not null,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  use_count integer not null default 0,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  foreign key (trip_owner_id, trip_id) references public.travel_trips(user_id, id) on delete cascade
);

alter table public.trip_invites enable row level security;
revoke all on table public.trip_invites from anon, authenticated;

create or replace function public.create_trip_invite(p_trip_owner_id uuid, p_trip_id text, p_role text default 'editor')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid;
begin
  if auth.uid() is null or auth.uid() <> p_trip_owner_id then
    raise exception 'Only the trip owner can create invitations' using errcode = '42501';
  end if;
  if not public.is_trip_member(p_trip_owner_id, p_trip_id) then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;
  insert into public.trip_invites (trip_owner_id, trip_id, role, created_by)
  values (p_trip_owner_id, p_trip_id,
          case when p_role = 'viewer' then 'viewer' else 'editor' end, auth.uid())
  returning token into new_token;
  return new_token;
end;
$$;

create or replace function public.accept_trip_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.trip_invites%rowtype;
  member_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into invitation from public.trip_invites
  where token = p_token and expires_at > now() and use_count < max_uses
  for update;
  if not found then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;
  member_name := coalesce(nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''), 'מטייל');
  insert into public.trip_members (trip_owner_id, trip_id, user_id, display_name, role)
  values (invitation.trip_owner_id, invitation.trip_id, auth.uid(), member_name, invitation.role)
  on conflict (trip_owner_id, trip_id, user_id) do update
    set display_name = excluded.display_name;
  update public.trip_invites set use_count = use_count + 1 where token = p_token;
  return jsonb_build_object('owner_id', invitation.trip_owner_id, 'trip_id', invitation.trip_id);
end;
$$;

revoke all on function public.create_trip_invite(uuid, text, text) from public, anon;
revoke all on function public.accept_trip_invite(uuid) from public, anon;
grant execute on function public.create_trip_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_trip_invite(uuid) to authenticated;

create table if not exists public.trip_messages (
  id bigint generated by default as identity primary key,
  trip_owner_id uuid not null,
  trip_id text not null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (trip_owner_id, trip_id) references public.travel_trips(user_id, id) on delete cascade
);

create index if not exists trip_messages_trip_created_idx
  on public.trip_messages (trip_owner_id, trip_id, created_at desc);
alter table public.trip_messages enable row level security;

create policy "Members read trip messages"
  on public.trip_messages for select to authenticated
  using (public.is_trip_member(trip_owner_id, trip_id));
create policy "Members send trip messages"
  on public.trip_messages for insert to authenticated
  with check ((select auth.uid()) = sender_user_id and public.is_trip_member(trip_owner_id, trip_id));
create policy "Senders delete trip messages"
  on public.trip_messages for delete to authenticated
  using ((select auth.uid()) = sender_user_id or (select auth.uid()) = trip_owner_id);

revoke all on table public.trip_messages from anon;
grant select, insert, delete on table public.trip_messages to authenticated;
grant usage, select on sequence public.trip_messages_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'travel_trips'
  ) then alter publication supabase_realtime add table public.travel_trips; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members'
  ) then alter publication supabase_realtime add table public.trip_members; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_messages'
  ) then alter publication supabase_realtime add table public.trip_messages; end if;
end $$;
