-- Estrutura, Cargos, Vagas e Candidatos passam a ter a ação "alterar" (edição dos cards).
-- O perfil administrador já possui tudo. O perfil de sistema "Recrutador / RH" ganha alterar em Vagas e Candidatos,
-- rotinas em que ele já podia incluir. Perfis personalizados não são tocados: a permissão é concedida na tela de Perfis.
update public.access_profiles
   set permissions = permissions
       || case when 'openings:edit' = any(permissions) then '{}'::text[] else array['openings:edit'] end
       || case when 'candidates:edit' = any(permissions) then '{}'::text[] else array['candidates:edit'] end
 where id = 'recruiter' and is_system
   and 'openings:create' = any(permissions) and 'candidates:create' = any(permissions);
