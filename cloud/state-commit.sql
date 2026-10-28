create or replace function public.game_state_commit(expected_versions jsonb, new_values jsonb)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare entry record;
begin
  if jsonb_typeof(expected_versions) <> 'object' or jsonb_typeof(new_values) <> 'object' then
    raise exception 'Invalid state commit';
  end if;
  perform 1 from public.app_state order by key for update;
  if (select count(*) from public.app_state) <> 3 or exists (
    select 1 from public.app_state s where (expected_versions->>s.key)::timestamptz is distinct from s.updated_at
  ) then return false; end if;
  for entry in select key, value from jsonb_each(new_values) loop
    if entry.key not in ('maps','scores','profiles') or
       (entry.key='profiles' and jsonb_typeof(entry.value)<>'object') or
       (entry.key<>'profiles' and jsonb_typeof(entry.value)<>'array') then
      raise exception 'Invalid state shape';
    end if;
    update public.app_state s set value=entry.value,updated_at=clock_timestamp() where s.key=entry.key;
  end loop;
  return true;
end;
$$;
revoke all on function public.game_state_commit(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.game_state_commit(jsonb,jsonb) to service_role;
