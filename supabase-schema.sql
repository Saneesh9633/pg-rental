-- ============================================================
-- PG Home Stay Dashboard — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. TENANTS table
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  room_no     text not null,
  phone       text,
  deposit     numeric(10,2) default 0,
  join_date   date not null default current_date,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- 2. PAYMENTS table
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  month       text not null,   -- stored as "2026-06"
  rent        numeric(10,2) default 0,
  food        numeric(10,2) default 0,
  extra       numeric(10,2) default 0,
  note        text default '',
  status      text check (status in ('paid','pending')) default 'pending',
  paid_on     date,
  created_at  timestamptz default now()
);

-- 3. Row Level Security (RLS) — only authenticated users can access
alter table tenants enable row level security;
alter table payments enable row level security;

create policy "Authenticated users can read tenants"
  on tenants for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert tenants"
  on tenants for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update tenants"
  on tenants for update using (auth.role() = 'authenticated');

create policy "Authenticated users can delete tenants"
  on tenants for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can read payments"
  on payments for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert payments"
  on payments for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update payments"
  on payments for update using (auth.role() = 'authenticated');

create policy "Authenticated users can delete payments"
  on payments for delete using (auth.role() = 'authenticated');

-- 4. Seed sample data (optional — remove if not needed)
insert into tenants (name, room_no, phone, deposit, join_date) values
  ('Arif',  'Room 1', '9876500001', 1500, '2026-04-01'),
  ('Rahul', 'Room 2', '9876500002', 1500, '2026-04-01'),
  ('Tintu', 'Room 3', '9876500003', 1500, '2026-04-18');
