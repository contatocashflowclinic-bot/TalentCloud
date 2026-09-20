-- =====================================================================
-- Admissão: catálogo de itens exigidos na contratação (por organização) e a
-- pasta de admissão de cada contratação (guardada na própria jornada de onboarding,
-- no mesmo padrão jsonb do checklist). Os arquivos ficam no Supabase Storage.
-- =====================================================================
create table public.admission_templates (
  seq                   bigint generated always as identity,
  tenant_id             text not null references public.tenants (id) on delete cascade,
  id                    text not null,
  name                  text not null,
  category              text not null
                        check (category in ('Documentos pessoais', 'Exames', 'Dados bancários e dependentes', 'Contratuais', 'Etapas internas')),
  description           text not null default '',
  required              boolean not null default true,
  requires_document     boolean not null default true,
  responsible           text not null default 'RH' check (responsible in ('RH', 'Candidato', 'DP', 'Jurídico', 'TI')),
  due_days_before_start integer not null default 5 check (due_days_before_start >= 0),
  contract_types        text[] not null default '{CLT,PJ}',
  active                boolean not null default true,
  primary key (tenant_id, id)
);

create unique index admission_templates_name_uidx on public.admission_templates (tenant_id, lower(name));

alter table public.admission_templates enable row level security;
revoke all on public.admission_templates from anon, authenticated;

alter table public.onboarding_journeys add column admission jsonb not null default '[]';
