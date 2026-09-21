-- =====================================================================
-- Retenção de Talentos & Clima
--
--   1. Alertas de turnover ganham um ciclo de vida (status, responsável, histórico) e só pode haver UM alerta ativo
--      por colaborador.
--   2. Pesquisas de clima passam a ser aplicadas dentro do sistema: campanhas (climate_campaigns), respostas
--      anônimas (climate_surveys) e controle de "quem já respondeu" (climate_participation).
--   3. Nova rotina de permissão `climate` (ação "view" = responder a pesquisa). É o que deixa um Colaborador
--      responder sem ter acesso aos alertas e resultados da Retenção.
--   4. Nova categoria de auditoria PEOPLE_DATA (dados sensíveis de pessoas).
--
-- ANONIMATO: a resposta NÃO guarda o usuário. A tabela de participação guarda apenas quem respondeu (e o dia), sem
-- coluna sequencial e sem ligação com a resposta, para que a ordem de gravação não permita casar as duas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Alertas de turnover
-- ---------------------------------------------------------------------
alter table public.turnover_alerts
  add column status          text not null default 'open'
                             check (status in ('open', 'monitoring', 'resolved', 'dismissed', 'left')),
  add column owner_id        text,
  add column department_id   text,
  add column history         jsonb not null default '[]',
  add column created_at      timestamptz not null default now(),
  add column created_by      text,
  add column updated_at      timestamptz not null default now(),
  add column resolved_at     timestamptz,
  add column resolution_note text;

-- Um alerta ativo (aberto ou em acompanhamento) por colaborador
create unique index turnover_alerts_one_active_idx
  on public.turnover_alerts (tenant_id, collaborator_id)
  where status in ('open', 'monitoring');

create index turnover_alerts_status_idx on public.turnover_alerts (tenant_id, status);

-- ---------------------------------------------------------------------
-- 2. Campanhas de pesquisa de clima
-- ---------------------------------------------------------------------
create table public.climate_campaigns (
  seq             bigint generated always as identity,
  tenant_id       text not null references public.tenants (id) on delete cascade,
  id              text not null,
  name            text not null,
  period          text not null,
  description     text,
  status          text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  audience        text not null default 'all' check (audience in ('all', 'departments')),
  department_ids  text[] not null default '{}',
  closes_on       text check (closes_on ~ '^\d{4}-\d{2}-\d{2}$'),
  action_plan     text,
  created_by_id   text not null,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  published_at    timestamptz,
  closed_at       timestamptz,
  primary key (tenant_id, id)
);

-- Respostas: `campaign_id` nulo = pesquisa histórica (importada), agrupada pelo campo `period`
alter table public.climate_surveys
  add column campaign_id     text,
  add column department_id   text,
  add column comment_hidden  boolean not null default false,
  add foreign key (tenant_id, campaign_id) references public.climate_campaigns (tenant_id, id) on delete cascade;

create index climate_surveys_campaign_idx on public.climate_surveys (tenant_id, campaign_id);

-- Quem já respondeu. Sem `seq`, sem horário e sem referência à resposta (ver nota sobre anonimato).
create table public.climate_participation (
  tenant_id    text not null,
  campaign_id  text not null,
  user_id      text not null,
  responded_on text not null check (responded_on ~ '^\d{4}-\d{2}-\d{2}$'),
  primary key (tenant_id, campaign_id, user_id),
  foreign key (tenant_id, campaign_id) references public.climate_campaigns (tenant_id, id) on delete cascade
);

alter table public.climate_campaigns     enable row level security;
alter table public.climate_participation enable row level security;
revoke all on public.climate_campaigns     from anon, authenticated;
revoke all on public.climate_participation from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Rotina `climate` (responder pesquisas)
--    Perfis de sistema (menos o administrador, que já tem tudo) passam a poder responder. Perfis personalizados não são
--    tocados: a permissão é concedida na tela de Perfis. Organizações que já têm a Retenção contratada ganham a rotina.
-- ---------------------------------------------------------------------
update public.access_profiles
   set permissions = permissions || array['climate:view']
 where is_system and not is_admin and not ('climate:view' = any(permissions));

update public.tenants
   set enabled_routines = enabled_routines || array['climate']
 where 'retention' = any(enabled_routines) and not ('climate' = any(enabled_routines));

-- ---------------------------------------------------------------------
-- 4. Auditoria: dados sensíveis de pessoas
-- ---------------------------------------------------------------------
alter table public.platform_audit_logs drop constraint platform_audit_logs_category_check;
alter table public.platform_audit_logs
  add constraint platform_audit_logs_category_check
  check (category in ('TENANT_ROUTING', 'DB_PROVISIONING', 'ACCESS_CONTROL', 'AI_EXECUTION', 'CANDIDATE_DATA', 'PEOPLE_DATA'));
