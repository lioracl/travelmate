-- Normalize the private upload bucket and its owner-scoped policies.
-- MFA remains enforced by the restrictive policy from 20260814213000.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'travel-documents',
  'travel-documents',
  false,
  26214400,
  array[
    'application/octet-stream',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read files in their own folder" on storage.objects;
drop policy if exists "Users upload files to their own folder" on storage.objects;
drop policy if exists "Users delete files from their own folder" on storage.objects;
drop policy if exists "TravelMate owners select private uploads" on storage.objects;
drop policy if exists "TravelMate owners insert private uploads" on storage.objects;
drop policy if exists "TravelMate owners update private uploads" on storage.objects;
drop policy if exists "TravelMate owners delete private uploads" on storage.objects;

create policy "TravelMate owners select private uploads"
on storage.objects for select to authenticated
using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "TravelMate owners insert private uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "TravelMate owners update private uploads"
on storage.objects for update to authenticated
using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create policy "TravelMate owners delete private uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
