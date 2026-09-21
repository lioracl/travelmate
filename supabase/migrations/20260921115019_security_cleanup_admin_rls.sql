-- Safety Pack 2: tighten admin RPC exposure and remove superseded TravelMate trip policies.
-- Applied to production as migration 20260921115019.

revoke all on function public.is_app_admin(text) from anon;

drop policy if exists "Users can view their own trips" on public.travel_trips;
drop policy if exists "Users can insert their own trips" on public.travel_trips;
drop policy if exists "Users can update their own trips" on public.travel_trips;
drop policy if exists "Users can delete their own trips" on public.travel_trips;
