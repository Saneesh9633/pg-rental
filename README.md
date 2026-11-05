# PG Manager — PG rental management

Rooms & beds, tenants, monthly billing, payments, deposits, expenses, reports and role-based access for a
Paying-Guest (PG) business. **Next.js 14 (App Router) + Supabase (Postgres, Auth, Storage) + Tailwind + Recharts.**

> Extends the original "PG Home Stay Dashboard" prototype (tenants + payments only). That prototype's code is in git history.

## What's inside

| Area | Highlights |
|---|---|
| Dashboard | 10 summary cards, 4 charts (monthly collection, pending vs collected, occupancy by sharing, revenue trend), overdue list, upcoming check-outs |
| Rooms & Beds | CRUD, sharing type, beds, per-room rate override, maintenance, live occupants & vacancies |
| Rental Pricing | Single / Double / Triple price per person; price-change history; "apply to current tenants" |
| Tenants | Check-in (photo, ID, emergency contact, deposit, custom rent), edit, transfer, check-out with deposit settlement, documents, rental & payment history, past tenants kept forever |
| Billing | Automatic monthly invoices, extras (electricity/food/laundry/maintenance), discounts, adjustments, due dates, PDF/print |
| Payments | Per-tenant status table with Month/Year/Room/Sharing/Tenant/Status filters, search, sorting; partial payments; Cash/UPI/Bank/Card + reference; PDF receipts; void with reason |
| Expenses | 8 categories, receipts upload, month/category filters, totals |
| Reports | 9 reports + audit trail, each exportable to **PDF and Excel** |
| Users & Roles | Super Admin / Manager / Accountant, enforced in the database (RLS), not just the UI |
| Notifications | Due, overdue, payment confirmation, check-out reminders; WhatsApp click-to-send links |

## Quick start (local)

Prereqs: Node 20+, Docker, [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i` installs it as a dev dependency).

```bash
npm install
npx supabase start                 # local Postgres + Auth + Storage
npx supabase db reset              # applies supabase/migrations + supabase/seed.sql (demo data)
cp .env.example .env.local         # paste the URL / anon key / service_role key printed by `supabase start`
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<service_role key> npm run db:users
npm run dev                        # http://localhost:3000
```

Demo logins (password `Demo@12345` — **demo only, delete before going live**):

| Role | Email |
|---|---|
| Super Admin | `admin@sunrise-pg.example` |
| Manager | `manager@sunrise-pg.example` |
| Accountant | `accounts@sunrise-pg.example` |

The seed creates "Sunrise Residency PG": 11 rooms, 17 tenants (incl. one transfer, two check-outs, custom rents,
a planned check-out), 6 months of invoices/payments/expenses. Dates are relative to today.

## Deploy (hosted Supabase + Vercel)

1. Create a Supabase project; `npx supabase link` then `npx supabase db push` (add `seed.sql` content only if you want demo data).
2. In Auth settings, **disable public sign-ups** (users are created by the Super Admin in-app).
3. Create the first user in Supabase Auth → Users. **The first user becomes the Super Admin automatically.** Everyone else is created in the app under *Users & Roles*.
4. Set env vars on Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET`.
5. `vercel.json` schedules `/api/cron/invoices` daily. It creates the current month's invoices (idempotent) and refreshes reminders. Any scheduler can call it:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/invoices`
   Optional `NOTIFY_WEBHOOK_URL` receives new due/overdue/check-out reminders as JSON (hook up a WhatsApp/SMS gateway).

## How the business rules are enforced

All rules live in the database (`supabase/migrations/…_schema.sql`), so no screen can bypass them.

| Rule | Mechanism |
|---|---|
| Independent pricing per sharing type | `pricing` table, one row per type |
| Rent per occupied bed | Rent is stored on the **stay** (tenant ↔ bed), not the room |
| Individual payment account per tenant | One invoice per tenant per month; payments reference the invoice and tenant |
| Custom rent per tenant | `stays.monthly_rent` (+ `is_custom_rent`) |
| No over-allocation | Beds are rows; partial unique index allows one open stay per bed. Maintenance rooms refuse tenants |
| Beds free after check-out | Check-out closes the stay; availability is derived from open stays |
| Price changes never rewrite history | Invoices copy the rent into `invoice_items`; pricing edits touch no invoice. "Apply to tenants" only affects future invoices of non-custom tenants |
| Partial payments | Balance = invoice total − non-void payments; status paid / partial / pending / overdue. Over-payment is rejected |
| Deposits separate from income | Own ledger (`deposit_transactions`); never in payments/income reports. Applying a deposit to dues is an explicit, recorded entry |
| Audit history | Trigger-fed append-only `audit_log` on all financial tables, settings, users. Payments can't be edited or deleted — only voided with a reason |

Dates display as DD-MM-YYYY, amounts as ₹ with Indian grouping, and "today" is computed in IST.

## Roles

| | Super Admin | Manager | Accountant |
|---|:-:|:-:|:-:|
| Pricing, settings, users | ✅ | – | – |
| Rooms, tenants, check-in/out | ✅ | ✅ | view |
| Record payments | ✅ | ✅ | ✅ |
| Invoices (edit charges), void payments | ✅ | view | ✅ |
| Expenses, P&L, audit trail | ✅ | – | ✅ |
| Operational reports | ✅ | ✅ | ✅ |

## Tests

```bash
SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm test
```
10 integration tests run against the real API with real logins per role: capacity rule, maintenance rule, custom rent,
deposit ledger, check-out, price-change immutability, idempotent billing, partial/over-payments, void, audit
immutability, transfer, and role security.

## Notes & limitations

- PDFs use "Rs." (the built-in PDF fonts have no ₹ glyph); on screen and in Excel it's ₹.
- WhatsApp is click-to-send (`wa.me` links) plus the optional webhook; there is no built-in WhatsApp/SMS provider.
- "Fully occupied" is derived from bed occupancy rather than stored, so it can never drift. Rooms can be set to *Available* or *Maintenance*.
- Electricity is added per invoice (it varies); fixed monthly extras (food, laundry…) are set per tenant and added automatically.
