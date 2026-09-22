-- =====================================================================
-- Triagem Inteligente de Currículos
--
--   Cada arquivo de currículo (PDF ou Word) enviado para uma vaga vira uma linha em `resume_screenings`: o arquivo (guardado
--   no bucket privado `candidate-resumes`), o estado da leitura pela IA e o resultado (dados extraídos, verificação por
--   requisito do Cargo, notas por pilar do DNA). O candidato, a candidatura e a avaliação continuam sendo as tabelas de
--   sempre (`candidates`, `selection_applications`, `ai_evaluations`): esta tabela só liga o arquivo a elas.
--
--   Por que uma tabela nova e não colunas nas antigas: o arquivo existe antes do candidato (a IA ainda vai ler o e-mail
--   dele), e o mesmo arquivo não pode entrar duas vezes na mesma vaga (`content_hash`).
--
--   Estados: uploaded (guardado, aguardando a IA) → analyzing (a IA está lendo; uma leitura que passa de 90 s é tratada
--   como abandonada) → analyzed (lido, candidato e avaliação criados) | needs_data (lido, mas falta um dado, como o
--   e-mail, para criar o candidato) | failed (a IA não conseguiu ler; pode tentar de novo).
--
--   Migração apenas aditiva: nenhuma tabela existente é alterada.
-- =====================================================================

create table public.resume_screenings (
  seq              bigint generated always as identity,
  tenant_id        text not null references public.tenants (id) on delete cascade,
  id               text not null,
  job_opening_id   text not null,
  -- preenchidos quando o candidato, a candidatura e a avaliação são criados a partir da leitura
  candidate_id     text,
  application_id   text,
  evaluation_id    text,
  file_name        text not null,
  mime             text not null
                   check (mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes       integer not null check (size_bytes > 0),
  content_hash     text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  storage_path     text not null,
  status           text not null default 'uploaded'
                   check (status in ('uploaded', 'analyzing', 'analyzed', 'needs_data', 'failed')),
  failure_code     text,
  failure_message  text,
  attempts         integer not null default 0 check (attempts >= 0),
  analyzing_since  timestamptz,
  -- `summary`: o que a lista precisa (notas, contagens); `analysis`: a leitura completa (evidências, pilares, critérios usados)
  summary          jsonb,
  analysis         jsonb,
  model            text,
  prompt_version   text,
  criteria_hash    text,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  uploaded_by_id   text not null,
  uploaded_by_name text not null,
  uploaded_at      timestamptz not null default now(),
  analyzed_at      timestamptz,
  primary key (tenant_id, id),
  unique (tenant_id, job_opening_id, content_hash),
  foreign key (tenant_id, job_opening_id) references public.job_openings (tenant_id, id),
  foreign key (tenant_id, candidate_id)   references public.candidates (tenant_id, id),
  foreign key (tenant_id, application_id) references public.selection_applications (tenant_id, id),
  foreign key (tenant_id, evaluation_id)  references public.ai_evaluations (tenant_id, id)
);

create index resume_screenings_job_idx on public.resume_screenings (tenant_id, job_opening_id, seq desc);
create index resume_screenings_application_idx on public.resume_screenings (tenant_id, application_id)
  where application_id is not null;

alter table public.resume_screenings enable row level security;
revoke all on public.resume_screenings from anon, authenticated;
