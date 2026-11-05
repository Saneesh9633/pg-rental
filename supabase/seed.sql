-- =====================================================================
-- Demo data for "Sunrise Residency PG". Dates are relative to today, so the
-- dashboard always looks current. Safe to run once on an empty database
-- (`supabase db reset` does this automatically).
-- Every record is created through the same functions the app uses, so the
-- demo exercises the real business rules (check-in, transfer, check-out...).
-- =====================================================================

update settings set pg_name = 'Sunrise Residency PG', address = '14, 5th Cross, Koramangala, Bengaluru - 560034',
       phone = '9845012345', email = 'hello@sunrise-pg.example', due_day = 5, upi_id = 'sunrisepg@upi';

-- Pricing is already seeded in the migration (8000 / 5000 / 4000). Rooms: -----
insert into rooms (room_no, sharing, total_beds, rent_per_bed, status, notes) values
  ('101', 'single', 1, null, 'available', 'Ground floor, attached bath'),
  ('102', 'single', 1, null, 'available', 'Ground floor'),
  ('103', 'single', 1, null, 'available', 'Ground floor, window facing garden'),
  ('104', 'single', 1, null, 'available', 'Ground floor'),
  ('201', 'double', 2, null, 'available', 'First floor'),
  ('202', 'double', 2, null, 'available', 'First floor'),
  ('203', 'double', 2, null, 'available', 'First floor, balcony'),
  ('204', 'double', 2, 5500, 'available', 'First floor, AC (premium)'),
  ('301', 'triple', 3, null, 'available', 'Second floor'),
  ('302', 'triple', 3, null, 'available', 'Second floor'),
  ('303', 'triple', 3, null, 'maintenance', 'Plumbing repair in progress');

do $$
declare
  m date := date_trunc('month', today_ist())::date;
  today date := today_ist();
  r record; bed uuid; tid uuid; sid uuid; inv record; k int;
  proofs id_proof_type[] := array['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport'];
  methods payment_method[] := array['upi', 'cash', 'bank_transfer', 'upi', 'card'];
  i int := 0; h int; paid_amt numeric; kind text; due date;
