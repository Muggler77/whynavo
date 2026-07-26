create table if not exists public.sync_write_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0
);

alter table public.sync_write_rate_limits enable row level security;
revoke all on table public.sync_write_rate_limits from public, anon, authenticated;

create or replace function public.push_sync_snapshot_for_user(
  p_user_id uuid,
  p_name text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns table(applied boolean, next_revision bigint, server_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  rate_count integer;
  current_window timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id is null or p_user_id is distinct from current_user_id then
    raise exception 'Authenticated account changed';
  end if;

  if p_name is distinct from 'primary' then
    raise exception 'Unsupported snapshot name';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Snapshot payload must be an object';
  end if;

  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be a non-negative integer';
  end if;

  if octet_length(p_payload::text) > 2097152 then
    raise exception 'Snapshot payload exceeds the 2 MB limit';
  end if;

  insert into public.sync_write_rate_limits as limits (
    user_id,
    window_started_at,
    request_count
  )
  values (current_user_id, clock_timestamp(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when limits.window_started_at <= clock_timestamp() - interval '1 minute'
          then clock_timestamp()
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at <= clock_timestamp() - interval '1 minute'
          then 1
        else limits.request_count + 1
      end
  returning request_count, window_started_at
  into rate_count, current_window;

  if rate_count > 20 then
    applied := false;
    next_revision := -1;
    server_updated_at := current_window;
    return next;
    return;
  end if;

  update public.sync_snapshots
  set payload = p_payload,
      revision = revision + 1,
      updated_at = now()
  where user_id = current_user_id
    and name = p_name
    and revision = p_expected_revision
  returning true, revision, updated_at
  into applied, next_revision, server_updated_at;

  if found then
    return next;
    return;
  end if;

  if p_expected_revision = 0 then
    insert into public.sync_snapshots (user_id, name, payload, revision, updated_at)
    values (current_user_id, p_name, p_payload, 1, now())
    on conflict (user_id, name) do nothing
    returning true, revision, updated_at
    into applied, next_revision, server_updated_at;

    if found then
      return next;
      return;
    end if;
  end if;

  select false, snapshot.revision, snapshot.updated_at
  into applied, next_revision, server_updated_at
  from public.sync_snapshots as snapshot
  where snapshot.user_id = current_user_id
    and snapshot.name = p_name;
  return next;
end;
$$;

revoke all on function public.push_sync_snapshot_for_user(uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.push_sync_snapshot_for_user(uuid, text, jsonb, bigint) to authenticated;
