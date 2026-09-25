-- Torna a criação automática de férias idempotente e remove duplicidades geradas por carregamentos paralelos.
delete from public.hr_vacation_periods v
using (
  select tenant_id, id,
         row_number() over (partition by tenant_id, employee_id, acquisition_start, acquisition_end order by seq asc) as rn
    from public.hr_vacation_periods
) d
where v.tenant_id = d.tenant_id
  and v.id = d.id
  and d.rn > 1;

create unique index if not exists hr_vacations_employee_acquisition_uidx
  on public.hr_vacation_periods (tenant_id, employee_id, acquisition_start, acquisition_end);
