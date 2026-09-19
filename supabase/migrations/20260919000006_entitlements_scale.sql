-- =====================================================================
-- Module entitlements per organization + indexes for the platform lists
--
-- enabled_routines: routines (src/access.ts ROUTINES keys) the organization's contract includes.
-- The effective permission of a member is (profile + exceptions) ∩ enabled routines, so the
-- Conta Mãe controls what each organization can use no matter what its profiles say.
-- Existing organizations keep everything enabled (no behavior change on upgrade).
-- =====================================================================
alter table public.tenants
  add column enabled_routines text[] not null default '{}';

update public.tenants
   set enabled_routines = array[
     'users', 'profiles', 'dna', 'structure', 'positions', 'openings', 'candidates', 'selection',
     'ai_evaluation', 'interviews', 'offers', 'onboarding', 'development', 'retention', 'indicators'
   ];

-- ---------------------------------------------------------------------
-- Indexes for scale (platform lists are searched and paginated in the database)
-- ---------------------------------------------------------------------
-- prefix search by name / e-mail on the global identities
create index app_users_name_prefix_idx  on public.app_users (lower(name)  text_pattern_ops);
create index app_users_email_prefix_idx on public.app_users (lower(email) text_pattern_ops);
create index app_users_created_idx      on public.app_users (created_at desc, id);

-- member listing per organization (ordered by insertion) and lookups by identity
create index tenant_users_tenant_seq_idx on public.tenant_users (tenant_id, seq);

-- audit trail filtered by category / newest first
create index platform_audit_logs_category_idx on public.platform_audit_logs (category, timestamp desc);
