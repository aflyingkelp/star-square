create table if not exists public.game_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check(username ~ '^[a-z0-9_]{3,20}$'),
 save jsonb, revision bigint not null default 0,
 play_seconds bigint not null default 0, last_seen timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table if not exists public.game_chat (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.game_accounts(user_id) on delete cascade,
 username text not null, message text not null check(length(message) between 1 and 300),
 created_at timestamptz not null default now()
);
create index if not exists game_chat_user_time on public.game_chat(user_id,created_at desc);
create table if not exists public.game_rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);
create table if not exists public.game_usernames(username text primary key check(username ~ '^[a-z0-9_]{3,20}$'),created_at timestamptz not null default now());
alter table public.game_accounts enable row level security;
alter table public.game_chat enable row level security;
alter table public.game_rate_limits enable row level security;
alter table public.game_usernames enable row level security;
revoke all on public.game_accounts,public.game_chat,public.game_rate_limits from anon,authenticated;
revoke all on public.game_usernames from anon,authenticated;
grant select,insert,update,delete on public.game_accounts to service_role;
grant select,insert,update on public.game_accounts,public.game_chat,public.game_rate_limits to service_role;
grant select,insert,delete on public.game_usernames to service_role;
grant usage,select on sequence public.game_chat_id_seq to service_role;
create or replace function public.game_rate_limit(bucket text, max_count integer, window_seconds integer) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare n integer;
begin
 insert into game_rate_limits(key,count,expires_at) values(bucket,1,now()+make_interval(secs=>window_seconds))
 on conflict(key) do update set count=case when game_rate_limits.expires_at<now() then 1 else game_rate_limits.count+1 end,
 expires_at=case when game_rate_limits.expires_at<now() then now()+make_interval(secs=>window_seconds) else game_rate_limits.expires_at end
 returning count into n;
 return n<=max_count;
end $$;
create or replace function public.game_save_account(account_id uuid, expected_revision bigint, next_save jsonb, active_seconds integer)
returns setof public.game_accounts language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 return query update game_accounts set save=next_save,revision=revision+1,
 play_seconds=play_seconds+least(greatest(active_seconds,0),60,greatest(0,extract(epoch from now()-last_seen)::integer)),last_seen=now()
 where user_id=account_id and revision=expected_revision returning *;
end $$;
create or replace function public.game_claim_username(requested text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if exists(select 1 from game_accounts where username=requested) then return false; end if;
 insert into game_usernames(username) values(requested) on conflict(username) do nothing;
 if not found then return false; end if;
 return true;
end $$;
revoke all on function public.game_rate_limit(text,integer,integer),public.game_save_account(uuid,bigint,jsonb,integer),public.game_claim_username(text) from public,anon,authenticated;
grant execute on function public.game_rate_limit(text,integer,integer),public.game_save_account(uuid,bigint,jsonb,integer),public.game_claim_username(text) to service_role;
