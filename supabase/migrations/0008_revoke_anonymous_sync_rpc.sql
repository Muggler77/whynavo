revoke all on function public.push_sync_snapshot(text, jsonb, bigint) from anon, public;
grant execute on function public.push_sync_snapshot(text, jsonb, bigint) to authenticated;
