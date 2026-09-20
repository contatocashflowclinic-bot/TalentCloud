-- =====================================================================
-- Agenda Corporativa: reuniões e tarefas compartilhadas por toda a organização.
-- Sem rotina de permissão associada — igual ao Portal de Vagas, é comum a todos
-- os colaboradores da organização, independentemente do perfil de acesso.
-- =====================================================================
create table public.agenda_events (
  seq             bigint generated always as identity,
  tenant_id       text not null references public.tenants (id) on delete cascade,
  id              text not null,
  type            text not null check (type in ('meeting', 'task')),
  title           text not null,
  description     text not null default '',
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'in_progress', 'done', 'cancelled')),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  location        text,
  agenda          text[] not null default '{}',
  summary         text,
  assignee_ids    text[] not null default '{}',
  created_by_id   text not null,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  primary key (tenant_id, id)
);

create index agenda_events_starts_at_idx on public.agenda_events (tenant_id, starts_at);
create index agenda_events_assignees_gin_idx on public.agenda_events using gin (assignee_ids);

alter table public.agenda_events enable row level security;
revoke all on public.agenda_events from anon, authenticated;
