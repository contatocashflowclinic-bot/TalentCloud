-- Platform CRM: demo requests captured by the public sales page.
create table public.sales_leads (
  id                 text primary key,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  name               text not null,
  email              text not null,
  phone              text not null,
  company            text not null,
  role_title         text not null,
  employee_range     text not null check (employee_range in ('1-20', '21-50', '51-100', '101-250', '251-500', '500+')),
  pain               text not null check (pain in ('hiring', 'consistency', 'development', 'retention', 'scattered_data', 'indicators', 'other')),
  pain_details       text,
  preferred_date     date not null,
  preferred_period   text not null check (preferred_period in ('morning', 'afternoon')),
  timezone           text not null default 'America/Sao_Paulo',
  status             text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'qualified', 'won', 'lost')),
  commercial_notes   text not null default '',
  next_follow_up_at  timestamptz,
  consent_at         timestamptz not null,
  source             text not null default 'sales_page',
  assigned_to        text
);
create index sales_leads_status_created_idx on public.sales_leads (status, created_at desc);
create index sales_leads_email_idx on public.sales_leads (lower(email));
create index sales_leads_follow_up_idx on public.sales_leads (next_follow_up_at) where next_follow_up_at is not null;
alter table public.sales_leads enable row level security;
revoke all on public.sales_leads from anon, authenticated;

alter table public.platform_audit_logs drop constraint platform_audit_logs_category_check;
alter table public.platform_audit_logs add constraint platform_audit_logs_category_check
  check (category in ('TENANT_ROUTING', 'DB_PROVISIONING', 'ACCESS_CONTROL', 'AI_EXECUTION', 'CANDIDATE_DATA', 'PEOPLE_DATA', 'SALES_CRM'));
