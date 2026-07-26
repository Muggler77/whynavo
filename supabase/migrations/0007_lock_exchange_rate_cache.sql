alter table public.exchange_rate_cache enable row level security;

revoke all on table public.exchange_rate_cache from anon, authenticated;
