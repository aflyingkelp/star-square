-- Add the username claim RPC on projects where accounts.sql was installed earlier.
create table if not exists public.game_usernames (
 username text primary key check(username ~ '^[a-z0-9_]{3,20}$'), created_at timestamptz not null default now()
);
alter table public.game_usernames enable row level security;
revoke all on public.game_usernames from public,anon,authenticated;
grant select,insert,delete on public.game_usernames to service_role;
create or replace function public.game_claim_username(requested text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from game_accounts where username=requested) then return false; end if;
 insert into game_usernames(username) values(requested) on conflict(username) do nothing;
 if not found then return false; end if;
 return true;
end $$;
