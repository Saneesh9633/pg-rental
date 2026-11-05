// Integration tests for the business rules + role security.
// Needs a running Supabase (local `supabase start`) with migrations + seed + demo users applied.
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@12345";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function login(email) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  assert.ifError(error);
  return c;
}
let admin, manager, accountant, anon, svc;
const ok = (r, msg) => assert.ifError(r.error ? new Error(`${msg ?? "call"} failed: ${r.error.message}`) : null);
const denied = (r) => assert.ok(r.error || (Array.isArray(r.data) && r.data.length === 0), "expected the call to be denied / return nothing");

before(async () => {
  admin = await login("admin@sunrise-pg.example");
  manager = await login("manager@sunrise-pg.example");
  accountant = await login("accounts@sunrise-pg.example");
  anon = createClient(URL, ANON, opts);
  svc = createClient(URL, SERVICE, opts);
});

const bedId = async (room, no = 1) => {
  const { data } = await admin.from("v_bed_status").select("bed_id,tenant_id").eq("room_no", room).eq("bed_no", no).single();
  return data;
};
const person = (n) => ({ full_name: `Test Person ${n}`, phone: "9000000" + String(Math.floor(Math.random() * 900) + 100), id_proof_type: "aadhaar" });
const rentTotal = async () => (await admin.from("invoice_items").select("amount").eq("kind", "rent")).data.reduce((a, r) => a + Number(r.amount), 0);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

test("a bed that is occupied cannot be allocated again (capacity rule)", async () => {
  const bed = await bedId("101");
  assert.ok(bed.tenant_id, "seed has Rahul in 101");
  const r = await manager.rpc("check_in", { p_tenant: person(1), p_bed: bed.bed_id, p_start: today(), p_rent: 8000, p_deposit: 0 });
  assert.match(r.error?.message ?? "", /already occupied/i);
});

test("rooms under maintenance cannot take tenants", async () => {
  const bed = await bedId("303");
  const r = await manager.rpc("check_in", { p_tenant: person(2), p_bed: bed.bed_id, p_start: today(), p_rent: 4000, p_deposit: 0 });
  assert.match(r.error?.message ?? "", /maintenance/i);
});

test("custom rent, deposit ledger and initial invoice on check-in; checkout frees the bed", async () => {
  const bed = await bedId("104");
  assert.equal(bed.tenant_id, null, "104 is vacant after Karthik left");
  const start = today();
  const r = await manager.rpc("check_in", { p_tenant: person(3), p_bed: bed.bed_id, p_start: start, p_rent: 7000, p_deposit: 14000, p_prorate: true });
  ok(r, "check_in");
  const tid = r.data;

  const cur = (await admin.from("v_tenant_current").select("*").eq("id", tid).single()).data;
  assert.equal(Number(cur.monthly_rent), 7000);
  assert.equal(cur.is_custom_rent, true, "7000 differs from the 8000 list price");
  assert.equal(Number(cur.deposit_held), 14000);
  assert.equal(cur.status, "active");

  const invs = (await admin.from("v_invoice_summary").select("*").eq("tenant_id", tid)).data;
  assert.equal(invs.length, 1);
  assert.ok(Number(invs[0].rent) > 0 && Number(invs[0].rent) <= 7000);

  // deposit is NOT rental income: no payment rows were created for it
  const pays = (await admin.from("payments").select("id").eq("tenant_id", tid)).data;
  assert.equal(pays.length, 0);

  // checkout: preview, settle dues from deposit, refund the rest
  const pre = (await manager.rpc("checkout_preview", { p_tenant: tid })).data;
  assert.equal(Number(pre.deposit_held), 14000);
  const out = await manager.rpc("check_out", { p_tenant: tid, p_date: start, p_deductions: [{ reason: "Damage", amount: 500 }], p_settle_dues_from_deposit: true, p_prorate_final: false });
  ok(out, "check_out");
  assert.equal(Number(out.data.deductions), 500);
  assert.equal(Number(out.data.deposit_held), 14000);
  assert.equal(Number(out.data.settled_against_dues) + Number(out.data.deductions) + Number(out.data.refund), 14000);
  assert.equal(Number(out.data.pending_dues_after), 0);

  const after = (await admin.from("v_bed_status").select("tenant_id").eq("bed_id", bed.bed_id).single()).data;
  assert.equal(after.tenant_id, null, "bed is vacant again");
  const hist = (await admin.from("tenants").select("status").eq("id", tid).single()).data;
  assert.equal(hist.status, "checked_out", "tenant record is retained");
  assert.equal((await admin.from("stays").select("id").eq("tenant_id", tid)).data.length, 1, "stay history kept");
});

