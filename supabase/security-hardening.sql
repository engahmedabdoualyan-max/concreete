-- Fimto website Supabase containment migration
-- Apply only after the server API is deployed and tested with the intended
-- authenticated tenant model. This removes public CRUD policies; it does not
-- create a replacement policy because the current browser username model is
-- not an identity provider.

begin;

alter table public.plant_profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.gps_locations enable row level security;

drop policy if exists "public access" on public.plant_profiles;
drop policy if exists "public access" on public.admin_users;
drop policy if exists "public access" on public.gps_locations;

-- Verify before/after from an anonymous client:
--   select * from public.plant_profiles;       -- must fail
--   select * from public.admin_users;           -- must fail
--   select * from public.gps_locations;         -- must fail
--
-- The server API must use its private service-role/database connection and
-- enforce tenantId in every query. Do not restore using(true) policies.

commit;
