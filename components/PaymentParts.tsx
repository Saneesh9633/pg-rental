"use client";
import { useState } from "react";
import { AsyncButton, Field, Modal } from "@/components/ui";
import { cap, inr, todayISO, methodLabel } from "@/lib/format";
import { sb, unwrap, useAction } from "@/lib/hooks";
import { emit, receiptPdf } from "@/lib/pdf";
import type { InvoiceRow, PaymentMethod, PaymentRow, Settings } from "@/types";

export const METHODS: PaymentMethod[] = ["cash", "upi", "bank_transfer", "card"];

export async function loadSettings(): Promise<Settings> {
  return unwrap(await sb().from("settings").select("*").eq("id", 1).single()) as unknown as Settings;
}

/** Opens (print) or downloads the PDF receipt for a payment. */
export async function showReceipt(p: PaymentRow, inv: InvoiceRow, mode: "print" | "download") {
  const [pg, all] = await Promise.all([loadSettings(), sb().from("payments").select("*").eq("invoice_id", p.invoice_id).is("voided_at", null).order("created_at")]);
  const list = (unwrap(all) as unknown as PaymentRow[]).filter((x) => x.created_at <= p.created_at);
  const paidSoFar = list.reduce((a, x) => a + Number(x.amount), 0);
  emit(await receiptPdf(pg, p, inv, p.voided_at ? Number(p.amount) : paidSoFar), `${p.receipt_no}.pdf`, mode);
}

export function RecordPaymentModal({ invoice, onClose, onSaved }: { invoice: InvoiceRow; onClose: () => void; onSaved: (p: PaymentRow) => void }) {
  const run = useAction();
  const balance = Math.max(Number(invoice.balance), 0);
  const [f, setF] = useState({ amount: String(balance), method: "upi" as PaymentMethod, reference: "", paid_on: todayISO(), note: "" });
  const [saved, setSaved] = useState<PaymentRow | null>(null);

  async function save() {
    const amt = Number(f.amount);
    if (!(amt > 0)) throw new Error("Enter an amount above 0.");
    if (amt > balance) throw new Error(`The balance on this invoice is only ${inr(balance)}.`);
    if (f.method !== "cash" && !f.reference.trim()) throw new Error("Enter the transaction reference / UTR so the payment can be traced.");
    const p = unwrap(await sb().from("payments").insert({ invoice_id: invoice.id, amount: amt, method: f.method, reference: f.reference.trim(), paid_on: f.paid_on, note: f.note }).select().single()) as unknown as PaymentRow;
    setSaved(p);
  }

  if (saved) return (
    <Modal open onClose={() => onSaved(saved)} title="Payment recorded" size="sm" footer={<button className="btn-primary" onClick={() => onSaved(saved)}>Done</button>}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl">✓</div>
        <p className="font-semibold">{inr(saved.amount)} received from {invoice.tenant_name}</p>
        <p className="text-sm text-gray-500">Receipt {saved.receipt_no}</p>
        <div className="flex justify-center gap-2"><button className="btn-secondary" onClick={() => showReceipt(saved, invoice, "print")}>Print receipt</button><button className="btn-secondary" onClick={() => showReceipt(saved, invoice, "download")}>Download PDF</button></div>
      </div>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={`Record payment — ${invoice.tenant_name}`} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton busyLabel="Saving…" onClick={async () => { await run(save); }}>Record payment</AsyncButton></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm flex justify-between"><span className="text-gray-500">{invoice.invoice_no}</span><span>Balance <b className="tabular-nums">{inr(balance)}</b></span></div>
        <Field label="Amount received (₹)" hint="Enter less than the balance for a part payment"><input type="number" min={1} max={balance} className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>{METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}</select></Field>
          <Field label="Date received"><input type="date" className="input" value={f.paid_on} max={todayISO()} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        </div>
        <Field label={f.method === "cash" ? "Reference (optional)" : "Transaction reference / UTR *"}><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={f.method === "cash" ? "" : "e.g. UPI ref no."} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
