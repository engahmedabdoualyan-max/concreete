-- plants hierarchy: sites → plants → silos
-- Plant types: CONCRETE (بلانت خرسانة) | BLOCK (بلانت بلك)

create type plant_type_enum as enum ('CONCRETE', 'BLOCK');

create table if not exists plants (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references tenants(id) on delete restrict,
    site_id uuid not null references sites(id) on delete restrict,
    plant_code varchar(20) not null,
    plant_name varchar(120) not null,
    plant_type plant_type_enum not null, -- CONCRETE | BLOCK
    description text,
    is_active boolean not null default true,
    created_by_id uuid references users(id) on delete set null,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now(),
    unique (tenant_id, plant_code)
);

create index idx_plants_tenant on plants(tenant_id);
create index idx_plants_site on plants(site_id);
create index idx_plants_type on plants(plant_type);

-- Link silos to plants
alter table inventory_silos
    add column if not exists plant_id uuid references plants(id) on delete set null;

create index idx_silos_plant on inventory_silos(plant_id);

-- View for silos with plant and site info
create or replace view v_silos_with_plant as
select
    s.id as silo_id,
    s.silo_code,
    s.silo_name,
    s.material_category,
    s.current_stock_kg,
    s.capacity_kg,
    s.reorder_level_kg,
    round((s.current_stock_kg::numeric / nullif(s.capacity_kg::numeric,0)) * 100, 1) as stock_pct,
    (s.current_stock_kg <= s.reorder_level_kg) as is_low_stock,
    (s.current_stock_kg <= s.reorder_level_kg * 0.5) as is_critical,
    case when s.current_stock_kg > 0 and s.reorder_level_kg > 0
         then floor((s.current_stock_kg - s.reorder_level_kg) / nullif((s.current_stock_kg - s.reorder_level_kg) / 30, 0))
         else null end as days_remaining,
    p.id as plant_id,
    p.plant_code,
    p.plant_name,
    p.plant_type,
    st.id as site_id,
    st.site_code,
    st.site_name
from inventory_silos s
left join plants p on p.id = s.plant_id
left join sites st on st.id = p.site_id;

-- Grants (commented - fimto_app role may not exist)
-- grant select, insert, update, delete on plants to fimto_app;
-- grant select on v_silos_with_plant to fimto_app;