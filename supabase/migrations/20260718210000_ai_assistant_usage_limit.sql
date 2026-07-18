create table if not exists public.travel_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count integer not null default 0 check (request_count >= 0),
  last_requested_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.travel_ai_usage enable row level security;
revoke all on table public.travel_ai_usage from anon, authenticated;

create or replace function public.consume_travel_ai_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer;
  daily_limit constant integer := 60;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.travel_ai_usage (user_id, usage_date, request_count, last_requested_at)
  values (current_user_id, (now() at time zone 'utc')::date, 1, now())
  on conflict (user_id, usage_date) do update
    set request_count = public.travel_ai_usage.request_count + 1,
        last_requested_at = now()
    where public.travel_ai_usage.request_count < daily_limit
  returning request_count into current_count;

  if current_count is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', daily_limit);
  end if;
  return jsonb_build_object('allowed', true, 'remaining', daily_limit - current_count, 'limit', daily_limit);
end;
$$;

revoke all on function public.consume_travel_ai_request() from public, anon;
grant execute on function public.consume_travel_ai_request() to authenticated;
