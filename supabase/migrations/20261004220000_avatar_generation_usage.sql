-- Dedicated cost guard: service-only RPCs; no photos, output or tokens stored.
create table public.avatar_generation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  style text not null check (style in ('classic','tokyo-neon','japanese-calm','beach-journey','manga-action','cinematic')),
  usage_date date not null,
  request_count integer not null check (request_count >= 0),
  last_requested_at timestamptz not null,
  claim_id uuid,
  lease_until timestamptz,
  primary key (user_id, style)
);
alter table public.avatar_generation_usage enable row level security;
revoke all on public.avatar_generation_usage from public, anon, authenticated;

create function public.claim_avatar_generation(p_owner uuid, p_style text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  claim uuid := gen_random_uuid();
  existing public.avatar_generation_usage%rowtype;
begin
  if p_owner is null or p_style is null or p_style not in ('classic','tokyo-neon','japanese-calm','beach-journey','manga-action','cinematic') then
    raise exception 'Invalid generation request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 162160));
  select * into existing from public.avatar_generation_usage where user_id=p_owner and style=p_style;
  if existing.lease_until > now() or existing.last_requested_at > now()-interval '30 seconds'
    or (select coalesce(sum(request_count),0) from public.avatar_generation_usage where user_id=p_owner and usage_date=today)>=18
    or (select count(*) from public.avatar_generation_usage where user_id=p_owner and lease_until>now())>=2 then
    return jsonb_build_object('allowed',false);
  end if;
  insert into public.avatar_generation_usage(user_id,style,usage_date,request_count,last_requested_at,claim_id,lease_until)
  values(p_owner,p_style,today,1,now(),claim,now()+interval '3 minutes')
  on conflict(user_id,style) do update set usage_date=today,
    request_count=case when avatar_generation_usage.usage_date=today then avatar_generation_usage.request_count+1 else 1 end,
    last_requested_at=now(),claim_id=claim,lease_until=now()+interval '3 minutes';
  return jsonb_build_object('allowed',true,'claim_id',claim);
end;
$$;
create function public.release_avatar_generation(p_owner uuid,p_style text,p_claim uuid)
returns void language sql security definer set search_path = '' as $$
  update public.avatar_generation_usage set lease_until=null,claim_id=null
  where user_id=p_owner and style=p_style and claim_id=p_claim;
$$;
revoke all on function public.claim_avatar_generation(uuid,text) from public,anon,authenticated;
revoke all on function public.release_avatar_generation(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_avatar_generation(uuid,text) to service_role;
grant execute on function public.release_avatar_generation(uuid,text,uuid) to service_role;
