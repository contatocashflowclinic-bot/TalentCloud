-- =====================================================================
-- Authentication (SuperAdmin + organization users) and honest DB metadata
-- =====================================================================

-- The simulated per-tenant "cluster" metadata is gone: isolation is logical
-- (tenant_id + composite FKs + RLS) in a single Postgres. The API now derives
-- real values (storage, pool, schema version) at read time.
alter table public.tenants drop column db_config;

-- ---------------------------------------------------------------------
-- Credentials
-- ---------------------------------------------------------------------
alter table public.platform_admins
  add column password_hash         text,
  add column must_change_password  boolean not null default false,
  add column password_changed_at   timestamptz,
  add column last_login_at         timestamptz;
create unique index platform_admins_email_lower_idx on public.platform_admins (lower(email));

alter table public.tenant_users
  add column password_hash         text,
  add column must_change_password  boolean not null default false;
create unique index tenant_users_email_lower_idx on public.tenant_users (tenant_id, lower(email));

-- ---------------------------------------------------------------------
-- Sessions: opaque random tokens, only their SHA-256 is stored (revocable)
-- ---------------------------------------------------------------------
create table public.auth_sessions (
  token_hash     text primary key,
  principal_type text not null check (principal_type in ('super_admin', 'tenant_user')),
  principal_id   text not null,
  tenant_id      text references public.tenants (id) on delete cascade,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz not null default now(),
  expires_at     timestamptz not null,
  check ((principal_type = 'tenant_user') = (tenant_id is not null))
);
create index auth_sessions_principal_idx on public.auth_sessions (principal_type, principal_id);
create index auth_sessions_expires_idx on public.auth_sessions (expires_at);

-- ---------------------------------------------------------------------
-- Security baseline for the new table + every FUTURE table
-- (Supabase grants new public tables to anon/authenticated by default)
-- ---------------------------------------------------------------------
alter table public.auth_sessions enable row level security;
revoke all on public.auth_sessions from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
