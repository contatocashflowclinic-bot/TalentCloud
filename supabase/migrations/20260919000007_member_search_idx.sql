-- Prefix search of an organization's members (name / e-mail) served by the database
create index tenant_users_email_prefix_idx on public.tenant_users (tenant_id, lower(email) text_pattern_ops);
create index tenant_users_name_prefix_idx  on public.tenant_users (tenant_id, lower(name)  text_pattern_ops);
