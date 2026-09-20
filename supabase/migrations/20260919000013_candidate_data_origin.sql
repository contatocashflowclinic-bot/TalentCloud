-- =====================================================================
-- Origem dos dados do candidato + histórico de alterações (compliance / LGPD).
--   data_origin = 'candidate' : cadastro feito pelo próprio candidato no portal público. Os campos
--                               declarados por ele NÃO podem ser editados; só corrigidos com motivo.
--   data_origin = 'rh'        : cadastro feito pelo RH (editável, com histórico).
-- candidate_changes é um registro de auditoria append-only: cada linha guarda o valor anterior, o novo,
-- quem alterou, quando e o motivo. Não pode ser atualizado.
-- =====================================================================
alter table public.candidates
  add column data_origin text not null default 'rh' check (data_origin in ('candidate', 'rh'));

-- Candidaturas já recebidas pelo portal público foram declaradas pelo próprio candidato
update public.candidates set data_origin = 'candidate' where 'Candidatura Portal Público' = any(tags);

create table public.candidate_changes (
  seq           bigint generated always as identity,
  tenant_id     text not null references public.tenants (id) on delete cascade,
  id            text not null,
  candidate_id  text not null,
  field         text not null,
  old_value     jsonb,
  new_value     jsonb,
  kind          text not null check (kind in ('correction', 'update')),
  reason        text,
  changed_by    text not null,
  changed_by_id text,
  changed_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id) on delete cascade
);

create index candidate_changes_candidate_idx on public.candidate_changes (tenant_id, candidate_id, seq desc);

alter table public.candidate_changes enable row level security;
revoke all on public.candidate_changes from anon, authenticated;

create function public.candidate_changes_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'candidate_changes é um registro de auditoria e não pode ser alterado';
end
$$;

create trigger candidate_changes_no_update
  before update on public.candidate_changes
  for each row execute function public.candidate_changes_immutable();
