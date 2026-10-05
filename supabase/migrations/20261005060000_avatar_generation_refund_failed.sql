-- Refund failed provider attempts while preserving cooldown and successful daily usage.
-- Existing claim RPC remains unchanged and increments optimistically before provider work.
create or replace function public.finalize_avatar_generation(
  p_owner uuid,
  p_style text,
  p_claim uuid,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null or p_style is null or p_claim is null or p_success is null then
    raise exception 'Invalid generation finalization' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 162160));

  update public.avatar_generation_usage
  set lease_until = null,
      claim_id = null,
      request_count = case
        when p_success then request_count
        else greatest(request_count - 1, 0)
      end
  where user_id = p_owner
    and style = p_style
    and claim_id = p_claim;
end;
$$;

revoke all on function public.finalize_avatar_generation(uuid,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.finalize_avatar_generation(uuid,text,uuid,boolean) to service_role;
