-- =====================================================================
-- O cargo de uma pessoa é sempre um Cargo cadastrado (módulo Cargos), nunca um texto livre.
--
--   * `tenant_users.position_id`: vínculo da pessoa com um Cargo cadastrado. `job_title` continua na tabela como o
--     título desse cargo (mantido em sincronia pelo servidor) e como rótulo legado das pessoas ainda não vinculadas.
--   * As perguntas estratégicas por cargo das pesquisas de clima passam a apontar para Cargos cadastrados (ids), e os
--     templates sugerem cargos pelos atributos do cadastro (nível e trilha), sem palavras-chave livres.
--
-- Vínculo automático das pessoas que já existem: só quando o texto do cargo é IGUAL ao título de UM único cargo ativo da
-- mesma organização (sem diferenciar maiúsculas). As demais continuam sem vínculo até o RH escolher o cargo delas.
--
-- Os blocos de pesquisa guardavam cargos como texto. A migration 21 acabou de entrar e nenhuma pesquisa ou template com
-- blocos por cargo foi criado; por isso não há dados de blocos para converter.
-- =====================================================================
alter table public.tenant_users
  add column position_id text;

alter table public.tenant_users
  add foreign key (tenant_id, position_id) references public.job_positions (tenant_id, id) on delete set null (position_id);

create index tenant_users_position_idx on public.tenant_users (tenant_id, position_id);

update public.tenant_users u
   set position_id = m.position_id
  from (
    select tu.tenant_id, tu.id as user_id, min(p.id) as position_id
      from public.tenant_users tu
      join public.job_positions p
        on p.tenant_id = tu.tenant_id and p.status = 'active' and lower(btrim(p.title)) = lower(btrim(tu.job_title))
     group by tu.tenant_id, tu.id
    having count(*) = 1
  ) m
 where u.tenant_id = m.tenant_id and u.id = m.user_id;
