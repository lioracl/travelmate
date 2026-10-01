-- OPTIONAL ACTIVATION ONLY, not a migration. Do not run against production as
-- part of verification. First validate the worker/migration in an isolated stack.
-- Operator supplies these two named secrets through Supabase Vault; no values
-- or service-role key belong in this file or in the scheduled job text.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='document_recovery_url'
    and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/document-recovery$')
    or not exists(select 1 from vault.decrypted_secrets where name='document_recovery_secret' and length(decrypted_secret)>=32) then
    raise exception 'DOCUMENT_RECOVERY_VAULT_CONFIGURATION_REQUIRED';
  end if;
end $$;

select cron.schedule('travelmate-document-recovery','17 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='document_recovery_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='document_recovery_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
