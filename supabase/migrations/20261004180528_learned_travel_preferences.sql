-- TravelMate 2.15: reviewed learned preferences with server-validated provenance.

create or replace function public.travelmate_valid_learned_evidence(p_evidence jsonb, p_active boolean)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  source_trip text;
  event_ref text;
  event_kind text;
  trip_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 12 then
    return false;
  end if;
  if p_active and jsonb_array_length(p_evidence) < 2 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_evidence)
  loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if exists (
      select 1 from jsonb_object_keys(item) as keys(k)
      where k not in ('sourceTripId', 'eventKind', 'eventRef')
    ) then return false; end if;
    if not (item ? 'sourceTripId' and item ? 'eventKind' and item ? 'eventRef') then return false; end if;

    source_trip := item ->> 'sourceTripId';
    event_kind := item ->> 'eventKind';
    event_ref := item ->> 'eventRef';
    if source_trip is null or char_length(source_trip) not between 1 and 120 then return false; end if;
    if event_ref is null or char_length(event_ref) not between 1 and 160 then return false; end if;
    if event_kind not in ('completed_activity', 'completed_place') then return false; end if;
    trip_ids := array_append(trip_ids, source_trip);
  end loop;

  if p_active and (select count(distinct value) from unnest(trip_ids) as value) < 2 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.travelmate_category_matches_interest(p_category text, p_interest text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  c text := lower(coalesce(p_category, ''));
begin
  case p_interest
    when 'culture' then return c like any (array['%culture%','%תרבות%','%museum%','%מוזיאון%','%art%','%אמנות%','%gallery%','%גלריה%']);
    when 'history' then return c like any (array['%history%','%histor%','%היסטוריה%','%historic%','%old town%','%עיר עתיקה%','%castle%','%טירה%']);
    when 'food' then return c like any (array['%food%','%אוכל%','%restaurant%','%מסעדה%','%cafe%','%בית קפה%','%culinary%','%מטבח%']);
    when 'nature' then return c like any (array['%nature%','%טבע%','%park%','%פארק%','%garden%','%גן%','%hiking%','%הליכה%','%trail%','%שביל%']);
    when 'shopping' then return c like any (array['%shopping%','%קניות%','%mall%','%קניון%','%market%','%שוק%','%outlet%']);
    when 'nightlife' then return c like any (array['%nightlife%','%חיי לילה%','%bar%','%מועדון%','%club%','%pub%']);
    when 'photography' then return c like any (array['%photography%','%צילום%','%viewpoint%','%תצפית%','%scenic%','%נוף%']);
    when 'relaxation' then return c like any (array['%relaxation%','%מנוחה%','%spa%','%ספא%','%beach%','%חוף%']);
    else return false;
  end case;
end;
$$;

create table if not exists public.learned_travel_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_key text not null,
  preference_key text not null,
  suggested_value text not null,
  value text not null,
  confidence numeric(4,3) not null default 0,
  review_state text not null default 'suggested',
  source_scope text not null default 'cross_trip',
  evidence jsonb not null default '[]'::jsonb,
  evidence_active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint learned_travel_preferences_candidate_key_check check (char_length(candidate_key) between 1 and 120),
  constraint learned_travel_preferences_key_check check (preference_key = 'interests'),
  constraint learned_travel_preferences_suggested_value_check check (suggested_value in ('culture','food','nature','history','shopping','nightlife','photography','relaxation')),
  constraint learned_travel_preferences_value_check check (value in ('culture','food','nature','history','shopping','nightlife','photography','relaxation')),
  constraint learned_travel_preferences_candidate_value_check check (candidate_key = 'cross-trip:interests:' || suggested_value),
  constraint learned_travel_preferences_confidence_check check (confidence between 0 and 1),
  constraint learned_travel_preferences_review_check check (review_state in ('suggested','confirmed','rejected')),
  constraint learned_travel_preferences_scope_check check (source_scope = 'cross_trip'),
  constraint learned_travel_preferences_revision_check check (revision > 0),
  constraint learned_travel_preferences_evidence_check check (public.travelmate_valid_learned_evidence(evidence, evidence_active)),
  constraint learned_travel_preferences_owner_candidate_unique unique (user_id, candidate_key)
);

create index if not exists learned_travel_preferences_owner_review_idx
  on public.learned_travel_preferences (user_id, review_state, updated_at desc);

