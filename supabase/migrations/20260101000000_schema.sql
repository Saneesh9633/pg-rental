-- =====================================================================
-- PG Rental Management — core schema
-- Targets Supabase (Postgres 15). Run via `supabase db push` / `db reset`.
--
-- Design rules (see README "Business rules"):
--  * Rent lives on the STAY (per tenant, per bed) -> custom rent per tenant.
--  * Invoices copy rent into invoice_items -> later price changes never
--    touch historical invoices.
--  * Beds are real rows, one active stay per bed (partial unique index)
--    -> a room can never be over-allocated; checkout frees the bed.
--  * Security deposits are a separate ledger (deposit_transactions).
--  * Every financial table is audited (append-only audit_log).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type app_role as enum ('super_admin', 'manager', 'accountant');
create type sharing_type as enum ('single', 'double', 'triple');
create type room_status as enum ('available', 'maintenance');
create type tenant_status as enum ('active', 'checked_out');
create type id_proof_type as enum ('aadhaar', 'passport', 'driving_license', 'voter_id', 'pan', 'other');
create type invoice_item_kind as enum ('rent', 'electricity', 'food', 'laundry', 'maintenance', 'other', 'discount', 'adjustment');
create type payment_method as enum ('cash', 'upi', 'bank_transfer', 'card', 'deposit_adjustment');
create type deposit_txn_kind as enum ('collected', 'refund', 'deduction', 'adjusted_against_dues');
create type expense_category as enum ('electricity', 'water', 'food_groceries', 'internet', 'cleaning', 'maintenance', 'staff_salary', 'other');

-- ------------------------------------------------------------- helpers
create function today_ist() returns date language sql stable as
$$ select (now() at time zone 'Asia/Kolkata')::date $$;

create sequence invoice_seq;
create sequence receipt_seq;

-- ------------------------------------------------------------ profiles
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  role        app_role not null default 'manager',
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- First user ever becomes an active super admin. Everyone else is created
-- INACTIVE: a super admin must activate them (done by the /api/users route).
-- Metadata is deliberately ignored so a self-signup can never pick a role.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from profiles) into first_user;
  insert into profiles (id, full_name, email, role, active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
          new.email, case when first_user then 'super_admin' else 'manager' end::app_role, first_user);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function current_app_role() returns app_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and active $$;