test("price changes never alter existing invoices; apply-to-stays skips custom rents", async () => {
  const before = await rentTotal();
  const price = (await admin.from("pricing").select("monthly_rent").eq("sharing", "triple").single()).data.monthly_rent;
  ok(await admin.from("pricing").update({ monthly_rent: 4500 }).eq("sharing", "triple"), "update pricing");
  const mid = await rentTotal();
  assert.equal(mid, before, "historical rent amounts untouched by a price change");

  const n = (await admin.rpc("apply_pricing_to_active_stays", { p_sharing: "triple" })).data;
  assert.ok(n >= 1);
  const stays = (await admin.from("v_tenant_current").select("monthly_rent,is_custom_rent,sharing").eq("sharing", "triple").eq("status", "active")).data;
  assert.ok(stays.filter((s) => !s.is_custom_rent).every((s) => Number(s.monthly_rent) === 4500));
  assert.ok(stays.some((s) => s.is_custom_rent && Number(s.monthly_rent) !== 4500), "custom rent (Suresh/other) preserved");
  const after = await rentTotal();
  assert.equal(after, before, "invoices still unchanged after applying new prices to stays");
  ok(await admin.from("pricing").update({ monthly_rent: price }).eq("sharing", "triple"));
});

test("monthly generation is idempotent and creates one invoice per active tenant", async () => {
  const next = new Date(); next.setUTCMonth(next.getUTCMonth() + 1, 1);
  const period = next.toISOString().slice(0, 10);
  const a = await manager.rpc("generate_monthly_invoices", { p_period: period }); ok(a);
  const b = await manager.rpc("generate_monthly_invoices", { p_period: period }); ok(b);
  assert.ok(a.data > 0);
  assert.equal(b.data, 0, "second run creates nothing");
  const active = (await admin.from("tenants").select("id").eq("status", "active")).data.length;
  const inv = (await admin.from("invoices").select("id").eq("period", period)).data.length;
  assert.equal(inv, active);
});

test("partial payments, overpayment guard, immutability and void", async () => {
  const inv = (await admin.from("v_invoice_summary").select("*").eq("status", "pending").order("total", { ascending: false }).limit(1).single()).data;
  const half = Math.floor(Number(inv.total) / 2);
  const p1 = await accountant.from("payments").insert({ invoice_id: inv.id, amount: half, method: "upi", reference: "TEST123" }).select().single();
  ok(p1, "partial payment");
  assert.match(p1.data.receipt_no, /^RCT-/);
  let s = (await admin.from("v_invoice_summary").select("*").eq("id", inv.id).single()).data;
  assert.ok(["partial", "overdue"].includes(s.status));
  assert.equal(Number(s.balance), Number(inv.total) - half);

  const over = await accountant.from("payments").insert({ invoice_id: inv.id, amount: Number(s.balance) + 1, method: "cash" });
  assert.match(over.error?.message ?? "", /exceeds the balance/i);

  const edit = await accountant.from("payments").update({ amount: 1 }).eq("id", p1.data.id).select();
  assert.ok(edit.error || edit.data.length === 0, "no UPDATE policy: amount cannot be edited");
  const del = await accountant.from("payments").delete().eq("id", p1.data.id).select();
  assert.ok(del.error || del.data.length === 0, "payments cannot be deleted");
  const direct = await svc.from("payments").update({ amount: 1 }).eq("id", p1.data.id).select();
  assert.ok(direct.error, "even the service role is blocked by the DB trigger");
  assert.equal(Number((await admin.from("payments").select("amount").eq("id", p1.data.id).single()).data.amount), half);

  ok(await manager.from("payments").insert({ invoice_id: inv.id, amount: Number(s.balance), method: "cash" }), "manager may record payments");
  s = (await admin.from("v_invoice_summary").select("*").eq("id", inv.id).single()).data;
  assert.equal(s.status, "paid");

  assert.ok((await manager.rpc("void_payment", { p_payment: p1.data.id, p_reason: "x" })).error, "manager cannot void");
  ok(await accountant.rpc("void_payment", { p_payment: p1.data.id, p_reason: "Bounced UPI" }), "accountant void");
  s = (await admin.from("v_invoice_summary").select("*").eq("id", inv.id).single()).data;
  assert.equal(Number(s.paid), Number(inv.total) - half, "voided amount no longer counted");
});

