-- =====================================================================
-- Catálogo de benefícios por organização.
-- Usado na montagem das propostas (Módulo 11). `default_levels` lista os níveis de cargo
-- para os quais o benefício já vem marcado no pacote-padrão da proposta.
-- =====================================================================
create table public.benefit_catalog (
  seq            bigint generated always as identity,
  tenant_id      text not null references public.tenants (id) on delete cascade,
  id             text not null,
  name           text not null,
  category       text not null default 'Outros'
                 check (category in ('Saúde', 'Alimentação', 'Financeiro', 'Bem-estar', 'Trabalho', 'Outros')),
  description    text not null default '',
  active         boolean not null default true,
  default_levels text[] not null default '{}',
  primary key (tenant_id, id)
);

create unique index benefit_catalog_name_uidx on public.benefit_catalog (tenant_id, lower(name));

alter table public.benefit_catalog enable row level security;
revoke all on public.benefit_catalog from anon, authenticated;
