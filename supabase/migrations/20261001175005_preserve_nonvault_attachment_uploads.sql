-- Integration only: Memories and receipt attachments already share this bucket.
-- Their metadata lives in the canonical trip, not travel_documents. Do not adopt
-- or reclaim these non-vault objects through the document recovery journal.
-- Existing ownership and MFA policies remain restrictive and unchanged.
create or replace function document_recovery.write_allowed(p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare u document_recovery.uploads; owner_id uuid := auth.uid();
begin
  -- A journal, including a legacy cleanup intent/tombstone, always wins. Preserve
  -- its lock and deadline fence even when its path is a non-vault attachment.
  select * into u from document_recovery.uploads where storage_path=p_path for share;
  if found then
    return u.user_id=owner_id and u.state='pending' and u.expires_at>clock_timestamp();
  end if;
  if owner_id is null or p_path is null or split_part(p_path,'/',1)<>owner_id::text
     or p_path ~ '(^|/)\.\.?(/|$)' or position(chr(92) in p_path)>0 then
    return false;
  end if;
  -- Exact existing path shapes only. No arbitrary legacy or vault namespace.
  return p_path ~ '^[^/]+/memories/[^/]+/[^/]+/[^/]+$'
      or p_path ~ '^[^/]+/receipts/[^/]+/[^/]+$';
end $$;
