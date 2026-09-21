-- Safety Pack 7: Supabase grants EXECUTE to API roles on newly created functions.
-- Keep collaborator-management RPCs authenticated-only.

revoke all on function public.update_trip_member_role(uuid,text,uuid,text) from anon;
revoke all on function public.remove_trip_member(uuid,text,uuid) from anon;
