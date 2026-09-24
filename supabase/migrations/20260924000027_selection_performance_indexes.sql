-- Performance indexes for high-volume recruiting workflows.
-- These are additive and keep the tenant_id prefix used by every scoped query.

create index if not exists selection_applications_job_stage_idx
  on public.selection_applications (tenant_id, job_opening_id, current_stage_id, status, seq);

create index if not exists ai_evaluations_job_candidate_seq_idx
  on public.ai_evaluations (tenant_id, job_opening_id, candidate_id, seq desc);

create index if not exists interview_sessions_job_schedule_idx
  on public.interview_sessions (tenant_id, job_opening_id, scheduled_for);
create index if not exists selection_applications_candidate_applied_idx
  on public.selection_applications (tenant_id, candidate_id, applied_at desc);