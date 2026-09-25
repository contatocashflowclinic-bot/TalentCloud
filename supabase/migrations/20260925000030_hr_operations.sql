-- RH completo: documentos com vencimento, férias e controle operacional de folha.
-- V1 não armazena salário individual, CPF, dados bancários nem verbas sensíveis.
create table public.hr_documents (
  seq              bigint generated always as identity,
  tenant_id        text not null references public.tenants (id) on delete cascade,
  id               text not null,
  employee_id      text not null,
  name             text not null,
  category         text not null default 'Geral',
  issue_date       text,
  expires_at       text,
  status           text not null default 'valid' check (status in ('pending', 'valid', 'expired', 'archived')),
  file_name        text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by_id    text,
  created_by_name  text,
  primary key (tenant_id, id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index hr_documents_employee_idx on public.hr_documents (tenant_id, employee_id, seq);
create index hr_documents_expiry_idx on public.hr_documents (tenant_id, expires_at) where expires_at is not null and status <> 'archived';
alter table public.hr_documents enable row level security;
revoke all on public.hr_documents from anon, authenticated;

create table public.hr_vacation_periods (
  seq                bigint generated always as identity,
  tenant_id          text not null references public.tenants (id) on delete cascade,
  id                 text not null,
  employee_id        text not null,
  acquisition_start  text not null,
  acquisition_end    text not null,
  start_date         text,
  end_date           text,
  return_date        text,
  days               integer not null default 30 check (days >= 0 and days <= 60),
  status             text not null default 'accrued' check (status in ('accrued', 'scheduled', 'approved', 'in_progress', 'completed', 'cancelled')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by_id      text,
  created_by_name    text,
  primary key (tenant_id, id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create index hr_vacations_employee_idx on public.hr_vacation_periods (tenant_id, employee_id, seq);
create index hr_vacations_schedule_idx on public.hr_vacation_periods (tenant_id, start_date, status) where start_date is not null;
alter table public.hr_vacation_periods enable row level security;
revoke all on public.hr_vacation_periods from anon, authenticated;

create table public.hr_payroll_records (
  seq                bigint generated always as identity,
  tenant_id          text not null references public.tenants (id) on delete cascade,
  id                 text not null,
  employee_id        text not null,
  period             text not null,
  status             text not null default 'open' check (status in ('open', 'collecting', 'review', 'closed')),
  admission_event    boolean not null default false,
  vacation_event     boolean not null default false,
  leave_event        boolean not null default false,
  overtime_notes     text,
  variable_notes     text,
  notes              text,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by_id      text,
  created_by_name    text,
  primary key (tenant_id, id),
  foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete cascade
);
create unique index hr_payroll_employee_period_uidx on public.hr_payroll_records (tenant_id, employee_id, period);
create index hr_payroll_period_idx on public.hr_payroll_records (tenant_id, period, status);
alter table public.hr_payroll_records enable row level security;
revoke all on public.hr_payroll_records from anon, authenticated;
