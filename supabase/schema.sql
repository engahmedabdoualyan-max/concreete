-- ============================================================
-- Concrete ERP — Supabase schema
-- Run this once in Supabase SQL Editor (project mxdirmrmfuycrbqvjrsb)
-- ============================================================

-- 1) Plant profiles (admin panel plant data + shared GPS)
create table if not exists public.plant_profiles (
  username text primary key,
  name text,
  manager text,
  address text,
  city text,
  country text,
  phone text,
  email text,
  license_number text,
  capacity_m3 text,
  mixer_count text,
  truck_count text,
  founding_year text,
  notes text,
  gps_lat double precision,
  gps_lng double precision,
  gps_updated_at timestamptz,
  updated_at timestamptz default now()
);

-- 2) Admin / managed users
create table if not exists public.admin_users (
  username text primary key,
  password text,
  name text,
  email text,
  phone text,
  plant_name text,
  country text,
  city text,
  role text,
  is_active boolean default true,
  permissions jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 3) Shared GPS locations (plant + sites, consumed by all sections)
create table if not exists public.gps_locations (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  label text not null default 'site',
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz default now(),
  unique (username, label)
);

-- Enable Row Level Security (open to app-level auth)
alter table public.plant_profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.gps_locations enable row level security;

-- Policies: allow app-level login (username stored in DB) to read/write.
drop policy if exists "public access" on public.plant_profiles;
create policy "public access" on public.plant_profiles for all using (true) with check (true);

drop policy if exists "public access" on public.admin_users;
create policy "public access" on public.admin_users for all using (true) with check (true);

drop policy if exists "public access" on public.gps_locations;
create policy "public access" on public.gps_locations for all using (true) with check (true);

-- Initial admin row (matches the app's default admin account)
insert into public.admin_users (username, password, name, role, is_active, permissions)
values ('admin', 'admin123', 'Plant Owner', 'owner', true, '{"operations":true,"production":true,"workshop":true,"mixing":true,"schedule":true,"orders":true,"evaluation":true,"rnd":true}')
on conflict (username) do nothing;
