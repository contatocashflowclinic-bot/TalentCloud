-- =====================================================================
-- Templates de pesquisa de clima com perguntas estratégicas por cargo
--
--   * Uma pesquisa continua com o núcleo fixo (recomendação/eNPS + 5 categorias + comentário) e ganha BLOCOS de perguntas
--     estratégicas. Cada bloco vale para todos ou só para certos cargos (o campo "cargo" do usuário).
--   * `climate_campaigns.blocks`: cópia dos blocos no momento da criação (editável só enquanto for rascunho).
--   * `climate_surveys.block_answers`: respostas às perguntas dos blocos, por id de pergunta. Continua ANÔNIMA: não há
--     usuário nem cargo gravado na resposta; quem viu cada bloco é deduzido pela definição da pesquisa.
--   * `survey_templates`: templates da organização (cópias editáveis ou criados do zero). Os templates padrão do sistema
--     ficam no código e não têm linha aqui.
-- =====================================================================
alter table public.climate_campaigns
  add column blocks        jsonb not null default '[]',
  add column template_name text;

alter table public.climate_surveys
  add column block_answers jsonb  not null default '{}',
  add column hidden_texts  text[] not null default '{}';

create table public.survey_templates (
  seq             bigint generated always as identity,
  tenant_id       text not null references public.tenants (id) on delete cascade,
  id              text not null,
  name            text not null,
  description     text not null default '',
  focus           text,
  blocks          jsonb not null default '[]',
  based_on        text,
  created_by_name text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (tenant_id, id)
);

create unique index survey_templates_name_idx on public.survey_templates (tenant_id, lower(name));

alter table public.survey_templates enable row level security;
revoke all on public.survey_templates from anon, authenticated;
