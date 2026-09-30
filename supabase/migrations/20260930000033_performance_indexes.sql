-- Performance indexes for high-growth operational workflows outside the recruiting board.
-- All tenant-owned indexes keep tenant_id as the leading column to match scoped queries.

-- Candidate lifecycle joins and cleanup paths.
create index if not exists job_offers_candidate_status_idx
  on public.job_offers (tenant_id, candidate_id, status, seq);

create index if not exists job_offers_opening_status_idx
  on public.job_offers (tenant_id, job_opening_id, status, seq);

create index if not exists onboarding_journeys_candidate_idx
  on public.onboarding_journeys (tenant_id, candidate_id, seq);

create index if not exists onboarding_journeys_status_idx
  on public.onboarding_journeys (tenant_id, status, seq);

create index if not exists collaborator_development_collaborator_idx
  on public.collaborator_development (tenant_id, collaborator_id, seq);

create index if not exists collaborator_development_manager_next_idx
  on public.collaborator_development (tenant_id, manager_id, next_review_date)
  where manager_id is not null and next_review_date <> '';

create index if not exists turnover_alerts_collaborator_status_idx
  on public.turnover_alerts (tenant_id, collaborator_id, status, seq);

create index if not exists turnover_alerts_owner_status_idx
  on public.turnover_alerts (tenant_id, owner_id, status, seq)
  where owner_id is not null;

-- PDI-created agenda events are located by id LIKE prefix || '%'.
create index if not exists agenda_events_id_prefix_idx
  on public.agenda_events (tenant_id, id text_pattern_ops, status, starts_at desc);

-- Resume-screening worker and detail/cleanup paths.
create index if not exists resume_screenings_queue_idx
  on public.resume_screenings (tenant_id, status, attempts, analyzing_since, seq);

create index if not exists resume_screenings_candidate_idx
  on public.resume_screenings (tenant_id, candidate_id, seq desc)
  where candidate_id is not null;

-- Master audit uses keyset pagination by timestamp and id, optionally filtered by category or tenant.
create index if not exists platform_audit_logs_ts_id_idx
  on public.platform_audit_logs (timestamp desc, id desc);

create index if not exists platform_audit_logs_category_ts_id_idx
  on public.platform_audit_logs (category, timestamp desc, id desc);

create index if not exists platform_audit_logs_tenant_ts_id_idx
  on public.platform_audit_logs (tenant_id, timestamp desc, id desc)
  where tenant_id is not null;
-- Candidate free-text search also checks e-mail and skills.
create index if not exists candidates_email_trgm_idx
  on public.candidates using gin (lower(email) gin_trgm_ops);

create or replace function public.text_array_join_immutable(input text[], separator text)
returns text
language sql
immutable
parallel safe
as $$ select array_to_string($1, $2) $$;

create index if not exists candidates_skills_trgm_idx
  on public.candidates using gin (lower(public.text_array_join_immutable(skills, ' ')) gin_trgm_ops);