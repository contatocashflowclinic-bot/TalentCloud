-- The Entrevistador profile no longer lists selection:view / ai_evaluation:view: the Processo Seletivo and
-- Avaliação IA modules stay hidden for it, while the API keeps serving that data as supporting reads
-- (GET /applications and /ai/evaluations also accept candidates:view or interviews:view).
-- Only profiles that still hold the original default set are touched; customized ones are left alone.
update public.access_profiles
   set permissions = array['users:view', 'dna:view', 'structure:view', 'positions:view', 'openings:view', 'candidates:view', 'interviews:view', 'interviews:edit']
 where id = 'interviewer' and is_system
   and cardinality(permissions) = 10
   and 'selection:view' = any(permissions) and 'ai_evaluation:view' = any(permissions);