create function has_role(variadic roles app_role[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(current_app_role() = any (roles), false) $$;

-- Trusted callers: direct DB sessions (seed/migrations) and the service role.
create function assert_role(variadic roles app_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if session_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' then return; end if;
  if not has_role(variadic roles) then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
end $$;

-- Never allow the last active super admin to be demoted, deactivated or removed.
create function keep_one_super_admin() returns trigger language plpgsql as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'super_admin' or not new.active)
     and old.role = 'super_admin' and old.active
     and not exists (select 1 from profiles where role = 'super_admin' and active and id <> old.id) then
    raise exception 'At least one active Super Admin is required.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger profiles_keep_super_admin before update or delete on profiles
  for each row execute function keep_one_super_admin();

-- ------------------------------------------------------------ settings
create table settings (
  id                   int primary key default 1 check (id = 1),
  pg_name              text not null default 'My PG',
  address              text not null default '',
  phone                text not null default '',
  email                text not null default '',
  due_day              int  not null default 5 check (due_day between 1 and 28),
  reminder_days_before int  not null default 3 check (reminder_days_before between 0 and 15),
  checkout_notice_days int  not null default 7 check (checkout_notice_days between 0 and 60),
  default_deposit_months int not null default 2 check (default_deposit_months between 0 and 12),
  upi_id               text not null default '',
  receipt_footer       text not null default 'Thank you!',
  updated_at           timestamptz not null default now()
);
insert into settings (id) values (1);

-- ------------------------------------------------------------- pricing
create table pricing (
  sharing       sharing_type primary key,
  beds_per_room int not null check (beds_per_room between 1 and 10),
  monthly_rent  numeric(12,2) not null check (monthly_rent >= 0),  -- per bed / person
  updated_at    timestamptz not null default now()
);
insert into pricing (sharing, beds_per_room, monthly_rent) values
  ('single', 1, 8000), ('double', 2, 5000), ('triple', 3, 4000);

-- --------------------------------------------------------- rooms & beds
create table rooms (
  id           uuid primary key default gen_random_uuid(),
  room_no      text not null unique,
  sharing      sharing_type not null,
  total_beds   int not null check (total_beds between 1 and 10),
  rent_per_bed numeric(12,2) check (rent_per_bed >= 0),     -- null => use pricing table
  status       room_status not null default 'available',
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table beds (
  id       uuid primary key default gen_random_uuid(),
  room_id  uuid not null references rooms (id) on delete cascade,
  bed_no   int  not null,
  active   boolean not null default true,
  unique (room_id, bed_no)
);

-- --------------------------------------------------- tenants & stays
create table tenants (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (length(trim(full_name)) > 1),
  photo_path       text,
  phone            text not null check (phone ~ '^[0-9+ -]{8,15}$'),
  email            text,
  emergency_name   text not null default '',
  emergency_phone  text not null default '',
  address          text not null default '',
  id_proof_type    id_proof_type,
  id_proof_number  text not null default '',
  status           tenant_status not null default 'active',
  created_at       timestamptz not null default now()
);

create table stays (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id),
  bed_id           uuid not null references beds (id),
  start_date       date not null,
  end_date         date,
  monthly_rent     numeric(12,2) not null check (monthly_rent >= 0),
  is_custom_rent   boolean not null default false,
  planned_checkout date,
  created_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
-- THE capacity rule: one open stay per bed, one open stay per tenant.
create unique index stays_one_active_per_bed    on stays (bed_id)    where end_date is null;
create unique index stays_one_active_per_tenant on stays (tenant_id) where end_date is null;
create index stays_tenant_idx on stays (tenant_id);

create table tenant_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  doc_type    text not null default 'Other',
  file_name   text not null,
  file_path   text not null,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table tenant_recurring_charges (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  kind       invoice_item_kind not null check (kind in ('electricity', 'food', 'laundry', 'maintenance', 'other')),
  label      text not null,
  amount     numeric(12,2) not null check (amount > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Security deposit ledger — never mixed with rental income.
create table deposit_transactions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id),
  stay_id    uuid references stays (id),
  kind       deposit_txn_kind not null,
  amount     numeric(12,2) not null check (amount > 0),
  txn_date   date not null default today_ist(),
  method     payment_method,
  note       text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------- invoices & payments
create table invoices (
  id         uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default ('INV-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('invoice_seq')::text, 4, '0')),
  tenant_id  uuid not null references tenants (id),
  stay_id    uuid not null references stays (id),
  period     date not null check (extract(day from period) = 1),
  due_date   date not null,
  notes      text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, period)
);

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices (id) on delete cascade,
  kind        invoice_item_kind not null,
  description text not null,
  amount      numeric(12,2) not null,
  created_at  timestamptz not null default now(),
  check ((kind = 'discount' and amount <= 0)
      or (kind = 'adjustment')
      or (kind not in ('discount', 'adjustment') and amount >= 0))
);
create index invoice_items_invoice_idx on invoice_items (invoice_id);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  receipt_no  text not null unique default ('RCT-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('receipt_seq')::text, 4, '0')),
  invoice_id  uuid not null references invoices (id),
  tenant_id   uuid not null references tenants (id),
  amount      numeric(12,2) not null check (amount > 0),
  method      payment_method not null,
  reference   text not null default '',
  paid_on     date not null default today_ist(),
  note        text not null default '',
  received_by uuid default auth.uid(),
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text,
  created_at  timestamptz not null default now()
);
create index payments_invoice_idx on payments (invoice_id);
create index payments_paid_on_idx on payments (paid_on);

-- ------------------------------------------------------------- expenses
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  category     expense_category not null,
  amount       numeric(12,2) not null check (amount > 0),
  expense_date date not null default today_ist(),
  description  text not null default '',
  vendor       text not null default '',
  receipt_path text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index expenses_date_idx on expenses (expense_date);

-- -------------------------------------------------------- notifications
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('due_reminder', 'overdue', 'payment_received', 'checkout_reminder')),
  title       text not null,
  body        text not null default '',
  tenant_id   uuid references tenants (id),
  invoice_id  uuid references invoices (id),
  dedupe_key  text not null unique,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ audit log
create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  table_name text not null,
  row_id     text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb
);
create index audit_log_table_idx on audit_log (table_name, at desc);

create function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  j := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  insert into audit_log (actor, table_name, row_id, action, old_data, new_data)
  values (auth.uid(), tg_table_name, coalesce(j ->> 'id', j ->> 'sharing'), tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end $$;

create function block_mutation() returns trigger language plpgsql as
$$ begin raise exception '% is append-only', tg_table_name; end $$;

create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function block_mutation();
create trigger deposit_immutable before update or delete on deposit_transactions
  for each row execute function block_mutation();

do $$
declare t text;
begin
  foreach t in array array['rooms', 'pricing', 'tenants', 'stays', 'invoices', 'invoice_items',
                           'payments', 'deposit_transactions', 'expenses', 'profiles',
                           'tenant_recurring_charges', 'settings']
  loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()',
                   'audit_' || t, t);
  end loop;
end $$;

-- ----------------------------------------------------- business triggers
-- Rooms: keep beds in sync with total_beds; never shrink / close an occupied room.
create function sync_beds() returns trigger language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if tg_op = 'UPDATE' then
    if new.total_beds < old.total_beds and exists (
         select 1 from stays s join beds b on b.id = s.bed_id
         where b.room_id = new.id and b.bed_no > new.total_beds and s.end_date is null) then
      raise exception 'Cannot reduce beds: a bed being removed is occupied.';
    end if;
    if new.status = 'maintenance' and old.status <> 'maintenance' and exists (
         select 1 from stays s join beds b on b.id = s.bed_id
         where b.room_id = new.id and s.end_date is null) then
      raise exception 'Room % still has tenants; transfer or check them out before maintenance.', new.room_no;
    end if;
  end if;
  for i in 1 .. new.total_beds loop
    insert into beds (room_id, bed_no) values (new.id, i) on conflict (room_id, bed_no) do nothing;
  end loop;
  update beds set active = (bed_no <= new.total_beds) where room_id = new.id;
  return null;
end $$;
create trigger rooms_sync_beds after insert or update on rooms
  for each row execute function sync_beds();

-- Stays: only into an active bed of a room that is not under maintenance.
create function check_stay_allowed() returns trigger language plpgsql as $$
declare r rooms; b beds;
begin
  select * into b from beds where id = new.bed_id;
  select * into r from rooms where id = b.room_id;
  if not b.active then raise exception 'Bed is not in use.'; end if;
  if r.status = 'maintenance' then raise exception 'Room % is under maintenance.', r.room_no; end if;
  return new;
end $$;
create trigger stays_check before insert on stays
  for each row execute function check_stay_allowed();

-- Keep tenant.status in line with stays (checkout => bed free automatically).
create function sync_tenant_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update tenants set status = case when new.end_date is null then 'active' else 'checked_out' end::tenant_status
  where id = new.tenant_id
    and not exists (select 1 from stays where tenant_id = new.tenant_id and end_date is null and id <> new.id and new.end_date is not null);
  return null;
end $$;
create trigger stays_sync_status after insert or update of end_date on stays
  for each row execute function sync_tenant_status();

-- Payments: bind tenant to invoice, no overpayment, immutable except void.
create function payments_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare inv invoices; total numeric; paid numeric;
begin
  if tg_op = 'DELETE' then raise exception 'Payments cannot be deleted. Void the payment instead.'; end if;
  if tg_op = 'UPDATE' then
    if (new.invoice_id, new.tenant_id, new.amount, new.method, new.reference, new.paid_on, new.receipt_no)
       is distinct from (old.invoice_id, old.tenant_id, old.amount, old.method, old.reference, old.paid_on, old.receipt_no) then
      raise exception 'A recorded payment cannot be edited. Void it and record a new one.';
    end if;
    return new;
  end if;
  select * into inv from invoices where id = new.invoice_id for update;
  new.tenant_id := inv.tenant_id;
  select coalesce(sum(amount), 0) into total from invoice_items where invoice_id = inv.id;
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = inv.id and voided_at is null;
  if new.amount > total - paid then
    raise exception 'Payment of % exceeds the balance of % on invoice %.', new.amount, total - paid, inv.invoice_no;
  end if;
  return new;
end $$;
create trigger payments_guard_trg before insert or update or delete on payments
  for each row execute function payments_guard();

-- Payment confirmation notification.
create function payment_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare t_name text; inv_no text;
begin
  select full_name into t_name from tenants where id = new.tenant_id;
  select invoice_no into inv_no from invoices where id = new.invoice_id;
  insert into notifications (kind, title, body, tenant_id, invoice_id, dedupe_key)
  values ('payment_received', 'Payment received from ' || t_name,
          'Rs. ' || new.amount || ' via ' || new.method || ' against ' || inv_no || ' (' || new.receipt_no || ')',
          new.tenant_id, new.invoice_id, 'pay:' || new.id)
  on conflict do nothing;
  return null;
end $$;
create trigger payments_notify after insert on payments
  for each row execute function payment_notify();

-- Pricing / settings housekeeping
create function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at := now(); return new; end $$;
create trigger pricing_touch  before update on pricing  for each row execute function touch_updated_at();
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

-- ----------------------------------------------------------------- views
create view v_invoice_summary with (security_invoker = true) as
select i.id, i.invoice_no, i.tenant_id, i.stay_id, i.period, i.due_date, i.notes, i.created_at,
       t.full_name as tenant_name, t.phone as tenant_phone,
       r.id as room_id, r.room_no, r.sharing, b.bed_no,
       coalesce(it.rent, 0)  as rent,
       coalesce(it.total, 0) as total,
       coalesce(p.paid, 0)   as paid,
       coalesce(it.total, 0) - coalesce(p.paid, 0) as balance,
       case when coalesce(it.total, 0) - coalesce(p.paid, 0) <= 0 then 'paid'
            when i.due_date < today_ist() then 'overdue'
            when coalesce(p.paid, 0) > 0 then 'partial'
            else 'pending' end as status
from invoices i
join tenants t on t.id = i.tenant_id
join stays s   on s.id = i.stay_id
join beds b    on b.id = s.bed_id
join rooms r   on r.id = b.room_id
left join lateral (select sum(amount) as total, sum(amount) filter (where kind = 'rent') as rent
                   from invoice_items where invoice_id = i.id) it on true
left join lateral (select sum(amount) as paid
                   from payments where invoice_id = i.id and voided_at is null) p on true;

create view v_deposit_balance with (security_invoker = true) as
select tenant_id,
       coalesce(sum(amount) filter (where kind = 'collected'), 0) as collected,
       coalesce(sum(amount) filter (where kind <> 'collected'), 0) as released,
       coalesce(sum(amount) filter (where kind = 'collected'), 0)
         - coalesce(sum(amount) filter (where kind <> 'collected'), 0) as held
from deposit_transactions group by tenant_id;

create view v_room_overview with (security_invoker = true) as
select r.id as room_id, r.room_no, r.sharing, r.total_beds, r.status, r.notes,
       coalesce(r.rent_per_bed, p.monthly_rent) as rent_per_bed,
       r.rent_per_bed as custom_rent_per_bed,
       count(s.id) as occupied,
       r.total_beds - count(s.id) as available,
       case when r.status = 'maintenance' then 'maintenance'
            when count(s.id) >= r.total_beds then 'fully_occupied'
            else 'available' end as display_status,
       coalesce(jsonb_agg(jsonb_build_object('tenant_id', t.id, 'name', t.full_name, 'bed_no', b.bed_no,
                                             'rent', s.monthly_rent, 'since', s.start_date)
                          order by b.bed_no) filter (where s.id is not null), '[]'::jsonb) as occupants
from rooms r
join pricing p on p.sharing = r.sharing
left join beds b on b.room_id = r.id and b.active
left join stays s on s.bed_id = b.id and s.end_date is null
left join tenants t on t.id = s.tenant_id
group by r.id, p.monthly_rent;

create view v_bed_status with (security_invoker = true) as
select b.id as bed_id, b.room_id, b.bed_no, r.room_no, r.sharing, r.status as room_status,
       s.id as stay_id, s.tenant_id, t.full_name as tenant_name
from beds b
join rooms r on r.id = b.room_id
left join stays s on s.bed_id = b.id and s.end_date is null
left join tenants t on t.id = s.tenant_id
where b.active;

create view v_tenant_current with (security_invoker = true) as
select t.*, s.id as stay_id, s.bed_id, s.start_date, s.end_date, s.monthly_rent, s.is_custom_rent, s.planned_checkout,
       r.id as room_id, r.room_no, r.sharing, b.bed_no,
       coalesce(d.held, 0) as deposit_held, coalesce(d.collected, 0) as deposit_collected
from tenants t
left join lateral (select * from stays where tenant_id = t.id order by (end_date is null) desc, start_date desc limit 1) s on true
left join beds b on b.id = s.bed_id
left join rooms r on r.id = b.room_id
left join v_deposit_balance d on d.tenant_id = t.id;

-- --------------------------------------------------------- RPC: billing
create function calc_rent_for_period(p_rent numeric, p_start date, p_end date, p_period date)
returns numeric language plpgsql immutable as $$
declare m_end date := (p_period + interval '1 month')::date - 1;
        s date := greatest(p_start, p_period);
        e date := least(coalesce(p_end, m_end), m_end);
        dim int := m_end - p_period + 1;
begin
  if e < s then return 0; end if;
  if e - s + 1 >= dim then return p_rent; end if;
  return round(p_rent * (e - s + 1) / dim);
end $$;

create function period_due_date(p_period date) returns date language sql stable as
$$ select p_period + ((select due_day from settings where id = 1) - 1) $$;

create function create_invoice_for_stay(p_stay uuid, p_period date, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s stays; inv uuid; rent numeric; c record; d1 date; d2 date; m_end date;
begin
  select * into s from stays where id = p_stay;
  m_end := (p_period + interval '1 month')::date - 1;
  rent := calc_rent_for_period(s.monthly_rent, s.start_date, s.end_date, p_period);
  insert into invoices (tenant_id, stay_id, period, due_date)
  values (s.tenant_id, s.id, p_period, greatest(coalesce(p_due, period_due_date(p_period)), s.start_date))
  on conflict (tenant_id, period) do nothing
  returning id into inv;
  if inv is null then return null; end if;
  d1 := greatest(s.start_date, p_period);
  d2 := least(coalesce(s.end_date, m_end), m_end);
  insert into invoice_items (invoice_id, kind, description, amount)
  values (inv, 'rent',
          case when d1 = p_period and d2 = m_end then 'Room rent'
               else 'Room rent (' || to_char(d1, 'DD-MM-YYYY') || ' to ' || to_char(d2, 'DD-MM-YYYY') || ')' end,
          rent);
  for c in select * from tenant_recurring_charges where tenant_id = s.tenant_id and active loop
    insert into invoice_items (invoice_id, kind, description, amount) values (inv, c.kind, c.label, c.amount);
  end loop;
  return inv;
end $$;

-- Idempotent: safe to run any number of times for a month.
create function generate_monthly_invoices(p_period date) returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_period)::date; m_end date; s record; n int := 0;
begin
  perform assert_role('super_admin', 'manager', 'accountant');
  m_end := (m + interval '1 month')::date - 1;
  for s in select id from stays
           where start_date <= m_end and (end_date is null or end_date >= m)
             and not exists (select 1 from invoices i where i.tenant_id = stays.tenant_id and i.period = m)
           order by start_date
  loop
    if create_invoice_for_stay(s.id, m) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ------------------------------------------------ RPC: check-in/transfer/out
create function check_in(p_tenant jsonb, p_bed uuid, p_start date, p_rent numeric,
                         p_deposit numeric default 0, p_prorate boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid; sid uuid; r rooms; eff numeric; per date; inv uuid;
begin
  perform assert_role('super_admin', 'manager');
  select r2.* into r from rooms r2 join beds b on b.id = p_bed and b.room_id = r2.id;
  if r.id is null then raise exception 'Bed not found.'; end if;
  select coalesce(r.rent_per_bed, monthly_rent) into eff from pricing where sharing = r.sharing;
  if p_rent is null or p_rent < 0 then raise exception 'Monthly rent is required.'; end if;

  insert into tenants (full_name, phone, email, emergency_name, emergency_phone, address, id_proof_type, id_proof_number)
  values (trim(p_tenant ->> 'full_name'), p_tenant ->> 'phone', nullif(p_tenant ->> 'email', ''),
          coalesce(p_tenant ->> 'emergency_name', ''), coalesce(p_tenant ->> 'emergency_phone', ''),
          coalesce(p_tenant ->> 'address', ''), nullif(p_tenant ->> 'id_proof_type', '')::id_proof_type,
          coalesce(p_tenant ->> 'id_proof_number', ''))
  returning id into tid;

  begin
    insert into stays (tenant_id, bed_id, start_date, monthly_rent, is_custom_rent, planned_checkout)
    values (tid, p_bed, p_start, p_rent, p_rent <> eff, nullif(p_tenant ->> 'planned_checkout', '')::date)
    returning id into sid;
  exception when unique_violation then
    raise exception 'That bed is already occupied.';
  end;

  if coalesce(p_deposit, 0) > 0 then
    insert into deposit_transactions (tenant_id, stay_id, kind, amount, txn_date, note)
    values (tid, sid, 'collected', p_deposit, p_start, 'Security deposit at check-in');
  end if;

  per := date_trunc('month', p_start)::date;
  inv := create_invoice_for_stay(sid, per, p_start);   -- initial payment record
  if not p_prorate and inv is not null then
    update invoice_items set amount = p_rent, description = 'Room rent'
    where invoice_id = inv and kind = 'rent';
  end if;
  return tid;
end $$;

create function transfer_tenant(p_tenant uuid, p_new_bed uuid, p_date date, p_new_rent numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare old stays; r rooms; eff numeric; sid uuid;
begin
  perform assert_role('super_admin', 'manager');
  select * into old from stays where tenant_id = p_tenant and end_date is null;
  if old.id is null then raise exception 'Tenant has no active stay.'; end if;
  if p_date <= old.start_date then raise exception 'Transfer date must be after the current stay start (%).', to_char(old.start_date, 'DD-MM-YYYY'); end if;
  if old.bed_id = p_new_bed then raise exception 'Tenant is already in this bed.'; end if;
  select r2.* into r from rooms r2 join beds b on b.id = p_new_bed and b.room_id = r2.id;
  select coalesce(r.rent_per_bed, monthly_rent) into eff from pricing where sharing = r.sharing;
  update stays set end_date = p_date - 1 where id = old.id;
  begin
    insert into stays (tenant_id, bed_id, start_date, monthly_rent, is_custom_rent, planned_checkout)
    values (p_tenant, p_new_bed, p_date, p_new_rent, p_new_rent <> eff, old.planned_checkout)
    returning id into sid;
  exception when unique_violation then
    raise exception 'The destination bed is already occupied.';
  end;
  return sid;
end $$;

create function update_stay_terms(p_stay uuid, p_rent numeric, p_planned_checkout date)
returns void language plpgsql security definer set search_path = public as $$
declare s stays; eff numeric;
begin
  perform assert_role('super_admin', 'manager');
  select * into s from stays where id = p_stay;
  select coalesce(r.rent_per_bed, p.monthly_rent) into eff
    from beds b join rooms r on r.id = b.room_id join pricing p on p.sharing = r.sharing where b.id = s.bed_id;
  update stays set monthly_rent = p_rent, is_custom_rent = (p_rent <> eff), planned_checkout = p_planned_checkout
  where id = p_stay;
end $$;

create function checkout_preview(p_tenant uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'pending_dues', coalesce((select sum(balance) from v_invoice_summary where tenant_id = p_tenant and balance > 0), 0),
    'deposit_held', coalesce((select held from v_deposit_balance where tenant_id = p_tenant), 0));
$$;

-- p_deductions: [{"reason": "Damage", "amount": 500}, ...]
create function check_out(p_tenant uuid, p_date date, p_deductions jsonb default '[]',
                          p_settle_dues_from_deposit boolean default true,
                          p_prorate_final boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s stays; v_held numeric; d jsonb; amt numeric; inv record; pay numeric;
        settled numeric := 0; deducted numeric := 0; refund numeric; diff numeric; item record;
        v_paid numeric; v_total numeric; adj numeric; credit numeric := 0;
begin
  perform assert_role('super_admin', 'manager');
  select * into s from stays where tenant_id = p_tenant and end_date is null;
  if s.id is null then raise exception 'Tenant is not currently checked in.'; end if;
  if p_date < s.start_date then raise exception 'Check-out cannot be before check-in (%).', to_char(s.start_date, 'DD-MM-YYYY'); end if;

  update stays set end_date = p_date, planned_checkout = null where id = s.id;   -- bed is free from here

  if p_prorate_final then
    for item in select ii.amount, i.period, i.id as inv_id from invoice_items ii join invoices i on i.id = ii.invoice_id
                where i.tenant_id = p_tenant and i.period = date_trunc('month', p_date)::date and ii.kind = 'rent' loop
      diff := item.amount - calc_rent_for_period(s.monthly_rent, s.start_date, p_date, item.period);
      if diff > 0 then
        -- Only reduce what is still unpaid; rent already paid beyond the pro-rata share is reported as a credit.
        select coalesce(sum(amount), 0) into v_total from invoice_items where invoice_id = item.inv_id;
        select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = item.inv_id and voided_at is null;
        adj := least(diff, greatest(v_total - v_paid, 0));
        credit := credit + (diff - adj);
        if adj > 0 then
          insert into invoice_items (invoice_id, kind, description, amount)
          values (item.inv_id, 'adjustment', 'Pro-rata adjustment for check-out on ' || to_char(p_date, 'DD-MM-YYYY'), -adj);
        end if;
      end if;
    end loop;
  end if;

  select coalesce(d2.held, 0) into v_held from v_deposit_balance d2 where d2.tenant_id = p_tenant;
  v_held := coalesce(v_held, 0);

  for d in select * from jsonb_array_elements(coalesce(p_deductions, '[]')) loop
    amt := (d ->> 'amount')::numeric;
    continue when coalesce(amt, 0) <= 0;
    if amt > v_held - deducted then raise exception 'Deductions exceed the deposit held (Rs. %).', v_held; end if;
    insert into deposit_transactions (tenant_id, stay_id, kind, amount, txn_date, note)
    values (p_tenant, s.id, 'deduction', amt, p_date, coalesce(d ->> 'reason', 'Deduction'));
    deducted := deducted + amt;
  end loop;

  if p_settle_dues_from_deposit then
    for inv in select id, balance, invoice_no from v_invoice_summary
               where tenant_id = p_tenant and balance > 0 order by period loop
      pay := least(inv.balance, v_held - deducted - settled);
      exit when pay <= 0;
      insert into payments (invoice_id, tenant_id, amount, method, reference, paid_on, note)
      values (inv.id, p_tenant, pay, 'deposit_adjustment', 'Deposit adjusted', p_date, 'Settled from security deposit at check-out');
      insert into deposit_transactions (tenant_id, stay_id, kind, amount, txn_date, note)
      values (p_tenant, s.id, 'adjusted_against_dues', pay, p_date, 'Applied to ' || inv.invoice_no);
      settled := settled + pay;
    end loop;
  end if;

  refund := v_held - deducted - settled;
  if refund > 0 then
    insert into deposit_transactions (tenant_id, stay_id, kind, amount, txn_date, note)
    values (p_tenant, s.id, 'refund', refund, p_date, 'Deposit refund at check-out');
  end if;

  return jsonb_build_object('deposit_held', v_held, 'deductions', deducted, 'settled_against_dues', settled,
                            'refund', greatest(refund, 0), 'rent_credit_to_refund', credit,
                            'pending_dues_after', coalesce((select sum(balance) from v_invoice_summary where tenant_id = p_tenant and balance > 0), 0));
end $$;

create function void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_role('super_admin', 'accountant');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to void a payment.'; end if;
  update payments set voided_at = now(), voided_by = auth.uid(), void_reason = p_reason
  where id = p_payment and voided_at is null;
  if not found then raise exception 'Payment not found or already void.'; end if;
end $$;

-- Price change only affects future invoices of tenants WITHOUT custom rent.
create function apply_pricing_to_active_stays(p_sharing sharing_type) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform assert_role('super_admin');
  update stays s set monthly_rent = coalesce(r.rent_per_bed, p.monthly_rent)
  from beds b, rooms r, pricing p
  where b.id = s.bed_id and r.id = b.room_id and p.sharing = r.sharing
    and r.sharing = p_sharing and s.end_date is null and not s.is_custom_rent;
  get diagnostics n = row_count;
  return n;
end $$;

-- ----------------------------------------------------- RPC: dashboard
create function dashboard_stats(p_month date default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare m date := date_trunc('month', coalesce(p_month, today_ist()))::date; res jsonb;
begin
  select jsonb_build_object(
    'month', m,
    'total_rooms',    (select count(*) from rooms),
    'total_beds',     (select count(*) from beds where active),
    'occupied_beds',  (select count(*) from stays where end_date is null),
    'available_beds', (select count(*) from beds b join rooms r on r.id = b.room_id
                       where b.active and r.status = 'available'
                         and not exists (select 1 from stays s where s.bed_id = b.id and s.end_date is null)),
    'total_tenants',  (select count(*) from tenants where status = 'active'),
    'expected',       (select coalesce(sum(total), 0) from v_invoice_summary where period = m),
    'collected',      (select coalesce(sum(paid), 0) from v_invoice_summary where period = m),
    'pending_amount', (select coalesce(sum(balance), 0) from v_invoice_summary where status in ('pending', 'partial')),
    'pending_count',  (select count(*) from v_invoice_summary where status in ('pending', 'partial')),
    'overdue_amount', (select coalesce(sum(balance), 0) from v_invoice_summary where status = 'overdue'),
    'overdue_count',  (select count(*) from v_invoice_summary where status = 'overdue'),
    'deposits_held',  (select coalesce(sum(held), 0) from v_deposit_balance),
    'monthly', (select coalesce(jsonb_agg(row_to_json(x) order by x.month), '[]') from (
        select g::date as month,
               (select coalesce(sum(total), 0) from v_invoice_summary where period = g::date) as billed,
               (select coalesce(sum(amount), 0) from payments where voided_at is null
                  and date_trunc('month', paid_on) = g) as received,
               (select coalesce(sum(amount), 0) from expenses where date_trunc('month', expense_date) = g) as expenses
        from generate_series(m - interval '11 months', m, interval '1 month') g) x),
    'occupancy', (select coalesce(jsonb_agg(row_to_json(y)), '[]') from (
        select r.sharing, count(b.id) as beds,
               count(s.id) as occupied
        from rooms r join beds b on b.room_id = r.id and b.active
        left join stays s on s.bed_id = b.id and s.end_date is null
        group by r.sharing order by r.sharing) y)
  ) into res;
  return res;
end $$;

-- -------------------------------------------------- RPC: notifications
create function refresh_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare st settings; n int := 0; c int; inv record; s record;
begin
  perform assert_role('super_admin', 'manager', 'accountant');
  select * into st from settings where id = 1;
  for inv in select * from v_invoice_summary where balance > 0 loop
    if inv.status = 'overdue' then
      insert into notifications (kind, title, body, tenant_id, invoice_id, dedupe_key)
      values ('overdue', inv.tenant_name || ' — payment overdue',
              'Rs. ' || inv.balance || ' pending on ' || inv.invoice_no || ' (due ' || to_char(inv.due_date, 'DD-MM-YYYY') || ')',
              inv.tenant_id, inv.id, 'overdue:' || inv.id || ':' || to_char(date_trunc('week', today_ist()), 'YYYY-MM-DD'))
      on conflict do nothing;
    elsif inv.due_date - today_ist() <= st.reminder_days_before then
      insert into notifications (kind, title, body, tenant_id, invoice_id, dedupe_key)
      values ('due_reminder', inv.tenant_name || ' — rent due ' || to_char(inv.due_date, 'DD-MM-YYYY'),
              'Rs. ' || inv.balance || ' due on ' || inv.invoice_no,
              inv.tenant_id, inv.id, 'due:' || inv.id)
      on conflict do nothing;
    end if;
    get diagnostics c = row_count; n := n + c;
  end loop;
  for s in select st2.*, t.full_name from stays st2 join tenants t on t.id = st2.tenant_id
           where st2.end_date is null and st2.planned_checkout is not null
             and st2.planned_checkout - today_ist() between 0 and st.checkout_notice_days loop
    insert into notifications (kind, title, body, tenant_id, dedupe_key)
    values ('checkout_reminder', s.full_name || ' checks out on ' || to_char(s.planned_checkout, 'DD-MM-YYYY'),
            'Prepare final bill and deposit settlement.', s.tenant_id, 'co:' || s.id || ':' || s.planned_checkout)
    on conflict do nothing;
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ RLS
do $$
declare t text;
begin
  foreach t in array array['profiles', 'settings', 'pricing', 'rooms', 'beds', 'tenants', 'stays', 'tenant_documents',
                           'tenant_recurring_charges', 'deposit_transactions', 'invoices', 'invoice_items', 'payments',
                           'expenses', 'notifications', 'audit_log']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- everyone active can read the operational data
do $$
declare t text;
begin
  foreach t in array array['profiles', 'settings', 'pricing', 'rooms', 'beds', 'tenants', 'stays', 'tenant_documents',
                           'tenant_recurring_charges', 'deposit_transactions', 'invoices', 'invoice_items', 'payments', 'notifications']
  loop execute format('create policy "read %1$s" on %1$I for select to authenticated using (current_app_role() is not null)', t); end loop;
end $$;

create policy "super admin edits profiles" on profiles for update to authenticated
  using (has_role('super_admin')) with check (has_role('super_admin'));
create policy "super admin edits settings" on settings for update to authenticated
  using (has_role('super_admin')) with check (has_role('super_admin'));
create policy "super admin edits pricing" on pricing for update to authenticated
  using (has_role('super_admin')) with check (has_role('super_admin'));

create policy "staff manage rooms" on rooms for all to authenticated
  using (has_role('super_admin', 'manager')) with check (has_role('super_admin', 'manager'));
create policy "staff manage beds" on beds for select to authenticated using (current_app_role() is not null);
create policy "staff edit tenants" on tenants for update to authenticated
  using (has_role('super_admin', 'manager')) with check (has_role('super_admin', 'manager'));
create policy "staff manage documents" on tenant_documents for all to authenticated
  using (has_role('super_admin', 'manager')) with check (has_role('super_admin', 'manager'));
create policy "finance manages recurring charges" on tenant_recurring_charges for all to authenticated
  using (has_role('super_admin', 'manager', 'accountant')) with check (has_role('super_admin', 'manager', 'accountant'));
create policy "finance adds deposit entries" on deposit_transactions for insert to authenticated
  with check (has_role('super_admin', 'manager', 'accountant'));

create policy "finance writes invoices" on invoices for all to authenticated
  using (has_role('super_admin', 'accountant')) with check (has_role('super_admin', 'accountant'));
create policy "finance writes invoice items" on invoice_items for all to authenticated
  using (has_role('super_admin', 'accountant')) with check (has_role('super_admin', 'accountant'));
create policy "record payments" on payments for insert to authenticated
  with check (has_role('super_admin', 'accountant', 'manager'));

create policy "finance reads expenses" on expenses for select to authenticated using (has_role('super_admin', 'accountant'));
create policy "finance writes expenses" on expenses for all to authenticated
  using (has_role('super_admin', 'accountant')) with check (has_role('super_admin', 'accountant'));

create policy "mark notifications read" on notifications for update to authenticated
  using (current_app_role() is not null) with check (current_app_role() is not null);
create policy "finance reads audit" on audit_log for select to authenticated using (has_role('super_admin', 'accountant'));

-- Grants: nothing for anon; no direct writes to ledgers beyond the policies above.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke update, delete on audit_log from authenticated;
revoke delete on payments, deposit_transactions, tenants, stays from authenticated;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('tenant-documents', 'tenant-documents', false, 10485760),
       ('expense-receipts', 'expense-receipts', false, 10485760)
on conflict (id) do nothing;

create policy "staff read tenant docs" on storage.objects for select to authenticated
  using (bucket_id = 'tenant-documents' and current_app_role() is not null);
create policy "staff write tenant docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-documents' and has_role('super_admin', 'manager'));
create policy "staff delete tenant docs" on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-documents' and has_role('super_admin', 'manager'));
create policy "finance read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and has_role('super_admin', 'accountant'));
create policy "finance write receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and has_role('super_admin', 'accountant'));
create policy "finance delete receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and has_role('super_admin', 'accountant'));
