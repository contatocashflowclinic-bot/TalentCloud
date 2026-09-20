-- =====================================================================
-- Documentos da proposta: contrato assinado, aditivos e demais anexos.
-- Só os metadados ficam aqui (jsonb, no mesmo padrão da pasta de admissão);
-- os arquivos ficam no Supabase Storage e são baixados pela API.
-- =====================================================================
alter table public.job_offers add column documents jsonb not null default '[]';
