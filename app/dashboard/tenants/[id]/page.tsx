"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ID_TYPES } from "@/components/CheckInModal";
import { AsyncButton, Avatar, Badge, DataTable, ErrorBox, Field, Icon, Modal, PageHeader, SharingBadge, Spinner, StatusBadge, Tabs, type Column } from "@/components/ui";
import { cap, fmtDate, inr, monthLabel, todayISO, waLink, methodLabel } from "@/lib/format";
import { safeName, sb, signedUrl, unwrap, uploadFile, useAction, useProfile, useQuery, useUi } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { BedRow, InvoiceRow, PaymentRow, RoomRow, TenantRow } from "@/types";

interface StayRow { id: string; start_date: string; end_date: string | null; monthly_rent: number; is_custom_rent: boolean; bed: { bed_no: number; room: { room_no: string; sharing: string } } }
interface DepositTxn { id: string; kind: string; amount: number; txn_date: string; note: string }
interface Doc { id: string; doc_type: string; file_name: string; file_path: string; created_at: string }
interface Charge { id: string; kind: string; label: string; amount: number; active: boolean }
const DOC_TYPES = ["Aadhaar", "PAN", "Passport", "Driving licence", "Rental agreement", "Photo", "Other"];
const DEP_LABEL: Record<string, string> = { collected: "Deposit collected", refund: "Refunded", deduction: "Deduction", adjusted_against_dues: "Adjusted against dues" };