create or replace function public.travelmate_guard_learned_preference()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.review_state <> 'suggested' or new.reviewed_at is not null then
      raise exception 'LEARNED_PROFILE_INITIAL_STATE';
    end if;
    new.revision := 1;
    new.created_at := now();
  else
    if new.user_id <> old.user_id
       or new.candidate_key <> old.candidate_key
       or new.preference_key <> old.preference_key
       or new.suggested_value <> old.suggested_value
       or new.source_scope <> old.source_scope then
      raise exception 'LEARNED_PROFILE_IMMUTABLE_FIELD';
    end if;
    if old.review_state = 'rejected' and new.review_state <> 'rejected' then
      raise exception 'LEARNED_PROFILE_STATE';
    end if;
    if old.review_state = 'confirmed' and new.review_state not in ('confirmed','rejected') then
      raise exception 'LEARNED_PROFILE_STATE';
    end if;
    if old.review_state = 'suggested' and new.review_state not in ('suggested','confirmed','rejected') then
      raise exception 'LEARNED_PROFILE_STATE';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;

  if not public.travelmate_valid_learned_evidence(new.evidence, new.evidence_active) then
    raise exception 'LEARNED_PROFILE_EVIDENCE';
  end if;

  if tg_op = 'UPDATE' and new.review_state <> old.review_state then
    new.reviewed_at := now();
  elsif tg_op = 'INSERT' then
    new.reviewed_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists travelmate_guard_learned_preference_trigger on public.learned_travel_preferences;
create trigger travelmate_guard_learned_preference_trigger
before insert or update on public.learned_travel_preferences
for each row execute function public.travelmate_guard_learned_preference();

alter table public.learned_travel_preferences enable row level security;
alter table public.learned_travel_preferences force row level security;

drop policy if exists "Users read their learned preferences" on public.learned_travel_preferences;
create policy "Users read their learned preferences"
  on public.learned_travel_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "MFA protects learned preference reads" on public.learned_travel_preferences;
create policy "MFA protects learned preference reads"
  on public.learned_travel_preferences as restrictive for select to authenticated
  using ((select public.mfa_satisfied_if_enrolled()));

-- No direct client writes. All learned mutations use hardened SECURITY DEFINER RPCs below.
revoke all on table public.learned_travel_preferences from anon, authenticated;
grant select on table public.learned_travel_preferences to authenticated;

