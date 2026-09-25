-- Permite anexar arquivo (PDF/JPG/PNG) aos documentos de RH cadastrados diretamente na pasta do colaborador.
alter table public.hr_documents add column file_mime text;
alter table public.hr_documents add column file_size integer;
alter table public.hr_documents add column file_path text;
