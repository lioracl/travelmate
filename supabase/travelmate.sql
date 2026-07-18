-- TravelMate private document vault
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.travel_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size >= 0 and file_size <= 26214400),
  category text not null default 'אחר',
  note text not null default '',
  encrypted boolean not null default true,
  encryption_salt text,
  encryption_iv text,
  created_at timestamptz not null default now(),
  constraint encrypted_file_has_parameters check (
    not encrypted or (encryption_salt is not null and encryption_iv is not null)
  )
);

create index if not exists travel_documents_user_trip_created_idx
  on public.travel_documents (user_id, trip_id, created_at desc);

alter table public.travel_documents enable row level security;

drop policy if exists "Users read their own travel documents" on public.travel_documents;
create policy "Users read their own travel documents"
  on public.travel_documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own travel documents" on public.travel_documents;
create policy "Users add their own travel documents"
  on public.travel_documents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own travel documents" on public.travel_documents;
create policy "Users update their own travel documents"
  on public.travel_documents for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own travel documents" on public.travel_documents;
create policy "Users delete their own travel documents"
  on public.travel_documents for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'travel-documents',
  'travel-documents',
  false,
  26214400,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read files in their own folder" on storage.objects;
create policy "Users read files in their own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'travel-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users upload files to their own folder" on storage.objects;
create policy "Users upload files to their own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'travel-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete files from their own folder" on storage.objects;
create policy "Users delete files from their own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'travel-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

revoke all on table public.travel_documents from anon;
grant select, insert, update, delete on table public.travel_documents to authenticated;

-- Cloud-synced trips. The payload stores the complete trip state, including
-- activities, day notes, saved places and future backwards-compatible fields.
create table if not exists public.travel_trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  country text not null,
  city text not null,
  start_date date not null,
  end_date date not null,
  budget numeric not null default 0 check (budget >= 0),
  trip_type text not null default 'סולו',
  days integer not null check (days between 1 and 60),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists travel_trips_user_updated_idx
  on public.travel_trips (user_id, updated_at desc);

alter table public.travel_trips enable row level security;

drop policy if exists "Users read their own trips" on public.travel_trips;
create policy "Users read their own trips"
  on public.travel_trips for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own trips" on public.travel_trips;
create policy "Users add their own trips"
  on public.travel_trips for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own trips" on public.travel_trips;
create policy "Users update their own trips"
  on public.travel_trips for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own trips" on public.travel_trips;
create policy "Users delete their own trips"
  on public.travel_trips for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.travel_trips from anon;
grant select, insert, update, delete on table public.travel_trips to authenticated;

-- Daily AI usage accounting. No prompts or responses are stored here.
create table if not exists public.travel_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.travel_ai_usage enable row level security;
revoke all on table public.travel_ai_usage from anon, authenticated;

create or replace function public.consume_travel_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer;
  daily_limit constant integer := 60;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.travel_ai_usage (user_id, usage_date, request_count, last_requested_at)
  values (current_user_id, (now() at time zone 'utc')::date, 1, now())
  on conflict (user_id, usage_date) do update
    set request_count = public.travel_ai_usage.request_count + 1,
        last_requested_at = now()
    where public.travel_ai_usage.request_count < daily_limit
  returning request_count into current_count;

  if current_count is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', daily_limit);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', daily_limit - current_count, 'limit', daily_limit);
end;
$$;

revoke all on function public.consume_travel_ai_request() from public, anon;
grant execute on function public.consume_travel_ai_request() to authenticated;
