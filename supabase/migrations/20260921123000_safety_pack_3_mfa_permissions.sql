-- Safety Pack 3: require MFA for collaboration-sensitive RPCs and tighten trip member grants.

create or replace function public.create_trip_invite(
  p_trip_owner_id uuid,
  p_trip_id text,
  p_role text default 'editor'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_token uuid;
begin
  if auth.uid() is null or auth.uid() <> p_trip_owner_id then
    raise exception 'Only the trip owner can create invitations' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  if not public.is_trip_member(p_trip_owner_id, p_trip_id) then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;

  insert into public.trip_invites (trip_owner_id, trip_id, role, created_by)
  values (
    p_trip_owner_id,
    p_trip_id,
    case when p_role = 'viewer' then 'viewer' else 'editor' end,
    auth.uid()
  )
  returning token into new_token;

  return new_token;
end;
$function$;

create or replace function public.accept_trip_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  invitation public.trip_invites%rowtype;
  member_name text;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.mfa_satisfied_if_enrolled() then
    raise exception 'MFA required' using errcode = '42501';
  end if;

  select * into invitation
  from public.trip_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.trip_members
    where trip_owner_id = invitation.trip_owner_id
      and trip_id = invitation.trip_id
      and user_id = actor_id
  ) then
    return jsonb_build_object(
      'owner_id', invitation.trip_owner_id,
      'trip_id', invitation.trip_id,
      'already_member', true
    );
  end if;

  if invitation.expires_at <= now() or invitation.use_count >= invitation.max_uses then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  member_name := coalesce(
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    'מטייל'
  );

  insert into public.trip_members (trip_owner_id, trip_id, user_id, display_name, role)
  values (invitation.trip_owner_id, invitation.trip_id, actor_id, member_name, invitation.role)
  on conflict (trip_owner_id, trip_id, user_id) do update
    set display_name = excluded.display_name;

  update public.trip_invites
  set use_count = use_count + 1
  where token = p_token;

  return jsonb_build_object(
    'owner_id', invitation.trip_owner_id,
    'trip_id', invitation.trip_id,
    'already_member', false
  );
end;
$function$;

revoke insert, references, trigger, truncate
on table public.trip_members
from authenticated;
