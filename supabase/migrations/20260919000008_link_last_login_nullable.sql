-- A link that was never used has no "last access". Until now a new link got last_login_at = now(), which made a
-- freshly created link look like the most recently used one and could become the default organization at login.
alter table public.tenant_users
  alter column last_login_at drop not null,
  alter column last_login_at drop default;
