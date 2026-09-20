-- =====================================================================
-- Modelo do Checklist de Integração (pós-início) por organização.
-- Cada contratação recebe uma cópia dos itens escolhidos na própria jornada de onboarding
-- (coluna jsonb `checklists`, já existente).
-- =====================================================================
create table public.integration_templates (
  seq         bigint generated always as identity,
  tenant_id   text not null references public.tenants (id) on delete cascade,
  id          text not null,
  name        text not null,
  category    text not null
              check (category in ('Documentação', 'TI & Acessos', 'Cultura & Boas-Vindas', 'Treinamento Técnico')),
  responsible text not null default 'Gestor' check (responsible in ('RH', 'TI', 'Gestor', 'Buddy')),
  due_day     integer not null default 1 check (due_day >= 0 and due_day <= 365),
  active      boolean not null default true,
  primary key (tenant_id, id)
);

create unique index integration_templates_name_uidx on public.integration_templates (tenant_id, lower(name));

alter table public.integration_templates enable row level security;
revoke all on public.integration_templates from anon, authenticated;