test("every financial change is audited, and the audit log is append-only", async () => {
  const log = await accountant.from("audit_log").select("*").eq("table_name", "payments").order("id", { ascending: false }).limit(5);
  ok(log);
  assert.ok(log.data.length >= 3);
  assert.ok(log.data.some((l) => l.action === "UPDATE" && l.new_data.voided_at));
  const upd = await svc.from("audit_log").update({ action: "X" }).eq("id", log.data[0].id);
  assert.ok(upd.error, "audit rows cannot be updated, even by the service role");
  assert.ok((await svc.from("audit_log").delete().eq("id", log.data[0].id)).error, "...or deleted");
  const still = (await admin.from("audit_log").select("action").eq("id", log.data[0].id).single()).data;
  assert.notEqual(still.action, "X");
  const pricingAudit = (await admin.from("audit_log").select("id").eq("table_name", "pricing")).data;
  assert.ok(pricingAudit.length >= 2, "price changes are logged");
});

test("transfer keeps rental history and frees the old bed", async () => {
  const dst = await bedId("104");
  const rahul = (await admin.from("v_tenant_current").select("id,room_no").eq("full_name", "Meera Joshi").single()).data;
  const r = await manager.rpc("transfer_tenant", { p_tenant: rahul.id, p_new_bed: dst.bed_id, p_date: today(), p_new_rent: 8000 });
  ok(r, "transfer");
  const stays = (await admin.from("stays").select("*").eq("tenant_id", rahul.id).order("start_date")).data;
  assert.ok(stays.length >= 2);
  assert.ok(stays.filter((s) => s.end_date === null).length === 1);
  const old = (await admin.from("v_bed_status").select("tenant_id").eq("room_no", "204").eq("bed_no", 1).single()).data;
  assert.equal(old.tenant_id, null);
});

test("role security: who can do what", async () => {
  // anonymous: nothing
  assert.ok((await anon.from("tenants").select("id")).data?.length === 0 || (await anon.from("tenants").select("id")).error);
  assert.ok((await anon.rpc("dashboard_stats")).error, "anon cannot call RPCs");

  // accountant: no check-in, no room edits, no pricing
  const bed = await bedId("104");
  assert.ok((await accountant.rpc("check_in", { p_tenant: person(9), p_bed: bed.bed_id, p_start: today(), p_rent: 1 })).error);
  assert.equal((await accountant.from("rooms").update({ notes: "hack" }).eq("room_no", "101").select()).data?.length ?? 0, 0);
  assert.equal((await accountant.from("pricing").update({ monthly_rent: 1 }).eq("sharing", "single").select()).data?.length ?? 0, 0);
  // accountant can add expenses & invoice items
  ok(await accountant.from("expenses").insert({ category: "internet", amount: 1, description: "rls test" }).select().single(), "expense insert");

  // manager: no expenses, no invoice edits, no user admin
  assert.equal((await manager.from("expenses").select("id")).data.length, 0, "manager cannot read expenses");
  assert.ok((await manager.from("expenses").insert({ category: "other", amount: 5 })).error);
  const inv = (await admin.from("invoices").select("id").limit(1).single()).data;
  assert.ok((await manager.from("invoice_items").insert({ invoice_id: inv.id, kind: "other", description: "x", amount: 5 })).error);
  assert.equal((await manager.from("profiles").update({ role: "super_admin" }).eq("email", "manager@sunrise-pg.example").select()).data?.length ?? 0, 0, "no self promotion");
  assert.equal((await manager.from("audit_log").select("id")).data.length, 0, "manager cannot read audit log");

  // manager CAN manage rooms
  ok(await manager.from("rooms").insert({ room_no: "T-" + Date.now() % 10000, sharing: "double", total_beds: 2 }).select().single(), "manager adds room");
});

test("dashboard_stats returns consistent numbers", async () => {
  const d = (await admin.rpc("dashboard_stats")).data;
  assert.equal(Number(d.total_beds), Number(d.occupied_beds) + Number(d.available_beds) + 0 * 1 + (await admin.from("v_bed_status").select("bed_id").eq("room_status", "maintenance")).data.length);
  assert.equal(d.monthly.length, 12);
  assert.ok(Number(d.expected) > 0);
  const sum = d.occupancy.reduce((a, o) => a + Number(o.occupied), 0);
  assert.equal(sum, Number(d.occupied_beds));
});
