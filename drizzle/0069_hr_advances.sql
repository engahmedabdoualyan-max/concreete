-- hr_advances — Employee salary advances with repayment schedule
-- Linked to payroll_payments for auto-deduction each payroll period

create table if not exists hr_advances (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete restrict,
    employee_id uuid not null references payroll_employees(id) on delete cascade,
    request_id uuid references hr_requests(id) on delete set null,

    -- Core amounts
    principal_sar numeric(12,2) not null,           -- المبلغ الأساسي
    repayment_mode varchar(16) not null,            -- FIXED | PERCENTAGE
    installment_amount_sar numeric(12,2),           -- قيمة القسط (لو FIXED)
    installment_pct numeric(5,2),                   -- نسبة القسط (لو PERCENTAGE) من الراتب الأساسي
    total_installments int not null default 1,      -- عدد الأقساط الكلي

    -- Status & tracking
    status varchar(16) not null default 'PENDING',  -- PENDING | APPROVED | ACTIVE | COMPLETED | CANCELLED
    paid_installments int not null default 0,       -- الأقساط المسددة
    remaining_sar numeric(12,2) not null default 0, -- الرصيد المتبقي
    next_deduction_period varchar(7),               -- فترة الخصم القادمة YYYY-MM

    -- Approval
    requested_by_id uuid not null references users(id) on delete restrict,
    requested_at timestamp not null default now(),
    approved_by_id uuid references users(id) on delete set null,
    approved_at timestamp,
    approval_note varchar(500),

    -- Cancellation (if terminated, etc.)
    cancelled_by_id uuid references users(id) on delete set null,
    cancelled_at timestamp,
    cancel_reason varchar(500),

    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create index idx_hr_adv_tenant on hr_advances(tenant_id);
create index idx_hr_adv_employee on hr_advances(employee_id);
create index idx_hr_adv_status on hr_advances(status);
create index idx_hr_adv_period on hr_advances(next_deduction_period);

-- View for advance installments (for payroll integration)
create or replace view hr_advance_installments as
select
    a.id as advance_id,
    a.tenant_id,
    a.employee_id,
    a.principal_sar,
    a.repayment_mode,
    a.installment_amount_sar,
    a.installment_pct,
    a.total_installments,
    a.paid_installments,
    a.remaining_sar,
    a.next_deduction_period,
    a.status,
    -- Compute this month's deduction amount
    case
        when a.repayment_mode = 'FIXED' then least(a.installment_amount_sar, a.remaining_sar)
        when a.repayment_mode = 'PERCENTAGE' and pe.base_salary_sar is not null
            then least(round(pe.base_salary_sar * a.installment_pct / 100, 2), a.remaining_sar)
        else 0
    end as this_month_deduction_sar,
    -- Remaining after this month
    greatest(a.remaining_sar -
        case
            when a.repayment_mode = 'FIXED' then least(a.installment_amount_sar, a.remaining_sar)
            when a.repayment_mode = 'PERCENTAGE' and pe.base_salary_sar is not null
                then least(round(pe.base_salary_sar * a.installment_pct / 100, 2), a.remaining_sar)
            else 0
        end, 0) as remaining_after_sar,
    -- Next period
    case
        when a.next_deduction_period is not null then
            to_char((a.next_deduction_period || '-01')::date + interval '1 month', 'YYYY-MM')
        else null
    end as next_period_after
from hr_advances a
left join payroll_employees pe on pe.id = a.employee_id
where a.status = 'ACTIVE' and a.remaining_sar > 0;

-- Grant
grant select, insert, update on hr_advances to fimto_app;
grant select on hr_advance_installments to fimto_app;