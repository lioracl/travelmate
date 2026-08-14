-- Once a user enrolls a verified MFA factor, every request for personal trip data
-- must carry an AAL2 JWT. Users who have not enrolled yet retain AAL1 access.
create or replace function public.mfa_satisfied_if_enrolled()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    not exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
    or (select auth.jwt()->>'aal') = 'aal2';
$$;

revoke all on function public.mfa_satisfied_if_enrolled() from public, anon;
grant execute on function public.mfa_satisfied_if_enrolled() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['travel_trips','travel_documents','trip_members','trip_messages'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'MFA protects personal data', table_name);
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied_if_enrolled())) with check ((select public.mfa_satisfied_if_enrolled()))',
        'MFA protects personal data', table_name
      );
    end if;
  end loop;
end $$;

drop policy if exists "MFA protects private travel files" on storage.objects;
create policy "MFA protects private travel files"
  on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'travel-documents' or (select public.mfa_satisfied_if_enrolled()))
  with check (bucket_id <> 'travel-documents' or (select public.mfa_satisfied_if_enrolled()));
