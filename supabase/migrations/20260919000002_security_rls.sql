-- =====================================================================
-- Security baseline
--
-- The Supabase REST API (PostgREST) exposes the public schema to the
-- anon/authenticated roles. All access to TalentCloud data goes through
-- the Express server (direct Postgres connection), so we:
--   1. enable Row Level Security on every table, with NO policies
--      (default deny for anon/authenticated), and
--   2. revoke table privileges from those roles as a second barrier.
-- The server role (postgres) bypasses RLS and enforces tenant_id filters.
-- =====================================================================

alter table public.tenants                 enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.platform_audit_logs     enable row level security;
alter table public.tenant_users            enable row level security;
alter table public.organizational_dna      enable row level security;
alter table public.departments             enable row level security;
alter table public.job_positions           enable row level security;
alter table public.job_openings            enable row level security;
alter table public.candidates              enable row level security;
alter table public.selection_applications  enable row level security;
alter table public.ai_evaluations          enable row level security;
alter table public.interview_sessions      enable row level security;
alter table public.job_offers              enable row level security;
alter table public.onboarding_journeys     enable row level security;
alter table public.collaborator_development enable row level security;
alter table public.climate_surveys         enable row level security;
alter table public.turnover_alerts         enable row level security;
alter table public.tenant_indicators       enable row level security;
alter table public.schema_migrations       enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
