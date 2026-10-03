create or replace function public.travelmate_compare_and_set_avatar(
  p_expected_avatar_url text,
  p_expected_avatar_path text,
  p_expected_avatar_removed boolean,
  p_new_avatar_url text,
  p_new_avatar_path text,
  p_new_avatar_removed boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, auth, public
as $$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'avatar_url', p_new_avatar_url,
        'avatar_path', p_new_avatar_path,
        'avatar_removed', coalesce(p_new_avatar_removed, false)
      ),
      updated_at = now()  where id = auth.uid()
    and coalesce(raw_user_meta_data ->> 'avatar_url', '') = coalesce(p_expected_avatar_url, '')
    and coalesce(raw_user_meta_data ->> 'avatar_path', '') = coalesce(p_expected_avatar_path, '')
    and coalesce(raw_user_meta_data ->> 'avatar_removed', 'false') = case when coalesce(p_expected_avatar_removed, false) then 'true' else 'false' end;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.travelmate_compare_and_set_avatar(text,text,boolean,text,text,boolean) from public;
revoke all on function public.travelmate_compare_and_set_avatar(text,text,boolean,text,text,boolean) from anon;
grant execute on function public.travelmate_compare_and_set_avatar(text,text,boolean,text,text,boolean) to authenticated;
