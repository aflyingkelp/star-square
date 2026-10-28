-- Create the persistent JSON state row used by STAR//SQUARE.
-- Run this once in Supabase SQL Editor before deploying the Render service.
create table if not exists public.app_state (
  key text primary key check (key in ('maps', 'scores', 'profiles')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- The service uses the secret service-role key server-side. Keep RLS enabled
-- and expose no policies to anon/authenticated clients.
alter table public.app_state enable row level security;
revoke all on public.app_state from anon, authenticated;
grant select, insert, update on public.app_state to service_role;
