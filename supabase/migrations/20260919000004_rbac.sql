-- =====================================================================
-- Users & permissions (RBAC)
--
--   app_users         global identity (e-mail + password), one per person
--   tenant_users      the LINK between an identity and an organization (its PK
--                     (tenant_id, id) is still what the rest of the schema references)
--   access_profiles   per-organization profiles = sets of `routine:action` permissions
--
-- A member has ONE profile in each organization plus optional individual
-- exceptions (granted_permissions / revoked_permissions).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Global identity
-- ---------------------------------------------------------------------
create table public.app_users (
  id                   text primary key,
  name                 text not null,
  email                text not null,
  password_hash        text,
  must_change_password boolean not null default false,
  active               boolean not null default true,
  password_changed_at  timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now()
);
create unique index app_users_email_lower_idx on public.app_users (lower(email));

-- ---------------------------------------------------------------------
-- Access profiles (per organization)
-- ---------------------------------------------------------------------
create table public.access_profiles (
  seq         bigint generated always as identity,
  tenant_id   text not null references public.tenants (id) on delete cascade,
  id          text not null,
  name        text not null,
  description text not null default '',
  is_admin    boolean not null default false,   -- always holds every permission
  is_system   boolean not null default false,   -- created with the organization; cannot be deleted
  permissions text[] not null default '{}',
  primary key (tenant_id, id),
  check (is_admin <= is_system)
);
create unique index access_profiles_name_lower_idx on public.access_profiles (tenant_id, lower(name));
-- exactly one admin profile per organization
create unique index access_profiles_one_admin_idx on public.access_profiles (tenant_id) where is_admin;

-- Default profiles for every existing organization (mirrors DEFAULT_PROFILES in src/access.ts)
insert into public.access_profiles (tenant_id, id, name, description, is_admin, is_system, permissions)
select t.id, p.id, p.name, p.description, p.is_admin, true, p.permissions
  from public.tenants t
 cross join (values
  ('admin', 'Administrador da Organização', 'Acesso total a todas as rotinas, inclusive usuários e perfis.', true, '{}'::text[]),
  ('recruiter', 'Recrutador / RH', 'Conduz vagas, candidatos, processo seletivo, entrevistas e propostas.', false,
    array['users:view', 'dna:view', 'structure:view', 'positions:view', 'openings:view', 'openings:create', 'candidates:view', 'candidates:create', 'selection:view', 'selection:create', 'selection:edit', 'ai_evaluation:view', 'ai_evaluation:create', 'ai_evaluation:edit', 'interviews:view', 'interviews:create', 'interviews:edit', 'offers:view', 'offers:create', 'offers:edit', 'onboarding:view', 'onboarding:edit', 'development:view', 'development:edit', 'retention:view', 'retention:edit', 'indicators:view']),
  ('hiring_manager', 'Gestor da Vaga', 'Acompanha o processo, decide etapas, avalia e aprova propostas.', false,
    array['users:view', 'dna:view', 'structure:view', 'positions:view', 'openings:view', 'candidates:view', 'selection:view', 'selection:edit', 'ai_evaluation:view', 'ai_evaluation:edit', 'interviews:view', 'interviews:edit', 'offers:view', 'offers:edit', 'onboarding:view', 'onboarding:edit', 'development:view', 'development:edit', 'retention:view', 'retention:edit', 'indicators:view']),
  ('interviewer', 'Entrevistador', 'Consulta candidatos e preenche scorecards de entrevistas.', false,
    array['users:view', 'dna:view', 'structure:view', 'positions:view', 'openings:view', 'candidates:view', 'selection:view', 'ai_evaluation:view', 'interviews:view', 'interviews:edit']),
  ('collaborator', 'Colaborador', 'Consulta DNA, estrutura, cargos e vagas abertas.', false,
    array['dna:view', 'structure:view', 'positions:view', 'openings:view'])
 ) as p (id, name, description, is_admin, permissions);

-- ---------------------------------------------------------------------
-- Move credentials to the global identity
-- (one identity per e-mail; when the same e-mail existed in several
--  organizations, the credentials of the oldest link win)
-- ---------------------------------------------------------------------
insert into public.app_users (id, name, email, password_hash, must_change_password)
select 'usr-' || substr(md5(lower(e.email)), 1, 8), e.name, e.email, e.password_hash, e.must_change_password
  from (
    select distinct on (lower(email)) name, email, password_hash, must_change_password
      from public.tenant_users
     order by lower(email), seq
  ) e;

alter table public.tenant_users
  add column user_id             text references public.app_users (id),
  add column profile_id          text,
  add column granted_permissions text[] not null default '{}',
  add column revoked_permissions text[] not null default '{}';

update public.tenant_users tu
   set user_id = au.id,
       profile_id = case tu.role
         when 'ORG_ADMIN' then 'admin'
         when 'RECRUITER' then 'recruiter'
         when 'HIRING_MANAGER' then 'hiring_manager'
         when 'INTERVIEWER' then 'interviewer'
         else 'collaborator'
       end
  from public.app_users au
 where lower(au.email) = lower(tu.email);

alter table public.tenant_users
  alter column user_id set not null,
  alter column profile_id set not null,
  add constraint tenant_users_profile_fk
    foreign key (tenant_id, profile_id) references public.access_profiles (tenant_id, id),
  add constraint tenant_users_one_link_per_org unique (tenant_id, user_id);
create index tenant_users_user_idx on public.tenant_users (user_id);
create index tenant_users_profile_idx on public.tenant_users (tenant_id, profile_id);

alter table public.tenant_users
  drop column role,
  drop column permissions,
  drop column password_hash,
  drop column must_change_password;

-- Sessions now point at the identity (principal_id = app_users.id, tenant_id = active organization)
delete from public.auth_sessions where principal_type = 'tenant_user';

-- ---------------------------------------------------------------------
-- Security baseline for the new tables
-- ---------------------------------------------------------------------
alter table public.app_users       enable row level security;
alter table public.access_profiles enable row level security;
revoke all on public.app_users       from anon, authenticated;
revoke all on public.access_profiles from anon, authenticated;
