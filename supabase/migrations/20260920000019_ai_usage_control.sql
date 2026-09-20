-- =====================================================================
-- Controle de créditos e consumo da IA (Conta Mãe)
--
--   ai_settings       : regras da plataforma (uma única linha): IA ligada/pausada, teto de gasto do mês, limite padrão
--                       por organização, o que fazer ao atingir o limite e os preços usados para estimar o custo.
--   ai_org_limits     : limite mensal PRÓPRIO de uma organização (sem linha = vale o padrão da plataforma).
--   ai_usage_events   : um registro por avaliação pedida (com IA, estimativa local, falha ou bloqueio), com o volume de
--                       texto processado e o custo estimado em R$ NA ÉPOCA (mudar o preço depois não reescreve o passado).
-- O custo é uma ESTIMATIVA (volume de texto × preço informado). A fatura oficial é a do Google.
-- =====================================================================
create table public.ai_settings (
  id                        boolean primary key default true check (id),   -- linha única
  enabled                   boolean not null default true,
  model                     text,                                          -- null = usa o padrão do ambiente
  monthly_budget_brl        numeric check (monthly_budget_brl is null or monthly_budget_brl >= 0),
  default_org_monthly_limit integer check (default_org_monthly_limit is null or default_org_monthly_limit >= 0),
  on_limit                  text not null default 'estimate' check (on_limit in ('estimate', 'block')),
  price_input_usd           numeric check (price_input_usd is null or price_input_usd >= 0),   -- US$ por 1 milhão (texto enviado)
  price_output_usd          numeric check (price_output_usd is null or price_output_usd >= 0), -- US$ por 1 milhão (texto respondido)
  usd_brl_rate              numeric check (usd_brl_rate is null or usd_brl_rate > 0),
  prices_updated_at         timestamptz,
  updated_at                timestamptz not null default now(),
  updated_by                text
);

-- Valores iniciais de referência (preço do Gemini Flash no site do Google e dólar de 20/09/2026). Ajustáveis no painel.
insert into public.ai_settings (id, price_input_usd, price_output_usd, usd_brl_rate, prices_updated_at)
values (true, 0.75, 3.75, 5.14, now());

create table public.ai_org_limits (
  tenant_id     text primary key references public.tenants (id) on delete cascade,
  monthly_limit integer not null check (monthly_limit >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    text
);

create table public.ai_usage_events (
  seq           bigint generated always as identity,
  id            text primary key,
  tenant_id     text not null references public.tenants (id) on delete cascade,
  occurred_at   timestamptz not null default now(),
  user_id       text,
  user_name     text,
  candidate_id  text,
  job_opening_id text,
  evaluation_id text,
  model         text,
  -- ai        : a IA respondeu (gera custo)
  -- failed    : tentou a IA e ela falhou; o usuário recebeu a estimativa local
  -- estimate  : nem tentou (IA pausada, limite atingido ou sem chave); estimativa local
  -- blocked   : pedido barrado por limite (a organização optou por bloquear)
  outcome       text not null check (outcome in ('ai', 'failed', 'estimate', 'blocked')),
  reason        text check (reason in ('not_configured', 'paused', 'limit_reached', 'budget_reached', 'error')),
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  duration_ms   integer,
  cost_brl      numeric                                                    -- null = havia consumo mas faltava informar o preço
);

create index ai_usage_events_time_idx   on public.ai_usage_events (occurred_at desc);
create index ai_usage_events_tenant_idx on public.ai_usage_events (tenant_id, occurred_at desc);

alter table public.ai_settings     enable row level security;
alter table public.ai_org_limits   enable row level security;
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_settings, public.ai_org_limits, public.ai_usage_events from anon, authenticated;
