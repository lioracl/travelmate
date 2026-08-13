-- Read-only TravelMate security audit. Run in Supabase SQL Editor.
with expected_tables(table_name) as (
  values ('travel_trips'), ('travel_documents'), ('trip_members'), ('trip_messages'), ('trip_invitations')
), table_checks as (
  select
    expected_tables.table_name as item,
    case when c.relrowsecurity then 'PASS' else 'FAIL' end as status,
    'RLS enabled' as requirement
  from expected_tables
  left join (
    select c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  ) c on c.relname = expected_tables.table_name
)
select * from table_checks
union all
select 'travel-documents', case when exists (select 1 from storage.buckets where id = 'travel-documents' and not public) then 'PASS' else 'FAIL' end, 'private storage bucket'
order by item;

-- Review policy names and commands. No anon write policy should exist.
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
  and (tablename like 'travel_%' or tablename like 'trip_%' or tablename = 'objects')
order by schemaname, tablename, policyname;
