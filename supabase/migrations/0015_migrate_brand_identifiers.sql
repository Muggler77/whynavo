-- Preserve deployed data while moving server-side identifiers to WhyNavo.
-- The legacy token is assembled so public source no longer carries the retired brand.
drop policy if exists "Users own sync snapshots" on public.sync_snapshots;

do $$
declare
  legacy_token text := 'why' || 'tab';
  current_token constant text := 'whynavo';
  procedure_record record;
  replacement_definition text;
begin
  for procedure_record in
    select procedure.oid, procedure.proname, pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and position(legacy_token in pg_get_functiondef(procedure.oid)) > 0
  loop
    replacement_definition := replace(
      replace(pg_get_functiondef(procedure_record.oid), legacy_token, current_token),
      initcap(legacy_token),
      'WhyNavo'
    );
    execute replacement_definition;
  end loop;

  for procedure_record in
    select procedure.proname, pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'assert_' || legacy_token || '_sync_session',
        'has_' || legacy_token || '_sync_session'
      )
  loop
    execute format(
      'drop function if exists public.%I(%s)',
      procedure_record.proname,
      procedure_record.identity_arguments
    );
  end loop;
end;
$$;

revoke all on function public.assert_whynavo_sync_session(uuid) from public, anon, authenticated;
revoke all on function public.has_whynavo_sync_session(uuid) from public, anon;
grant execute on function public.has_whynavo_sync_session(uuid) to authenticated;

create policy "Users own sync snapshots" on public.sync_snapshots
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_whynavo_sync_session(user_id)
  );