begin
  -- name, phone, room, bed, months ago, start day, rent, deposit, monthly food, extra json
  for r in select * from (values
    ('Rahul Sharma',  '9876500001', '101', 1, 7,  1, 8000, 16000, 1500),
    ('Priya Nair',    '9876500002', '102', 1, 5, 10, 7500, 15000, 1500),   -- custom (negotiated) rent
    ('Arjun Mehta',   '9876500003', '103', 1, 3,  1, 8000, 16000, 0),
    ('Sneha Reddy',   '9876500004', '201', 1, 6,  1, 5000, 10000, 1500),
    ('Vikram Singh',  '9876500005', '201', 2, 6, 15, 5000, 10000, 1500),
    ('Anjali Iyer',   '9876500006', '202', 1, 4,  1, 5000, 10000, 1500),
    ('Rohit Verma',   '9876500007', '202', 2, 2,  1, 5000, 10000, 0),
    ('Karan Patel',   '9876500008', '203', 1, 3, 20, 5000, 10000, 1500),
    ('Divya Rao',     '9876500015', '203', 2, 3,  1, 5000, 10000, 1500),   -- has a planned check-out
    ('Meera Joshi',   '9876500009', '204', 1, 2,  1, 5500, 11000, 1500),
    ('Deepak Kumar',  '9876500010', '301', 1, 5,  1, 4000,  8000, 1500),
    ('Imran Khan',    '9876500011', '301', 2, 5,  1, 4000,  8000, 1500),
    ('Naveen Gupta',  '9876500018', '301', 3, 5,  1, 4000,  8000, 1500),   -- transferred later
    ('Lakshmi Menon', '9876500013', '302', 1, 4,  1, 4000,  8000, 1500),
    ('Farhan Ali',    '9876500014', '302', 2, 4,  1, 3600,  8000, 0),   -- custom rent (long-stay concession)
    ('Karthik Raj',   '9876500016', '104', 1, 6,  1, 8000, 16000, 1500),   -- checks out this month
    ('Anita George',  '9876500017', '302', 3, 5,  1, 4000,  8000, 1500)    -- checked out last month
  ) as v(name, phone, room, bedno, ago, sday, rent, dep, food)
  loop
    i := i + 1;
    select b.id into bed from beds b join rooms rm on rm.id = b.room_id where rm.room_no = r.room and b.bed_no = r.bedno;
    tid := check_in(jsonb_build_object(
        'full_name', r.name, 'phone', r.phone,
        'email', lower(split_part(r.name, ' ', 1)) || '@example.com',
        'emergency_name', 'Family of ' || split_part(r.name, ' ', 1), 'emergency_phone', '98450' || lpad((10000 + i)::text, 5, '0'),
        'address', (10 + i) || ', Gandhi Road, ' || (array['Mysuru', 'Chennai', 'Hyderabad', 'Kochi', 'Pune', 'Jaipur'])[1 + i % 6],
        'id_proof_type', proofs[1 + i % 5], 'id_proof_number', 'XXXX-' || lpad((4000 + i * 37)::text, 4, '0')),
      bed, (m - make_interval(months => r.ago))::date + (r.sday - 1), r.rent, r.dep, true);
    if r.food > 0 then
      insert into tenant_recurring_charges (tenant_id, kind, label, amount) values (tid, 'food', 'Food (meals)', r.food);
    end if;
  end loop;

  update stays set planned_checkout = today + 6 where tenant_id = (select id from tenants where full_name = 'Divya Rao');

  -- Billing history, oldest first -----------------------------------------
  for k in reverse 5 .. 2 loop perform generate_monthly_invoices((m - make_interval(months => k))::date); end loop;

  -- Naveen moves from a triple (301) to the premium double (204) two months ago.
  perform transfer_tenant((select id from tenants where full_name = 'Naveen Gupta'),
          (select b.id from beds b join rooms rm on rm.id = b.room_id where rm.room_no = '204' and b.bed_no = 2),
          (m - interval '2 months')::date, 5500);

  perform generate_monthly_invoices((m - interval '1 month')::date);
  perform generate_monthly_invoices(m);

  -- Food on the check-in invoices (they were created before the recurring charge existed)
  insert into invoice_items (invoice_id, kind, description, amount)
  select i2.id, 'food', c.label, c.amount
  from invoices i2 join tenant_recurring_charges c on c.tenant_id = i2.tenant_id
  where not exists (select 1 from invoice_items x where x.invoice_id = i2.id and x.kind = 'food');

  -- Electricity share (varies every month) + the odd discount
  insert into invoice_items (invoice_id, kind, description, amount)
  select id, 'electricity', 'Electricity share', 150 + (abs(hashtext(id::text)) % 26) * 10 from invoices;
  insert into invoice_items (invoice_id, kind, description, amount)
  select id, 'discount', 'Early payment discount', -200 from invoices where abs(hashtext(id::text || 'd')) % 17 = 0;
  insert into invoice_items (invoice_id, kind, description, amount)
  select id, 'laundry', 'Laundry', 300 from invoices where abs(hashtext(id::text || 'l')) % 11 = 0;

  -- Payments: older months mostly settled, a few partials/overdue; this month mixed.
  for inv in select * from v_invoice_summary order by period, invoice_no loop
    continue when inv.tenant_name = 'Karthik Raj' and inv.period >= (m - interval '1 month')::date;  -- dues settled from deposit at check-out
    h := abs(hashtext(inv.invoice_no)) % 100;
    due := inv.due_date;
    if inv.period < m then
      if h < 86 then paid_amt := inv.total; elsif h < 94 then paid_amt := round(inv.total * 0.6); else paid_amt := 0; end if;
    else
      if h < 40 then paid_amt := inv.total; elsif h < 55 then paid_amt := round(inv.total * 0.5); else paid_amt := 0; end if;
    end if;
    continue when paid_amt <= 0;
    insert into payments (invoice_id, tenant_id, amount, method, reference, paid_on, note)
    values (inv.id, inv.tenant_id, paid_amt, methods[1 + h % 5],
            case when methods[1 + h % 5] in ('upi', 'bank_transfer') then 'TXN' || lpad((abs(hashtext(inv.invoice_no || 'r')) % 1000000000)::text, 9, '0') else '' end,
            least(due + (h % 5), today), case when paid_amt < inv.total then 'Part payment' else '' end);
  end loop;

  -- Check-outs -----------------------------------------------------------------
  perform check_out((select id from tenants where full_name = 'Anita George'),
                    (m - interval '1 month')::date + 14, '[{"reason": "Wall repainting", "amount": 500}]', true, true);
  perform check_out((select id from tenants where full_name = 'Karthik Raj'),
                    least(m + 2, today), '[{"reason": "Cupboard key replacement", "amount": 300}]', true, true);

  -- Notifications for the demo
  perform refresh_notifications();
end $$;

-- Expenses: last 6 months ----------------------------------------------------
insert into expenses (category, amount, expense_date, description, vendor)
select c.cat, round(c.base * (0.92 + (abs(hashtext(c.cat::text || g::text)) % 17) / 100.0)),
       (g::date + (c.day - 1)), c.descr, c.vendor
from generate_series(date_trunc('month', today_ist()) - interval '5 months', date_trunc('month', today_ist()), interval '1 month') g
cross join (values
  ('electricity'::expense_category, 11500, 8,  'BESCOM monthly bill', 'BESCOM'),
  ('water'::expense_category,        2600, 10, 'Water tanker + BWSSB', 'BWSSB'),
  ('food_groceries'::expense_category, 41000, 2, 'Groceries, vegetables, gas cylinder', 'Fresh Mart'),
  ('internet'::expense_category,     1800, 6,  'Fibre broadband 200 Mbps', 'ACT Fibernet'),
  ('cleaning'::expense_category,     4200, 12, 'Housekeeping supplies', 'CleanCo'),
  ('maintenance'::expense_category,  3800, 18, 'Plumbing / electrical repairs', 'Local contractor'),
  ('staff_salary'::expense_category, 22000, 1, 'Cook salary', 'Staff'),
  ('staff_salary'::expense_category, 14000, 1, 'Housekeeping salary', 'Staff')
) as c(cat, base, day, descr, vendor)
where (g::date + (c.day - 1)) <= today_ist();

-- Historical payment confirmations are not "new" — start with a clean inbox (reminders stay unread).
update notifications set read_at = now() where kind = 'payment_received';
