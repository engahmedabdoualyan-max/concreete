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

-- Enable Row Level Security. The legacy app-level username is NOT an identity
-- provider; direct browser CRUD is intentionally not allowed anymore.
alter table public.plant_profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.gps_locations enable row level security;

-- Remove the historical public policies. With no replacement policy, anon and
-- ordinary authenticated clients are denied; the server API/service role must
-- perform tenant-scoped access after it is deployed.
drop policy if exists "public access" on public.plant_profiles;
drop policy if exists "public access" on public.admin_users;
drop policy if exists "public access" on public.gps_locations;

-- Do not seed a default password. Provision the first owner through the secure
-- server-side account flow after identity/tenant claims are configured.
