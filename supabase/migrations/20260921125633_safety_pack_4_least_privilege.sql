-- Safety Pack 4: least-privilege grants and admin read-path hardening.
-- Admin data must be read through the admin-center Edge Function, where aal2 is enforced.

revoke select
on table public.app_admins
from authenticated;

revoke select
on table public.admin_audit_log
from authenticated;

-- Public app settings are intentionally readable by authenticated users.
-- Remove only non-query privileges that the frontend never needs.
revoke references, trigger, truncate
on table public.app_settings
from authenticated;

-- Document Vault keeps its functional DML (select/insert/update/delete).
-- Remove only administrative relation privileges.
revoke references, trigger, truncate
on table public.travel_documents
from authenticated;

-- Collaboration messages keep select/insert/delete.
-- UPDATE has no RLS policy and is not part of the app contract.
revoke update, references, trigger, truncate
on table public.trip_messages
from authenticated;
