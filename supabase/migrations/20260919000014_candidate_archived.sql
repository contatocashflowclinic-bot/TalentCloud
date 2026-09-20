-- Arquivamento de perfil no Banco de Talentos: o perfil sai da lista principal, mas nada é apagado
-- (candidaturas, avaliações e histórico continuam). O motivo e quem arquivou ficam em candidate_changes.
alter table public.candidates add column archived boolean not null default false;
