-- =====================================================================
-- TalentCloud - Core schema (multi-organization, shared database)
--
-- Isolation model: every tenant-owned table carries tenant_id, primary
-- keys are (tenant_id, id) and cross-table references are COMPOSITE
-- foreign keys, so the database itself rejects links across tenants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PLATFORM LEVEL (Conta Mãe / SuperAdmin)
-- ---------------------------------------------------------------------
create table public.tenants (
  id            text primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name          text not null,
  trading_name  text not null,
  document      text not null,
  contact_email text not null,
  logo_url      text,
  status        text not null default 'active'
                check (status in ('active', 'suspended', 'provisioning', 'maintenance')),
  plan          text not null check (plan in ('Starter', 'Scale', 'Enterprise')),
  created_at    timestamptz not null default now(),
  db_config     jsonb not null,
  features      jsonb not null
);

create table public.platform_admins (
  id         text primary key,
  name       text not null,
  email      text unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.platform_audit_logs (
  id                text primary key,
  timestamp         timestamptz not null default now(),
  tenant_id         text,
  user_id           text not null,
  user_name         text not null,
  action            text not null,
  category          text not null
                    check (category in ('TENANT_ROUTING', 'DB_PROVISIONING', 'ACCESS_CONTROL', 'AI_EXECUTION', 'CANDIDATE_DATA')),
  details           text not null,
  ip_address        text not null,
  database_affected text not null
);
create index platform_audit_logs_ts_idx on public.platform_audit_logs (timestamp desc);
create index platform_audit_logs_tenant_idx on public.platform_audit_logs (tenant_id, timestamp desc);

-- ---------------------------------------------------------------------
-- TENANT LEVEL
-- ---------------------------------------------------------------------

-- 2. Usuários e permissões (SUPER_ADMIN lives in platform_admins, never here)
create table public.tenant_users (
  seq           bigint generated always as identity,
  tenant_id     text not null references public.tenants (id) on delete cascade,
  id            text not null,
  name          text not null,
  email         text not null,
  role          text not null
                check (role in ('ORG_ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COLLABORATOR')),
  department_id text,
  job_title     text not null,
  avatar_url    text,
  active        boolean not null default true,
  last_login_at timestamptz not null default now(),
  permissions   text[] not null default '{}',
  primary key (tenant_id, id),
  unique (tenant_id, email)
);

-- 3. DNA organizacional (one per tenant)
create table public.organizational_dna (
  tenant_id              text primary key references public.tenants (id) on delete cascade,
  mission                text not null,
  vision                 text not null,
  archetype              text not null,
  culture_summary        text not null,
  core_values            text[] not null default '{}',
  pillars                jsonb not null default '[]',
  cultural_fit_threshold numeric not null check (cultural_fit_threshold between 0 and 100),
  updated_at             timestamptz not null default now()
);

-- 4. Estrutura organizacional
create table public.departments (
  seq                bigint generated always as identity,
  tenant_id          text not null references public.tenants (id) on delete cascade,
  id                 text not null,
  name               text not null,
  code               text not null,
  parent_id          text,
  manager_id         text,
  cost_center        text not null,
  headcount_target   integer not null default 0 check (headcount_target >= 0),
  current_headcount  integer not null default 0 check (current_headcount >= 0),
  primary key (tenant_id, id),
  foreign key (tenant_id, parent_id) references public.departments (tenant_id, id)
);

-- 5. Cargos
create table public.job_positions (
  seq                     bigint generated always as identity,
  tenant_id               text not null references public.tenants (id) on delete cascade,
  id                      text not null,
  title                   text not null,
  department_id           text not null,
  level                   text not null
                          check (level in ('Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria')),
  description             text not null default '',
  technical_requirements  text[] not null default '{}',
  behavioral_competencies text[] not null default '{}',
  min_salary              numeric(12, 2) not null default 0,
  max_salary              numeric(12, 2) not null default 0,
  currency                text not null default 'BRL',
  career_track            text not null check (career_track in ('Y_TECNICO', 'GESTÃO', 'OPERACIONAL')),
  status                  text not null default 'active' check (status in ('active', 'archived')),
  primary key (tenant_id, id),
  foreign key (tenant_id, department_id) references public.departments (tenant_id, id),
  check (max_salary >= min_salary)
);

-- 6. Vagas
create table public.job_openings (
  seq                  bigint generated always as identity,
  tenant_id            text not null references public.tenants (id) on delete cascade,
  id                   text not null,
  position_id          text not null,
  title                text not null,
  department_id        text not null,
  hiring_manager_id    text,
  recruiter_id         text,
  status               text not null default 'open'
                       check (status in ('draft', 'open', 'in_progress', 'offer', 'filled', 'cancelled')),
  openings_count       integer not null default 1 check (openings_count > 0),
  filled_count         integer not null default 0 check (filled_count >= 0),
  work_model           text not null check (work_model in ('Presencial', 'Híbrido', 'Remoto')),
  location             text not null,
  sla_days             integer not null default 30,
  opened_at            timestamptz not null default now(),
  target_fill_date     timestamptz not null,
  stages               jsonb not null default '[]',
  custom_questions     text[],
  salary_offered_min   numeric(12, 2),
  salary_offered_max   numeric(12, 2),
  primary key (tenant_id, id),
  foreign key (tenant_id, position_id) references public.job_positions (tenant_id, id),
  foreign key (tenant_id, department_id) references public.departments (tenant_id, id)
);
create index job_openings_status_idx on public.job_openings (tenant_id, status);

-- 7. Candidatos
create table public.candidates (
  seq                 bigint generated always as identity,
  tenant_id           text not null references public.tenants (id) on delete cascade,
  id                  text not null,
  name                text not null,
  email               text not null,
  phone               text not null default '',
  location            text not null default '',
  linkedin_url        text,
  "current_role"      text not null default '',
  years_of_experience numeric not null default 0,
  education           text not null default '',
  resume_summary      text not null default '',
  skills              text[] not null default '{}',
  languages           text[] not null default '{}',
  registered_at       timestamptz not null default now(),
  tags                text[] not null default '{}',
  primary key (tenant_id, id)
);
create index candidates_email_idx on public.candidates (tenant_id, lower(email));

-- 8. Processo seletivo (inscrição de candidato em vaga)
create table public.selection_applications (
  seq                bigint generated always as identity,
  tenant_id          text not null references public.tenants (id) on delete cascade,
  id                 text not null,
  job_opening_id     text not null,
  candidate_id       text not null,
  current_stage_id   text not null,
  status             text not null default 'in_review'
                     check (status in ('in_review', 'advancing', 'hold', 'rejected', 'hired')),
  applied_at         timestamptz not null default now(),
  notes              text[] not null default '{}',
  ai_evaluation_id   text,
  primary key (tenant_id, id),
  foreign key (tenant_id, job_opening_id) references public.job_openings (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id),
  unique (tenant_id, job_opening_id, candidate_id)
);

-- 9. Avaliação assistida por IA
create table public.ai_evaluations (
  seq                          bigint generated always as identity,
  tenant_id                    text not null references public.tenants (id) on delete cascade,
  id                           text not null,
  candidate_id                 text not null,
  job_opening_id               text not null,
  evaluated_at                 timestamptz not null default now(),
  overall_fit_score            numeric not null,
  technical_fit_score          numeric not null,
  cultural_fit_score           numeric not null,
  detailed_explanation         text not null,
  key_strengths                text[] not null default '{}',
  potential_gaps               text[] not null default '{}',
  suggested_interview_questions text[] not null default '{}',
  pillar_scores                jsonb not null default '[]',
  human_reviewer_decision      text
                               check (human_reviewer_decision in ('APPROVED', 'REJECTED', 'REQUEST_ADDITIONAL_INTERVIEW', 'OVERRIDDEN')),
  human_notes                  text,
  reviewed_by                  text,
  reviewed_at                  timestamptz,
  primary key (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id),
  foreign key (tenant_id, job_opening_id) references public.job_openings (tenant_id, id)
);

-- 10. Entrevistas
create table public.interview_sessions (
  seq                        bigint generated always as identity,
  tenant_id                  text not null references public.tenants (id) on delete cascade,
  id                         text not null,
  job_opening_id             text not null,
  candidate_id               text not null,
  stage_name                 text not null,
  scheduled_for              timestamptz not null,
  interviewer_ids            text[] not null default '{}',
  duration_minutes           integer not null default 45,
  meet_link                  text,
  status                     text not null default 'scheduled'
                             check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  structured_script          text[] not null default '{}',
  scorecard                  jsonb not null default '[]',
  interviewer_recommendation text check (interviewer_recommendation in ('STRONG_YES', 'YES', 'NEUTRAL', 'NO')),
  overall_feedback           text,
  primary key (tenant_id, id),
  foreign key (tenant_id, job_opening_id) references public.job_openings (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id)
);

-- 11. Propostas
create table public.job_offers (
  seq            bigint generated always as identity,
  tenant_id      text not null references public.tenants (id) on delete cascade,
  id             text not null,
  job_opening_id text not null,
  candidate_id   text not null,
  base_salary    numeric(12, 2) not null check (base_salary >= 0),
  benefits       text[] not null default '{}',
  start_date     text not null,
  contract_type  text not null check (contract_type in ('CLT', 'PJ')),
  status         text not null default 'draft'
                 check (status in ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined')),
  approver_id    text,
  sent_at        timestamptz,
  responded_at   timestamptz,
  notes          text,
  primary key (tenant_id, id),
  foreign key (tenant_id, job_opening_id) references public.job_openings (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id)
);

-- 12. Onboarding
create table public.onboarding_journeys (
  seq                   bigint generated always as identity,
  tenant_id             text not null references public.tenants (id) on delete cascade,
  id                    text not null,
  candidate_id          text not null,
  candidate_name        text not null,
  job_title             text not null,
  department_id         text,
  mentor_id             text,
  hire_date             text not null,
  status                text not null default 'preparing' check (status in ('preparing', 'in_progress', 'completed')),
  checklists            jsonb not null default '[]',
  milestones_30_days_done boolean not null default false,
  milestones_60_days_done boolean not null default false,
  milestones_90_days_done boolean not null default false,
  notes                 text not null default '',
  primary key (tenant_id, id)
);

-- 13. Desenvolvimento (PDI e 1:1s)
create table public.collaborator_development (
  seq               bigint generated always as identity,
  tenant_id         text not null references public.tenants (id) on delete cascade,
  id                text not null,
  collaborator_id   text not null,
  collaborator_name text not null,
  job_title         text not null,
  department_id     text,
  manager_id        text,
  hire_date         text not null,
  goals             jsonb not null default '[]',
  one_on_ones       jsonb not null default '[]',
  last_review_date  text not null,
  next_review_date  text not null,
  primary key (tenant_id, id)
);

-- 14. Retenção
create table public.climate_surveys (
  seq               bigint generated always as identity,
  tenant_id         text not null references public.tenants (id) on delete cascade,
  id                text not null,
  period            text not null,
  enps_score        numeric not null check (enps_score between 0 and 10),
  sentiment         text not null check (sentiment in ('positive', 'neutral', 'negative')),
  category_ratings  jsonb not null,
  anonymous_comment text,
  primary key (tenant_id, id)
);

create table public.turnover_alerts (
  seq                    bigint generated always as identity,
  tenant_id              text not null references public.tenants (id) on delete cascade,
  id                     text not null,
  collaborator_id        text not null,
  collaborator_name      text not null,
  department             text not null,
  risk_level             text not null check (risk_level in ('Baixo', 'Médio', 'Alto')),
  early_warning_signals  text[] not null default '{}',
  suggested_actions      text[] not null default '{}',
  last_action_taken      text,
  primary key (tenant_id, id)
);

-- 15. Indicadores
create table public.tenant_indicators (
  tenant_id                    text not null references public.tenants (id) on delete cascade,
  period                       text not null,
  time_to_hire_days            numeric not null,
  cost_per_hire                numeric not null,
  early_turnover_90_days_rate  numeric not null,
  average_cultural_fit         numeric not null,
  open_positions_count         integer not null,
  total_hires_this_quarter     integer not null,
  retention_rate_12_months     numeric not null,
  candidate_nps                numeric not null,
  recruitment_funnel           jsonb not null,
  primary key (tenant_id, period)
);