create or replace function public.travelmate_learning_enabled(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select coalesce(u.raw_user_meta_data -> 'travelmate_preferences' ->> 'learningEnabled', 'false') = 'true'
  from auth.users u
  where u.id = p_user_id and u.id = (select auth.uid());
$$;

create or replace function public.travelmate_evidence_matches_interest(p_user_id uuid, p_evidence jsonb, p_interest text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  trip_row public.travel_trips%rowtype;
  records jsonb;
  event jsonb;
  matched boolean;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then return false; end if;
  if not public.travelmate_valid_learned_evidence(p_evidence, true) then return false; end if;

  for item in select value from jsonb_array_elements(p_evidence)
  loop
    select * into trip_row
    from public.travel_trips t
    where t.user_id = p_user_id
      and t.id = item ->> 'sourceTripId'
      and t.deleted_at is null
      and t.end_date < current_date;
    if not found then return false; end if;

    matched := false;
    if item ->> 'eventKind' = 'completed_activity' then
      records := case when jsonb_typeof(trip_row.payload -> 'activities') = 'array' then trip_row.payload -> 'activities' else '[]'::jsonb end;
      for event in select value from jsonb_array_elements(records)
      loop
        if event ->> 'id' = item ->> 'eventRef'
           and lower(coalesce(event ->> 'done', 'false')) = 'true'
           and public.travelmate_category_matches_interest(event ->> 'category', p_interest) then
          matched := true;
          exit;
        end if;
      end loop;
    elsif item ->> 'eventKind' = 'completed_place' then
      records :=
        (case when jsonb_typeof(trip_row.payload -> 'savedPlaces') = 'array' then trip_row.payload -> 'savedPlaces' else '[]'::jsonb end)
        ||
        (case when jsonb_typeof(trip_row.payload -> 'places') = 'array' then trip_row.payload -> 'places' else '[]'::jsonb end);
      for event in select value from jsonb_array_elements(records)
      loop
        if event ->> 'id' = item ->> 'eventRef'
           and lower(coalesce(event ->> 'done', 'false')) = 'true'
           and (
             nullif(trim(coalesce(event ->> 'date', '')), '') is not null
             or nullif(trim(coalesce(event ->> 'localDate', '')), '') is not null
             or nullif(trim(coalesce(event ->> 'scheduledDate', '')), '') is not null
             or nullif(trim(coalesce(event ->> 'day', '')), '') is not null
             or lower(coalesce(event ->> 'scheduled', 'false')) = 'true'
             or event ? 'dayIndex'
           )
           and public.travelmate_category_matches_interest(event ->> 'category', p_interest) then
          matched := true;
          exit;
        end if;
      end loop;
    end if;
    if not matched then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.travelmate_sync_learned_preference(
  p_candidate_key text,
  p_suggested_value text,
  p_confidence numeric,
  p_evidence jsonb,
  p_expected_revision bigint default null
)
returns setof public.learned_travel_preferences
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := (select auth.uid());
  v_learning text;
  current_row public.learned_travel_preferences%rowtype;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then raise exception 'LEARNED_PROFILE_AUTH'; end if;
  select coalesce(u.raw_user_meta_data -> 'travelmate_preferences' ->> 'learningEnabled', 'false')
    into v_learning from auth.users u where u.id = v_user for update;
  if v_learning <> 'true' then raise exception 'LEARNED_PROFILE_CONSENT'; end if;
  if p_suggested_value not in ('culture','food','nature','history','shopping','nightlife','photography','relaxation')
     or p_candidate_key <> 'cross-trip:interests:' || p_suggested_value
     or p_confidence < 0 or p_confidence > 1
     or not public.travelmate_evidence_matches_interest(v_user, p_evidence, p_suggested_value) then
    raise exception 'LEARNED_PROFILE_EVIDENCE';
  end if;

  select * into current_row from public.learned_travel_preferences
    where user_id = v_user and candidate_key = p_candidate_key for update;

  if not found then
    if p_expected_revision is not null then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
    return query
      insert into public.learned_travel_preferences(user_id,candidate_key,preference_key,suggested_value,value,confidence,review_state,source_scope,evidence,evidence_active)
      values(v_user,p_candidate_key,'interests',p_suggested_value,p_suggested_value,p_confidence,'suggested','cross_trip',p_evidence,true)
      returning *;
    return;
  end if;

  if p_expected_revision is null or current_row.revision <> p_expected_revision then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
  if current_row.review_state = 'rejected' then return query select current_row.*; return; end if;

  return query
    update public.learned_travel_preferences
      set confidence = p_confidence, evidence = p_evidence, evidence_active = true
      where id = current_row.id and revision = p_expected_revision
      returning *;
  if not found then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
end;
$$;

create or replace function public.travelmate_deactivate_learned_preference(p_id uuid, p_expected_revision bigint)
returns setof public.learned_travel_preferences
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := (select auth.uid());
  current_row public.learned_travel_preferences%rowtype;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then raise exception 'LEARNED_PROFILE_AUTH'; end if;
  select * into current_row from public.learned_travel_preferences where id=p_id and user_id=v_user for update;
  if not found or current_row.revision <> p_expected_revision then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
  if current_row.review_state = 'suggested' then
    delete from public.learned_travel_preferences where id=current_row.id and revision=p_expected_revision;
    return;
  end if;
  if current_row.review_state = 'confirmed' and current_row.evidence_active then
    return query update public.learned_travel_preferences
      set confidence=0,evidence='[]'::jsonb,evidence_active=false
      where id=current_row.id and revision=p_expected_revision returning *;
    if not found then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
  else
    return query select current_row.*;
  end if;
end;
$$;

create or replace function public.travelmate_review_learned_preference(
  p_id uuid,
  p_expected_revision bigint,
  p_action text,
  p_value text default null
)
returns setof public.learned_travel_preferences
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := (select auth.uid());
  v_learning text;
  current_row public.learned_travel_preferences%rowtype;
  next_value text;
  next_state text;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then raise exception 'LEARNED_PROFILE_AUTH'; end if;
  select coalesce(u.raw_user_meta_data -> 'travelmate_preferences' ->> 'learningEnabled', 'false')
    into v_learning from auth.users u where u.id=v_user for update;
  if v_learning <> 'true' then raise exception 'LEARNED_PROFILE_CONSENT'; end if;
  select * into current_row from public.learned_travel_preferences where id=p_id and user_id=v_user for update;
  if not found or current_row.revision <> p_expected_revision then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;

  next_value := current_row.value;
  next_state := current_row.review_state;
  if p_action in ('confirm','correct') then
    if current_row.review_state not in ('suggested','confirmed') or not current_row.evidence_active
       or not public.travelmate_evidence_matches_interest(v_user,current_row.evidence,current_row.suggested_value) then
      raise exception 'LEARNED_PROFILE_STATE';
    end if;
    if p_action='correct' then
      if p_value not in ('culture','food','nature','history','shopping','nightlife','photography','relaxation') then raise exception 'LEARNED_PROFILE_VALUE'; end if;
      next_value := p_value;
    end if;
    next_state := 'confirmed';
  elsif p_action='reject' then
    if current_row.review_state not in ('suggested','confirmed') then raise exception 'LEARNED_PROFILE_STATE'; end if;
    next_state := 'rejected';
  else
    raise exception 'LEARNED_PROFILE_ACTION';
  end if;

  return query update public.learned_travel_preferences
    set value=next_value,review_state=next_state
    where id=current_row.id and revision=p_expected_revision returning *;
  if not found then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
end;
$$;

create or replace function public.travelmate_delete_learned_preference(p_id uuid, p_expected_revision bigint)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := (select auth.uid());
  deleted_count integer;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then raise exception 'LEARNED_PROFILE_AUTH'; end if;
  delete from public.learned_travel_preferences
    where id=p_id and user_id=v_user and revision=p_expected_revision;
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'LEARNED_PROFILE_CONFLICT'; end if;
  return true;
end;
$$;

create or replace function public.travelmate_delete_all_learned_preferences()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := (select auth.uid());
  deleted_count integer;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then raise exception 'LEARNED_PROFILE_AUTH'; end if;
  delete from public.learned_travel_preferences where user_id=v_user;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.travelmate_confirmed_learned_preferences()
returns table (preference_key text, value text, source_scope text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := (select auth.uid());
  v_learning text;
  row_value public.learned_travel_preferences%rowtype;
begin
  if v_user is null or not public.mfa_satisfied_if_enrolled() then return; end if;
  select coalesce(u.raw_user_meta_data -> 'travelmate_preferences' ->> 'learningEnabled', 'false')
    into v_learning from auth.users u where u.id=v_user for share;
  if v_learning <> 'true' then return; end if;

  for row_value in
    select * from public.learned_travel_preferences lp
    where lp.user_id=v_user and lp.review_state='confirmed' and lp.evidence_active=true
  loop
    if public.travelmate_evidence_matches_interest(v_user,row_value.evidence,row_value.suggested_value) then
      preference_key := row_value.preference_key;
      value := row_value.value;
      source_scope := row_value.source_scope;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.travelmate_valid_learned_evidence(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.travelmate_category_matches_interest(text, text) from public, anon, authenticated;
revoke all on function public.travelmate_learning_enabled(uuid) from public, anon, authenticated;
revoke all on function public.travelmate_evidence_matches_interest(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.travelmate_guard_learned_preference() from public, anon, authenticated;
revoke all on function public.travelmate_sync_learned_preference(text,text,numeric,jsonb,bigint) from public, anon;
revoke all on function public.travelmate_deactivate_learned_preference(uuid,bigint) from public, anon;
revoke all on function public.travelmate_review_learned_preference(uuid,bigint,text,text) from public, anon;
revoke all on function public.travelmate_delete_learned_preference(uuid,bigint) from public, anon;
revoke all on function public.travelmate_delete_all_learned_preferences() from public, anon;
revoke all on function public.travelmate_confirmed_learned_preferences() from public, anon;
grant execute on function public.travelmate_sync_learned_preference(text,text,numeric,jsonb,bigint) to authenticated;
grant execute on function public.travelmate_deactivate_learned_preference(uuid,bigint) to authenticated;
grant execute on function public.travelmate_review_learned_preference(uuid,bigint,text,text) to authenticated;
grant execute on function public.travelmate_delete_learned_preference(uuid,bigint) to authenticated;
grant execute on function public.travelmate_delete_all_learned_preferences() to authenticated;
grant execute on function public.travelmate_confirmed_learned_preferences() to authenticated;

comment on table public.learned_travel_preferences is 'TravelMate reviewed learned preferences. Client has SELECT only; all mutations use server-validated owner-bound RPCs.';
comment on column public.learned_travel_preferences.suggested_value is 'Immutable original inferred value; corrected user value remains separate.';
comment on column public.learned_travel_preferences.evidence is 'Bounded provenance only: sourceTripId, eventKind, eventRef. RPCs validate event existence, completion, scheduling and interest category.';
comment on column public.learned_travel_preferences.evidence_active is 'False when current source evidence no longer qualifies; export independently revalidates evidence and consent.';
