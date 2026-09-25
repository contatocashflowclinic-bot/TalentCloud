-- Corrige textos com caracteres especiais quebrados na primeira carga do módulo RH.
update public.employees
   set created_by_name = 'Migração automática',
       updated_at = now()
 where created_by_name <> 'Migração automática'
   and created_by_name like 'Migra%autom%tica';
