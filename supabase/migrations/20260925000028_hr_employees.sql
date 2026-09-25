-- Módulo RH / Colaboradores: base mestre por organização, sem dados sensíveis no v1.
create table public.employees (
  seq              bigint generated always as identity,
  tenant_id        text not null references public.tenants (id) on delete cascade,
  id               text not null,
  name             text not null,
  email            text,
  phone            text,
  status           text not null default 'active' check (status in ('active', 'onboarding', 'inactive')),
  origin           text not null default 'manual' check (origin in ('hired_candidate', 'tenant_user', 'manual')),
  candidate_id     text,
  user_id          text,
  onboarding_id    text,
  development_id   text,
  position_id      text,
  job_title        text not null default '',
  department_id    text,
  manager_id       text,
  hire_date        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by_id    text,
  created_by_name  text,
  primary key (tenant_id, id),
  foreign key (tenant_id, candidate_id) references public.candidates (tenant_id, id) on delete set null,
  foreign key (tenant_id, user_id) references public.tenant_users (tenant_id, id) on delete set null,
  foreign key (tenant_id, position_id) references public.job_positions (tenant_id, id) on delete set null,
  foreign key (tenant_id, department_id) references public.departments (tenant_id, id) on delete set null,
  foreign key (tenant_id, manager_id) references public.tenant_users (tenant_id, id) on delete set null
);
create unique index employees_candidate_uidx on public.employees (tenant_id, candidate_id) where candidate_id is not null;
create unique index employees_user_uidx on public.employees (tenant_id, user_id) where user_id is not null;
create index employees_status_idx on public.employees (tenant_id, status, seq);
create index employees_position_idx on public.employees (tenant_id, position_id);
create index employees_department_idx on public.employees (tenant_id, department_id);
alter table public.employees enable row level security;
revoke all on public.employees from anon, authenticated;

alter table public.onboarding_journeys add column employee_id text;
alter table public.collaborator_development add column employee_id text;
alter table public.turnover_alerts add column employee_id text;

alter table public.onboarding_journeys
  add foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete set null;
alter table public.collaborator_development
  add foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete set null;
alter table public.turnover_alerts
  add foreign key (tenant_id, employee_id) references public.employees (tenant_id, id) on delete set null;

create index onboarding_journeys_employee_idx on public.onboarding_journeys (tenant_id, employee_id);
create index collaborator_development_employee_idx on public.collaborator_development (tenant_id, employee_id);
create index turnover_alerts_employee_idx on public.turnover_alerts (tenant_id, employee_id);

-- Backfill idempotente: contratações existentes viram colaboradores canônicos.
insert into public.employees (
  tenant_id, id, name, email, phone, status, origin, candidate_id, onboarding_id, position_id,
  job_title, department_id, manager_id, hire_date, created_at, updated_at, created_by_name
)
select
  o.tenant_id,
  'emp-' || o.id,
  o.candidate_name,
  nullif(c.email, ''),
  nullif(c.phone, ''),
  case when o.status = 'preparing' then 'onboarding' else 'active' end,
  'hired_candidate',
  c.id,
  o.id,
  p.id,
  coalesce(nullif(p.title, ''), nullif(o.job_title, ''), 'Cargo a definir'),
  o.department_id,
  o.mentor_id,
  o.hire_date,
  now(),
  now(),
  'Migração automática'
from public.onboarding_journeys o
left join public.candidates c on c.tenant_id = o.tenant_id and c.id = o.candidate_id
left join public.job_offers jf on jf.tenant_id = o.tenant_id and jf.candidate_id = o.candidate_id and jf.status = 'accepted'
left join public.job_openings jo on jo.tenant_id = o.tenant_id and jo.id = jf.job_opening_id
left join public.job_positions p on p.tenant_id = jo.tenant_id and p.id = jo.position_id
where not exists (
  select 1
    from public.employees e
   where e.tenant_id = o.tenant_id
     and (e.onboarding_id = o.id or (c.id is not null and e.candidate_id = c.id))
);

update public.onboarding_journeys o
   set employee_id = e.id
  from public.employees e
 where e.tenant_id = o.tenant_id
   and (e.onboarding_id = o.id or (e.candidate_id is not null and e.candidate_id = o.candidate_id))
   and o.employee_id is null;

update public.collaborator_development d
   set employee_id = e.id
  from public.employees e
 where e.tenant_id = d.tenant_id
   and (e.candidate_id = d.collaborator_id or e.user_id = d.collaborator_id)
   and d.employee_id is null;

update public.employees e
   set development_id = d.id,
       updated_at = now()
  from public.collaborator_development d
 where d.tenant_id = e.tenant_id
   and d.employee_id = e.id
   and e.development_id is null;

update public.turnover_alerts a
   set employee_id = e.id
  from public.employees e
 where e.tenant_id = a.tenant_id
   and (e.candidate_id = a.collaborator_id or e.user_id = a.collaborator_id)
   and a.employee_id is null;

