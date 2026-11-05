"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RecordPaymentModal, loadSettings, showReceipt } from "@/components/PaymentParts";
import { AsyncButton, Badge, ErrorBox, Field, Icon, Modal, SharingBadge, Spinner, StatusBadge } from "@/components/ui";
import { cap, fmtDate, fmtDateTime, inr, monthLabel, methodLabel } from "@/lib/format";
import { sb, unwrap, useAction, useProfile, useQuery, useUi } from "@/lib/hooks";
import { emit, invoicePdf } from "@/lib/pdf";
import { can } from "@/lib/roles";
import type { InvoiceItem, InvoiceRow, ItemKind, PaymentRow } from "@/types";

const KINDS: [ItemKind, string][] = [["electricity", "Electricity"], ["food", "Food"], ["laundry", "Laundry"], ["maintenance", "Maintenance"], ["other", "Other charge"], ["discount", "Discount"], ["adjustment", "Adjustment (+/−)"]];

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter(); const me = useProfile(); const run = useAction(); const { confirm, toast } = useUi();
  const [pay, setPay] = useState(false); const [add, setAdd] = useState(false); const [edit, setEdit] = useState(false); const [voiding, setVoiding] = useState<PaymentRow | null>(null);
  const q = useQuery(async () => {
    const c = sb();
    const [i, it, p] = await Promise.all([c.from("v_invoice_summary").select("*").eq("id", id).single(), c.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"), c.from("payments").select("*").eq("invoice_id", id).order("created_at")]);
    return { inv: unwrap(i) as unknown as InvoiceRow, items: unwrap(it) as unknown as InvoiceItem[], pays: unwrap(p) as unknown as PaymentRow[] };
  }, [id]);
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? "Invoice not found"} onRetry={q.reload} />;
  const { inv, items, pays } = q.data;
  const canInv = can(me.role, "manageInvoices");
  const balance = Math.max(Number(inv.balance), 0);

  async function pdf(mode: "print" | "download") { const pg = await loadSettings(); emit(await invoicePdf(pg, inv, items, pays), `${inv.invoice_no}.pdf`, mode); }
  async function removeItem(it: InvoiceItem) {
    if (!(await confirm({ title: `Remove “${it.description}”?`, message: "The change is recorded in the audit history.", danger: true, confirmLabel: "Remove" }))) return;
    if (await run(async () => unwrap(await sb().from("invoice_items").delete().eq("id", it.id)), "Removed")) q.reload();
  }
  async function del() {
    if (!(await confirm({ title: `Delete ${inv.invoice_no}?`, message: "Only invoices without payments can be deleted.", danger: true, confirmLabel: "Delete" }))) return;
    if (await run(async () => unwrap(await sb().from("invoices").delete().eq("id", inv.id)), "Invoice deleted")) router.push("/dashboard/billing");
  }

  return (
    <>
      <Link href="/dashboard/billing" className="text-sm text-gray-500 hover:text-gray-800 mb-3 inline-block">← All invoices</Link>
      <div className="card p-5 mb-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><h1 className="text-xl font-semibold">{inv.invoice_no}</h1><StatusBadge status={inv.status} /></div>
            <p className="text-sm text-gray-500 mt-1">{monthLabel(inv.period)} · due {fmtDate(inv.due_date)}</p>
            <p className="text-sm mt-2"><Link href={`/dashboard/tenants/${inv.tenant_id}`} className="font-medium text-indigo-700 hover:underline">{inv.tenant_name}</Link> · Room {inv.room_no}, Bed {inv.bed_no} · <SharingBadge sharing={inv.sharing} /></p>
            {inv.notes && <p className="text-sm text-gray-500 mt-1">Note: {inv.notes}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-right">
            <div><p className="text-[11px] uppercase text-gray-400">Total</p><p className="font-semibold tabular-nums">{inr(inv.total)}</p></div>
            <div><p className="text-[11px] uppercase text-gray-400">Paid</p><p className="font-semibold tabular-nums text-emerald-700">{inr(inv.paid)}</p></div>
            <div><p className="text-[11px] uppercase text-gray-400">Balance</p><p className={`font-semibold tabular-nums ${balance > 0 ? "text-rose-700" : ""}`}>{inr(balance)}</p></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
          {can(me.role, "recordPayment") && balance > 0 && <button className="btn-primary" onClick={() => setPay(true)}><Icon name="wallet" />Record payment</button>}
          <button className="btn-secondary" onClick={() => pdf("print")}><Icon name="printer" />Print</button>
          <button className="btn-secondary" onClick={() => pdf("download")}><Icon name="download" />PDF</button>
          {canInv && <button className="btn-secondary" onClick={() => setEdit(true)}><Icon name="pencil" />Due date &amp; note</button>}
          {canInv && pays.length === 0 && <button className="btn-secondary !text-rose-700" onClick={del}><Icon name="trash" />Delete</button>}
        </div>
      </div>

      <div className="card overflow-hidden mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100"><h2 className="section-title !mb-0">Charges</h2>{canInv && <button className="btn-ghost" onClick={() => setAdd(true)}><Icon name="plus" />Add charge / discount</button>}</div>
        <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">
          {items.map((it) => (
            <tr key={it.id}><td className="px-4 py-3">{it.description}</td><td className="px-4 py-3 hidden sm:table-cell"><Badge tone={Number(it.amount) < 0 ? "green" : "gray"}>{cap(it.kind)}</Badge></td>
              <td className={`px-4 py-3 text-right tabular-nums ${Number(it.amount) < 0 ? "text-emerald-700" : ""}`}>{inr(it.amount)}</td>
              {canInv && <td className="px-2 w-10"><button className="btn-ghost hover:!text-rose-600" aria-label={`Remove ${it.description}`} onClick={() => removeItem(it)}><Icon name="x" /></button></td>}</tr>))}
        </tbody><tfoot><tr className="bg-gray-50 font-semibold"><td className="px-4 py-3" colSpan={2}>Total</td><td className="px-4 py-3 text-right tabular-nums">{inr(inv.total)}</td>{canInv && <td />}</tr></tfoot></table>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100"><h2 className="section-title !mb-0">Payments</h2></div>
        {pays.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No payments yet.</p> : (
          <ul className="divide-y divide-gray-100">{pays.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <div className="min-w-[150px]"><p className={`font-medium tabular-nums ${p.voided_at ? "line-through text-gray-400" : ""}`}>{inr(p.amount)}</p><p className="text-xs text-gray-400">{fmtDate(p.paid_on)} · {methodLabel(p.method)}</p></div>
              <div className="text-xs text-gray-500 flex-1 min-w-[140px]">{p.receipt_no}{p.reference && ` · Ref ${p.reference}`}{p.note && ` · ${p.note}`}{p.voided_at && <span className="block text-rose-600">Void ({fmtDateTime(p.voided_at)}): {p.void_reason}</span>}</div>
              <div className="flex gap-1"><button className="btn-ghost" onClick={() => showReceipt(p, inv, "print")}><Icon name="printer" />Receipt</button><button className="btn-ghost" onClick={() => showReceipt(p, inv, "download")}><Icon name="download" /></button>
                {!p.voided_at && can(me.role, "voidPayment") && <button className="btn-ghost hover:!text-rose-600" onClick={() => setVoiding(p)}>Void</button>}</div>
            </li>))}</ul>)}
      </div>

      {pay && <RecordPaymentModal invoice={inv} onClose={() => setPay(false)} onSaved={() => { setPay(false); q.reload(); }} />}
      {add && <ChargeModal invoiceId={inv.id} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); q.reload(); }} />}
      {edit && <EditModal inv={inv} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); q.reload(); }} />}
      {voiding && <VoidModal p={voiding} onClose={() => setVoiding(null)} onSaved={() => { setVoiding(null); toast("ok", "Payment voided"); q.reload(); }} />}
    </>
  );
}

