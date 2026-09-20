-- =====================================================================
-- Shared rate limiting (login lockout + public applications)
-- =====================================================================
-- The counters used to live in each server process. On a serverless host (Vercel) every request may land on a
-- different, short-lived instance, so in-memory counters never accumulate and brute-force protection is a no-op.
-- Keeping them in Postgres makes the limits hold across instances.
--
-- `key` is a SHA-256 of the identifying data (ip | organization | e-mail), so no e-mail or IP is stored in clear text.
create table public.rate_limits (
  bucket       text        not null,               -- 'login' | 'public-apply'
  key          text        not null,
  hits         integer     not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  primary key (bucket, key)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
