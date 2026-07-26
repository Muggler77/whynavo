create table if not exists public.sync_session_activity (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp()
);

alter table public.sync_session_activity enable row level security;
revoke all on table public.sync_session_activity from public, anon, authenticated;

create index if not exists sync_session_activity_user_idx
  on public.sync_session_activity(user_id, last_seen_at desc);

create or replace function public.assert_whytab_sync_session(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_session_id uuid;
  session_created_at timestamptz;
  activity_first_seen_at timestamptz;
  activity_last_seen_at timestamptz;
  checked_at timestamptz := clock_timestamp();
begin
  if current_user_id is null or p_user_id is null or p_user_id is distinct from current_user_id then
    raise exception 'Authenticated account changed';
  end if;

  begin
    current_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception
    when invalid_text_representation then
      current_session_id := null;
  end;

  if current_session_id is null then
    raise exception 'Whytab session revoked';
  end if;

  select session.created_at
  into session_created_at
  from auth.sessions as session
  where session.id = current_session_id
    and session.user_id = current_user_id;

  if not found then
    raise exception 'Whytab session revoked';
  end if;

  if session_created_at < checked_at - interval '90 days' then
    raise exception 'Whytab session expired';
  end if;

  insert into public.sync_session_activity (
    session_id,
    user_id,
    first_seen_at,
    last_seen_at
  )
  values (
    current_session_id,
    current_user_id,
    checked_at,
    checked_at
  )
  on conflict (session_id) do nothing;

  select activity.first_seen_at, activity.last_seen_at
  into activity_first_seen_at, activity_last_seen_at
  from public.sync_session_activity as activity
  where activity.session_id = current_session_id
    and activity.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Whytab session revoked';
  end if;

  if activity_first_seen_at < checked_at - interval '90 days' then
    raise exception 'Whytab session expired';
  end if;

  if activity_last_seen_at < checked_at - interval '30 days' then
    raise exception 'Whytab session inactive';
  end if;

  update public.sync_session_activity
  set last_seen_at = checked_at
  where session_id = current_session_id
    and user_id = current_user_id;
end;
$$;

revoke all on function public.assert_whytab_sync_session(uuid) from public, anon, authenticated;

create or replace function public.has_whytab_sync_session(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    return false;
  end if;
  perform public.assert_whytab_sync_session(p_user_id);
  return true;
end;
$$;

revoke all on function public.has_whytab_sync_session(uuid) from public, anon;
grant execute on function public.has_whytab_sync_session(uuid) to authenticated;

drop policy if exists "Users own sync snapshots" on public.sync_snapshots;
create policy "Users own sync snapshots" on public.sync_snapshots
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_whytab_sync_session(user_id)
  );

create or replace function public.pull_sync_snapshot_for_user(
  p_user_id uuid,
  p_name text
)
returns table(user_id uuid, payload jsonb, updated_at timestamptz, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_whytab_sync_session(p_user_id);

  if p_name is distinct from 'primary' then
    raise exception 'Unsupported snapshot name';
  end if;

  return query
  select snapshot.user_id, snapshot.payload, snapshot.updated_at, snapshot.revision
  from public.sync_snapshots as snapshot
  where snapshot.user_id = p_user_id
    and snapshot.name = p_name;
end;
$$;

revoke all on function public.pull_sync_snapshot_for_user(uuid, text) from public, anon;
grant execute on function public.pull_sync_snapshot_for_user(uuid, text) to authenticated;

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
  perform public.assert_whytab_sync_session(p_user_id);

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

create or replace function public.push_sync_snapshot(
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
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select result.applied, result.next_revision, result.server_updated_at
  from public.push_sync_snapshot_for_user(
    current_user_id,
    p_name,
    p_payload,
    p_expected_revision
  ) as result;
end;
$$;

revoke all on function public.push_sync_snapshot(text, jsonb, bigint) from public, anon;
grant execute on function public.push_sync_snapshot(text, jsonb, bigint) to authenticated;