function ChargeModal({ invoiceId, onClose, onSaved }: { invoiceId: string; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const [f, setF] = useState({ kind: "electricity" as ItemKind, description: "Electricity", amount: "" });
  const neg = f.kind === "discount";
  async function save() {
    const a = Number(f.amount);
    if (f.amount === "" || Number.isNaN(a) || a === 0) throw new Error("Enter an amount.");
    if (f.kind !== "adjustment" && a < 0) throw new Error("Enter a positive amount.");
    unwrap(await sb().from("invoice_items").insert({ invoice_id: invoiceId, kind: f.kind, description: f.description.trim() || cap(f.kind), amount: neg ? -Math.abs(a) : a }));
  }
  return (
    <Modal open onClose={onClose} title="Add charge, discount or adjustment" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton busyLabel="Adding…" onClick={async () => { if (await run(save, "Added")) onSaved(); }}>Add</AsyncButton></>}>
      <div className="space-y-4">
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => { const k = e.target.value as ItemKind; setF({ ...f, kind: k, description: KINDS.find((x) => x[0] === k)![1].replace(" (+/−)", "") }); }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Description on invoice"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Amount (₹)" hint={neg ? "Enter the discount as a positive number; it is subtracted." : f.kind === "adjustment" ? "Use a negative number to reduce the bill." : undefined}><input type="number" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
      </div>
    </Modal>
  );
}
function EditModal({ inv, onClose, onSaved }: { inv: InvoiceRow; onClose: () => void; onSaved: () => void }) {
  const run = useAction(); const [due, setDue] = useState(inv.due_date); const [note, setNote] = useState(inv.notes);
  return (
    <Modal open onClose={onClose} title="Due date & note" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(async () => { if (!due) throw new Error("Pick a due date."); unwrap(await sb().from("invoices").update({ due_date: due, notes: note }).eq("id", inv.id)); }, "Saved")) onSaved(); }}>Save</AsyncButton></>}>
      <div className="space-y-4"><Field label="Payment due date"><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></Field><Field label="Note"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
    </Modal>
  );
}
function VoidModal({ p, onClose, onSaved }: { p: PaymentRow; onClose: () => void; onSaved: () => void }) {
  const run = useAction(); const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`Void ${p.receipt_no}`} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton className="btn-danger" busyLabel="Voiding…" onClick={async () => { if (await run(async () => unwrap(await sb().rpc("void_payment", { p_payment: p.id, p_reason: reason })))) onSaved(); }}>Void payment</AsyncButton></>}>
      <p className="text-sm text-gray-600 mb-3">The {inr(p.amount)} payment will no longer count towards the invoice. It stays on record for audit.</p>
      <Field label="Reason *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. UPI payment bounced" autoFocus /></Field>
    </Modal>
  );
}
