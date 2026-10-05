-- Avatar generation guard v2: allow practical retry/testing volume while keeping bounded daily cost.
-- Daily count remains optimistic and failed provider attempts are refunded by finalize_avatar_generation.
create or replace function public.claim_avatar_generation(p_owner uuid, p_style text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  claim uuid := gen_random_uuid();
  existing public.avatar_generation_usage%rowtype;
  daily_count integer := 0;
  active_count integer := 0;
  daily_limit constant integer := 60;
begin
  if p_owner is null or p_style is null or p_style not in ('classic','tokyo-neon','japanese-calm','beach-journey','manga-action','cinematic') then
    raise exception 'Invalid generation request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 162160));

  select coalesce(sum(request_count),0)::integer into daily_count
  from public.avatar_generation_usage
  where user_id=p_owner and usage_date=today;

  if daily_count >= daily_limit then
    return jsonb_build_object('allowed',false,'reason','daily_limit','remaining',0);
  end if;

  select count(*)::integer into active_count
  from public.avatar_generation_usage
  where user_id=p_owner and lease_until>now();

  if active_count >= 2 then
    return jsonb_build_object('allowed',false,'reason','busy');
  end if;

  select * into existing
  from public.avatar_generation_usage
  where user_id=p_owner and style=p_style;

  if existing.lease_until > now() then
    return jsonb_build_object('allowed',false,'reason','busy');
  end if;

  insert into public.avatar_generation_usage(user_id,style,usage_date,request_count,last_requested_at,claim_id,lease_until)
  values(p_owner,p_style,today,1,now(),claim,now()+interval '3 minutes')
  on conflict(user_id,style) do update set
    usage_date=today,
    request_count=case when avatar_generation_usage.usage_date=today then avatar_generation_usage.request_count+1 else 1 end,
    last_requested_at=now(),
    claim_id=claim,
    lease_until=now()+interval '3 minutes';

  return jsonb_build_object('allowed',true,'claim_id',claim,'remaining',greatest(daily_limit-(daily_count+1),0));
end;
$$;

revoke all on function public.claim_avatar_generation(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_avatar_generation(uuid,text) to service_role;
