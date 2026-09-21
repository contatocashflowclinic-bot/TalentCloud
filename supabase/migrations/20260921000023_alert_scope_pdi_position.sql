-- =====================================================================
-- 1. Sigilo dos alertas de turnover por equipe
--    * `turnover_alerts.created_by_id`: quem abriu o alerta (id do vínculo na organização). Quem abriu sempre enxerga o seu.
--    * Nova rotina de permissão `retention_all` ("Alertas de toda a organização"): sem ela, a pessoa só vê os alertas da
--      própria equipe (que ela gerencia, dos quais é responsável ou que ela abriu). O perfil de sistema "Recrutador / RH"
--      passa a ter a rotina (o administrador já tem tudo); "Gestor da Vaga" não. Perfis personalizados não são tocados.
-- 2. O cargo do PDI também é sempre um Cargo cadastrado (`collaborator_development.position_id`), nunca texto livre.
--    `job_title` continua como o título desse cargo (mantido pelo servidor) e como rótulo dos PDIs ainda não vinculados.
--    Vínculo automático dos PDIs que já existem: só quando o texto é IGUAL ao título de UM único cargo ativo da organização.
-- =====================================================================
alter table public.turnover_alerts
  add column created_by_id text;

update public.access_profiles
   set permissions = permissions || array['retention_all:view']
 where id = 'recruiter' and is_system and not ('retention_all:view' = any(permissions));

update public.tenants
   set enabled_routines = enabled_routines || array['retention_all']
 where 'retention' = any(enabled_routines) and not ('retention_all' = any(enabled_routines));

alter table public.collaborator_development
  add column position_id text;

alter table public.collaborator_development
  add foreign key (tenant_id, position_id) references public.job_positions (tenant_id, id) on delete set null (position_id);

create index collaborator_development_position_idx on public.collaborator_development (tenant_id, position_id);

update public.collaborator_development d
   set position_id = m.position_id
  from (
    select cd.tenant_id, cd.id as record_id, min(p.id) as position_id
      from public.collaborator_development cd
      join public.job_positions p
        on p.tenant_id = cd.tenant_id and p.status = 'active' and lower(btrim(p.title)) = lower(btrim(cd.job_title))
     group by cd.tenant_id, cd.id
    having count(*) = 1
  ) m
 where d.tenant_id = m.tenant_id and d.id = m.record_id;
