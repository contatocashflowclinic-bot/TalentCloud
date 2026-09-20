-- =====================================================================
-- Origem da avaliação assistida por IA (transparência / rastreabilidade).
--   source = 'gemini'    : nota gerada pelo modelo de IA.
--   source = 'heuristic' : estimativa local por regras simples (Gemini não configurado ou sem resposta).
--                          NÃO é uma avaliação de IA e a tela precisa deixar isso explícito.
--   source = NULL        : avaliações anteriores a esta migration, cuja origem não foi registrada.
-- =====================================================================
alter table public.ai_evaluations
  add column source text check (source in ('gemini', 'heuristic'));

-- Estimativas locais já gravadas eram marcadas só pelo texto do parecer
update public.ai_evaluations
   set source = 'heuristic'
 where detailed_explanation like '⚠ ESTIMATIVA LOCAL%';