export default function TenantPage() {
  const { id } = useParams<{ id: string }>();
  const me = useProfile();
  const run = useAction();
  const { confirm } = useUi();
  const [tab, setTab] = useState<"overview" | "history" | "billing" | "deposit" | "docs">("overview");
  const [modal, setModal] = useState<null | "edit" | "terms" | "transfer" | "checkout" | "charge">(null);

  const q = useQuery(async () => {
    const c = sb();
    const [t, st, inv, pay, dep, docs, ch, beds, rooms] = await Promise.all([
      c.from("v_tenant_current").select("*").eq("id", id).single(),
      c.from("stays").select("id,start_date,end_date,monthly_rent,is_custom_rent,bed:beds(bed_no,room:rooms(room_no,sharing))").eq("tenant_id", id).order("start_date", { ascending: false }),
      c.from("v_invoice_summary").select("*").eq("tenant_id", id).order("period", { ascending: false }),
      c.from("payments").select("*").eq("tenant_id", id).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
      c.from("deposit_transactions").select("*").eq("tenant_id", id).order("created_at"),
      c.from("tenant_documents").select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
      c.from("tenant_recurring_charges").select("*").eq("tenant_id", id).order("created_at"),
      c.from("v_bed_status").select("*").is("tenant_id", null).eq("room_status", "available").order("room_no").order("bed_no"),
      c.from("v_room_overview").select("room_id,rent_per_bed"),
    ]);
    return {
      t: unwrap(t) as unknown as TenantRow, stays: unwrap(st) as unknown as StayRow[], invoices: unwrap(inv) as unknown as InvoiceRow[],
      payments: unwrap(pay) as unknown as PaymentRow[], deposits: unwrap(dep) as unknown as DepositTxn[], docs: unwrap(docs) as unknown as Doc[],
      charges: unwrap(ch) as unknown as Charge[], beds: unwrap(beds) as unknown as BedRow[], rooms: unwrap(rooms) as unknown as Pick<RoomRow, "room_id" | "rent_per_bed">[],
    };
  }, [id]);

  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? "Tenant not found"} onRetry={q.reload} />;
  const { t, stays, invoices, payments, deposits, docs, charges, beds, rooms } = q.data;
  const active = t.status === "active";
  const dues = invoices.reduce((a, i) => a + Math.max(Number(i.balance), 0), 0);
  const canManage = can(me.role, "manageTenants") && active;
  const canCheckInOut = can(me.role, "checkInOut");
  const done = () => { setModal(null); q.reload(); };

  async function openDoc(path: string) {
    const url = await signedUrl("tenant-documents", path);
    if (url) window.open(url, "_blank"); else run(async () => { throw new Error("Could not open the file."); });
  }

  return (
    <>
      <Link href="/dashboard/tenants" className="text-sm text-gray-500 hover:text-gray-800 mb-3 inline-block">← All tenants</Link>
      <div className="card p-5 mb-5 flex flex-col md:flex-row md:items-center gap-4">
        <Avatar name={t.full_name} path={t.photo_path} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{t.full_name}</h1>
            {active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Checked out {fmtDate(t.end_date)}</Badge>}
            {t.planned_checkout && active && <Badge tone="amber">Leaving {fmtDate(t.planned_checkout)}</Badge>}</div>
          <p className="text-sm text-gray-500 mt-1">{t.phone}{t.email && ` · ${t.email}`}</p>
          <p className="text-sm text-gray-500">{t.room_no ? <>Room {t.room_no}, Bed {t.bed_no} · <SharingBadge sharing={t.sharing} /> · {inr(t.monthly_rent ?? 0)}/month{t.is_custom_rent && <span className="text-indigo-600"> (custom rent)</span>}</> : "No room"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-right md:min-w-[260px]">
          <div><p className="text-[11px] uppercase text-gray-400">Outstanding</p><p className={`text-lg font-semibold tabular-nums ${dues > 0 ? "text-rose-700" : "text-emerald-700"}`}>{inr(dues)}</p></div>
          <div><p className="text-[11px] uppercase text-gray-400">Deposit held</p><p className="text-lg font-semibold tabular-nums">{inr(t.deposit_held)}</p></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {canManage && <button className="btn-secondary" onClick={() => setModal("edit")}><Icon name="pencil" />Edit details</button>}
        {canManage && <button className="btn-secondary" onClick={() => setModal("terms")}><Icon name="tag" />Rent &amp; notice</button>}
        {active && canCheckInOut && <button className="btn-secondary" onClick={() => setModal("transfer")}><Icon name="swap" />Transfer room</button>}
        {active && canCheckInOut && <button className="btn-secondary !text-rose-700 !border-rose-200 hover:!bg-rose-50" onClick={() => setModal("checkout")}><Icon name="door" />Check out</button>}
        {dues > 0 && <a className="btn-secondary" target="_blank" rel="noreferrer" href={waLink(t.phone, `Hello ${t.full_name}, this is a gentle reminder that ₹${dues.toLocaleString("en-IN")} is pending for your PG rent. Please pay at the earliest. Thank you!`)}><Icon name="chat" />WhatsApp reminder</a>}
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "history", label: `Rental history (${stays.length})` }, { id: "billing", label: "Billing & payments" }, { id: "deposit", label: "Security deposit" }, { id: "docs", label: `Documents (${docs.length})` }]} />

      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-5"><h2 className="section-title">Personal details</h2>
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              {[["Phone", t.phone], ["Email", t.email || "—"], ["Permanent address", t.address || "—"], ["ID proof", t.id_proof_type ? `${cap(t.id_proof_type)} · ${t.id_proof_number || "—"}` : "—"],
                ["Emergency contact", t.emergency_name ? `${t.emergency_name} · ${t.emergency_phone}` : t.emergency_phone || "—"], ["Joined", fmtDate(stays.at(-1)?.start_date)]].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-gray-400">{k}</dt><dd className="col-span-2 text-gray-800">{v}</dd></div>))}
            </dl></div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3"><h2 className="section-title !mb-0">Monthly extras</h2>
              {can(me.role, "manageInvoices") || can(me.role, "manageTenants") ? <button className="btn-ghost" onClick={() => setModal("charge")}><Icon name="plus" />Add</button> : null}</div>
            <p className="text-xs text-gray-400 mb-3">Fixed charges added to every new monthly invoice (food, laundry…). Variable charges like electricity are added on each invoice.</p>
            {charges.length === 0 ? <p className="text-sm text-gray-400">None.</p> : (
              <ul className="divide-y divide-gray-100">{charges.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2 text-sm"><span className={c.active ? "" : "text-gray-400 line-through"}>{c.label}</span><Badge>{cap(c.kind)}</Badge><span className="ml-auto tabular-nums">{inr(c.amount)}</span>
                  <button className="btn-ghost" onClick={async () => { if (await run(async () => unwrap(await sb().from("tenant_recurring_charges").update({ active: !c.active }).eq("id", c.id)))) q.reload(); }}>{c.active ? "Pause" : "Resume"}</button>
                  <button className="btn-ghost hover:!text-rose-600" aria-label="Remove" onClick={async () => { if (await confirm({ title: `Remove “${c.label}”?`, danger: true, confirmLabel: "Remove" }) && await run(async () => unwrap(await sb().from("tenant_recurring_charges").delete().eq("id", c.id)))) q.reload(); }}><Icon name="trash" /></button></li>))}</ul>)}
          </div>
        </div>
      )}

      {tab === "history" && (
        <DataTable rows={stays} rowKey={(s) => s.id} pageSize={10}
          columns={[
            { key: "room", header: "Room / Bed", render: (s) => `${s.bed.room.room_no} / B${s.bed.bed_no}` },
            { key: "sh", header: "Sharing", render: (s) => <SharingBadge sharing={s.bed.room.sharing} /> },
            { key: "from", header: "From", render: (s) => fmtDate(s.start_date), sort: (s) => s.start_date },
            { key: "to", header: "To", render: (s) => (s.end_date ? fmtDate(s.end_date) : <Badge tone="green">Current</Badge>) },
            { key: "rent", header: "Monthly rent", align: "right", render: (s) => <>{inr(s.monthly_rent)}{s.is_custom_rent && <span className="text-indigo-500"> *</span>}</> },
          ] as Column<StayRow>[]} />
      )}

      {tab === "billing" && (
        <div className="space-y-5">
          <div><h2 className="section-title">Invoices</h2>
            <DataTable rows={invoices} rowKey={(i) => i.id} pageSize={8} onRowClick={(i) => (window.location.href = `/dashboard/billing/${i.id}`)}
              columns={[
                { key: "no", header: "Invoice", render: (i) => <span className="font-medium text-indigo-700">{i.invoice_no}</span> },
                { key: "per", header: "Month", sort: (i) => i.period, render: (i) => monthLabel(i.period) },
                { key: "due", header: "Due", render: (i) => fmtDate(i.due_date) },
                { key: "tot", header: "Total", align: "right", render: (i) => inr(i.total) },
                { key: "paid", header: "Paid", align: "right", render: (i) => inr(i.paid) },
                { key: "bal", header: "Balance", align: "right", render: (i) => inr(Math.max(Number(i.balance), 0)) },
                { key: "st", header: "Status", render: (i) => <StatusBadge status={i.status} /> },
              ] as Column<InvoiceRow>[]} /></div>
          <div><h2 className="section-title">Payment history</h2>
            <DataTable rows={payments} rowKey={(p) => p.id} pageSize={8}
              columns={[
                { key: "d", header: "Date", render: (p) => fmtDate(p.paid_on) }, { key: "r", header: "Receipt", render: (p) => p.receipt_no },
                { key: "m", header: "Method", render: (p) => methodLabel(p.method) }, { key: "ref", header: "Reference", hideOnMobile: true, render: (p) => p.reference || "—" },
                { key: "a", header: "Amount", align: "right", render: (p) => (p.voided_at ? <span className="line-through text-gray-400">{inr(p.amount)}</span> : inr(p.amount)) },
                { key: "s", header: "", render: (p) => (p.voided_at ? <Badge tone="red">Void</Badge> : null) },
              ] as Column<PaymentRow>[]} /></div>
        </div>
      )}

      {tab === "deposit" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm"><thead className="bg-gray-50/70 text-xs uppercase text-gray-500"><tr><th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Entry</th><th className="px-4 py-2.5 text-left hidden sm:table-cell">Note</th><th className="px-4 py-2.5 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{deposits.map((d) => (
              <tr key={d.id}><td className="px-4 py-3">{fmtDate(d.txn_date)}</td><td className="px-4 py-3">{DEP_LABEL[d.kind] ?? d.kind}</td><td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{d.note}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${d.kind === "collected" ? "text-emerald-700" : "text-rose-700"}`}>{d.kind === "collected" ? "+" : "−"}{inr(d.amount)}</td></tr>))}
              {deposits.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No deposit recorded.</td></tr>}</tbody>
            <tfoot><tr className="bg-gray-50 font-semibold"><td colSpan={3} className="px-4 py-3 text-right">Balance held</td><td className="px-4 py-3 text-right tabular-nums">{inr(t.deposit_held)}</td></tr></tfoot></table>
        </div>
      )}

      {tab === "docs" && <Documents tenantId={t.id} docs={docs} canEdit={can(me.role, "manageTenants")} onChange={q.reload} open={openDoc} />}

      {modal === "edit" && <EditModal t={t} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "terms" && <TermsModal t={t} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "transfer" && <TransferModal t={t} beds={beds.filter((b) => b.bed_id !== t.bed_id)} rooms={rooms} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "checkout" && <CheckoutModal t={t} onClose={() => setModal(null)} onSaved={done} />}
      {modal === "charge" && <ChargeModal tenantId={t.id} onClose={() => setModal(null)} onSaved={done} />}
    </>
  );
}

// ---------------------------------------------------------------- modals
function EditModal({ t, onClose, onSaved }: { t: TenantRow; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [f, setF] = useState({ full_name: t.full_name, phone: t.phone, email: t.email ?? "", emergency_name: t.emergency_name, emergency_phone: t.emergency_phone, address: t.address, id_proof_type: t.id_proof_type ?? "aadhaar", id_proof_number: t.id_proof_number });
  const [photo, setPhoto] = useState<File | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (f.full_name.trim().length < 2) throw new Error("Enter the tenant's name.");
    if (!/^[0-9+ -]{8,15}$/.test(f.phone.trim())) throw new Error("Enter a valid phone number.");
    const patch: Record<string, unknown> = { ...f, phone: f.phone.trim(), email: f.email || null };
    if (photo) patch.photo_path = await uploadFile("tenant-documents", `${t.id}/photo-${Date.now()}-${safeName(photo.name)}`, photo);
    unwrap(await sb().from("tenants").update(patch).eq("id", t.id));
  }
  return (
    <Modal open onClose={onClose} title="Edit tenant details" size="lg" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(save, "Details saved")) onSaved(); }}>Save</AsyncButton></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={set("full_name")} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Change photo"><input type="file" accept="image/*" className="input !p-1.5" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Emergency contact name"><input className="input" value={f.emergency_name} onChange={set("emergency_name")} /></Field>
        <Field label="Emergency contact phone"><input className="input" value={f.emergency_phone} onChange={set("emergency_phone")} /></Field>
        <Field label="Permanent address" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address} onChange={set("address")} /></Field>
        <Field label="ID proof type"><select className="input" value={f.id_proof_type} onChange={set("id_proof_type")}>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="ID proof number"><input className="input" value={f.id_proof_number} onChange={set("id_proof_number")} /></Field>
      </div>
    </Modal>
  );
}

function TermsModal({ t, onClose, onSaved }: { t: TenantRow; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [rent, setRent] = useState(String(t.monthly_rent ?? 0)); const [out, setOut] = useState(t.planned_checkout ?? "");
  return (
    <Modal open onClose={onClose} title="Rent & planned check-out" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(async () => { if (rent === "" || Number(rent) < 0) throw new Error("Enter a valid rent."); unwrap(await sb().rpc("update_stay_terms", { p_stay: t.stay_id, p_rent: Number(rent), p_planned_checkout: out || null })); }, "Saved")) onSaved(); }}>Save</AsyncButton></>}>
      <div className="space-y-4">
        <Field label="Monthly rent (₹)" hint="Applies to invoices generated from now on. Existing invoices never change."><input type="number" min={0} className="input" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
        <Field label="Planned check-out date" hint="Triggers a reminder before the date"><input type="date" className="input" value={out} min={todayISO()} onChange={(e) => setOut(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function TransferModal({ t, beds, rooms, onClose, onSaved }: { t: TenantRow; beds: BedRow[]; rooms: Pick<RoomRow, "room_id" | "rent_per_bed">[]; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [bed, setBed] = useState(""); const [date, setDate] = useState(todayISO()); const [rent, setRent] = useState("");
  const pick = (id: string) => { setBed(id); const b = beds.find((x) => x.bed_id === id); setRent(String(rooms.find((r) => r.room_id === b?.room_id)?.rent_per_bed ?? "")); };
  return (
    <Modal open onClose={onClose} title={`Transfer ${t.full_name}`} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <AsyncButton busyLabel="Transferring…" onClick={async () => { if (await run(async () => { if (!bed) throw new Error("Choose the new bed."); if (rent === "") throw new Error("Enter the new monthly rent."); unwrap(await sb().rpc("transfer_tenant", { p_tenant: t.id, p_new_bed: bed, p_date: date, p_new_rent: Number(rent) })); }, "Tenant transferred")) onSaved(); }}>Transfer</AsyncButton></>}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Currently in Room {t.room_no}, Bed {t.bed_no} at {inr(t.monthly_rent ?? 0)}. The old bed becomes available immediately; history is kept.</p>
        <Field label="New room & bed"><select className="input" value={bed} onChange={(e) => pick(e.target.value)}><option value="">Select a vacant bed…</option>{beds.map((b) => <option key={b.bed_id} value={b.bed_id}>Room {b.room_no} · Bed {b.bed_no} · {cap(b.sharing)}</option>)}</select></Field>
        <Field label="Transfer date"><input type="date" className="input" value={date} min={t.start_date ?? undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="New monthly rent (₹)" hint="Pre-filled from the new room's rate; edit for a custom rent. Applies to future invoices."><input type="number" min={0} className="input" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function CheckoutModal({ t, onClose, onSaved }: { t: TenantRow; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [date, setDate] = useState(todayISO());
  const [ded, setDed] = useState<{ reason: string; amount: string }[]>([]);
  const [settle, setSettle] = useState(true); const [prorate, setProrate] = useState(true);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const pv = useQuery(async () => unwrap(await sb().rpc("checkout_preview", { p_tenant: t.id })) as unknown as { pending_dues: number; deposit_held: number }, []);
  const held = Number(pv.data?.deposit_held ?? 0), dues = Number(pv.data?.pending_dues ?? 0);
  const deductions = ded.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const settled = settle ? Math.min(dues, Math.max(held - deductions, 0)) : 0;
  const refund = held - deductions - settled;

  async function go() {
    if (deductions > held) throw new Error("Deductions can't exceed the deposit held.");
    const r = unwrap(await sb().rpc("check_out", { p_tenant: t.id, p_date: date, p_deductions: ded.filter((d) => Number(d.amount) > 0).map((d) => ({ reason: d.reason || "Deduction", amount: Number(d.amount) })), p_settle_dues_from_deposit: settle, p_prorate_final: prorate })) as unknown as Record<string, number>;
    setResult(r);
  }
  if (result) return (
    <Modal open onClose={onSaved} title="Check-out complete" size="sm" footer={<button className="btn-primary" onClick={onSaved}>Done</button>}>
      <ul className="text-sm space-y-2">
        <li className="flex justify-between"><span className="text-gray-500">Deposit held</span><b>{inr(result.deposit_held)}</b></li>
        <li className="flex justify-between"><span className="text-gray-500">Deductions</span><b>−{inr(result.deductions)}</b></li>
        <li className="flex justify-between"><span className="text-gray-500">Adjusted against dues</span><b>−{inr(result.settled_against_dues)}</b></li>
        <li className="flex justify-between border-t pt-2 text-base"><span>Refund to tenant</span><b className="text-emerald-700">{inr(result.refund)}</b></li>
        {Number(result.rent_credit_to_refund) > 0 && <li className="text-amber-700 text-xs">Rent already paid for unused days: {inr(result.rent_credit_to_refund)} — settle this with the tenant separately.</li>}
        {Number(result.pending_dues_after) > 0 && <li className="text-rose-700 text-xs">Still unpaid after check-out: {inr(result.pending_dues_after)}</li>}
      </ul>
      <p className="text-xs text-gray-400 mt-4">The bed is now available and the tenant record is kept in history.</p>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={`Check out ${t.full_name}`} footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton className="btn-danger" busyLabel="Checking out…" disabled={pv.loading} onClick={async () => { await run(go); }}>Check out</AsyncButton></>}>
      <div className="space-y-5">
        <Field label="Leaving date"><input type="date" className="input sm:w-56" value={date} min={t.start_date ?? undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">Pending rent &amp; charges</p><p className="text-lg font-semibold tabular-nums text-rose-700">{pv.loading ? "…" : inr(dues)}</p></div>
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-400">Security deposit held</p><p className="text-lg font-semibold tabular-nums">{pv.loading ? "…" : inr(held)}</p></div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium text-gray-700">Deductions from deposit</span><button className="btn-ghost" onClick={() => setDed([...ded, { reason: "", amount: "" }])}><Icon name="plus" />Add</button></div>
          {ded.length === 0 && <p className="text-xs text-gray-400">Damages, lost keys, etc. (optional)</p>}
          {ded.map((d, i) => (
            <div key={i} className="flex gap-2 mb-2"><input className="input" placeholder="Reason" value={d.reason} onChange={(e) => setDed(ded.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
              <input className="input !w-32" type="number" min={0} placeholder="₹" value={d.amount} onChange={(e) => setDed(ded.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button className="btn-ghost" aria-label="Remove" onClick={() => setDed(ded.filter((_, j) => j !== i))}><Icon name="x" /></button></div>))}
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={settle} onChange={(e) => setSettle(e.target.checked)} /><span>Settle pending dues from the deposit<span className="block text-xs text-gray-400">Otherwise dues stay open and the full deposit is refunded.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={prorate} onChange={(e) => setProrate(e.target.checked)} /><span>Pro-rate this month&apos;s rent to the leaving date<span className="block text-xs text-gray-400">Reduces the unpaid part of the final invoice.</span></span></label>
        <div className="rounded-lg border border-gray-200 p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Deposit held</span><span className="tabular-nums">{inr(held)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">− Deductions</span><span className="tabular-nums">{inr(deductions)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">− Dues settled</span><span className="tabular-nums">{inr(settled)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><span>Refund</span><span className={`tabular-nums ${refund < 0 ? "text-rose-700" : "text-emerald-700"}`}>{inr(Math.max(refund, 0))}</span></div>
          {!pv.loading && dues > held && settle && <p className="text-xs text-amber-700">Dues exceed the deposit; {inr(dues - held)} will remain payable (estimate — pro-rating may reduce it).</p>}
        </div>
      </div>
    </Modal>
  );
}

function ChargeModal({ tenantId, onClose, onSaved }: { tenantId: string; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [f, setF] = useState({ kind: "food", label: "Food (meals)", amount: "" });
  return (
    <Modal open onClose={onClose} title="Add monthly extra" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(async () => { if (!(Number(f.amount) > 0)) throw new Error("Enter an amount above 0."); unwrap(await sb().from("tenant_recurring_charges").insert({ tenant_id: tenantId, kind: f.kind, label: f.label || cap(f.kind), amount: Number(f.amount) })); }, "Added")) onSaved(); }}>Add</AsyncButton></>}>
      <div className="space-y-4">
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, label: cap(e.target.value) })}>{["food", "electricity", "laundry", "maintenance", "other"].map((k) => <option key={k} value={k}>{cap(k)}</option>)}</select></Field>
        <Field label="Label on invoice"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
        <Field label="Amount per month (₹)"><input type="number" min={0} className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function Documents({ tenantId, docs, canEdit, onChange, open }: { tenantId: string; docs: Doc[]; canEdit: boolean; onChange: () => void; open: (p: string) => void }) {
  const run = useAction(); const { confirm } = useUi();
  const [type, setType] = useState("Aadhaar"); const [file, setFile] = useState<File | null>(null); const [key, setKey] = useState(0);
  async function upload() {
    if (!file) throw new Error("Choose a file first.");
    if (file.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB.");
    const path = await uploadFile("tenant-documents", `${tenantId}/docs/${Date.now()}-${safeName(file.name)}`, file);
    unwrap(await sb().from("tenant_documents").insert({ tenant_id: tenantId, doc_type: type, file_name: file.name, file_path: path }));
  }
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <Field label="Document type" className="sm:w-52"><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="File (max 10 MB)" className="flex-1"><input key={key} type="file" className="input !p-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <AsyncButton busyLabel="Uploading…" onClick={async () => { if (await run(upload, "Document uploaded")) { setFile(null); setKey(key + 1); onChange(); } }}><Icon name="upload" />Upload</AsyncButton>
        </div>)}
      <div className="card divide-y divide-gray-100">
        {docs.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No documents uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm"><Icon name="file" className="w-5 h-5 text-gray-400" />
            <div className="min-w-0 flex-1"><p className="font-medium truncate">{d.file_name}</p><p className="text-xs text-gray-400">{d.doc_type} · {fmtDate(d.created_at)}</p></div>
            <button className="btn-ghost" onClick={() => open(d.file_path)}><Icon name="eye" />View</button>
            {canEdit && <button className="btn-ghost hover:!text-rose-600" aria-label="Delete document" onClick={async () => { if (await confirm({ title: "Delete this document?", danger: true, confirmLabel: "Delete" }) && await run(async () => { await sb().storage.from("tenant-documents").remove([d.file_path]); unwrap(await sb().from("tenant_documents").delete().eq("id", d.id)); }, "Deleted")) onChange(); }}><Icon name="trash" /></button>}
          </div>))}
      </div>
    </div>
  );
}
