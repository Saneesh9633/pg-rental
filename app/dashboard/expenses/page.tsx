"use client";
import { useMemo, useState } from "react";
import { AsyncButton, Badge, DataTable, ErrorBox, Field, Icon, Modal, PageHeader, Spinner, Stat, type Column } from "@/components/ui";
import { cap, fmtDate, inr, monthLabel, monthStart, thisMonth, todayISO } from "@/lib/format";
import { safeName, sb, signedUrl, unwrap, uploadFile, useAction, useProfile, useQuery, useUi } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { ExpenseCategory, ExpenseRow } from "@/types";

const CATEGORIES: ExpenseCategory[] = ["electricity", "water", "food_groceries", "internet", "cleaning", "maintenance", "staff_salary", "other"];
const catLabel = (c: string) => (c === "food_groceries" ? "Food / Groceries" : c === "staff_salary" ? "Staff salary" : c === "other" ? "Other expenses" : cap(c));
type Form = { id?: string; category: ExpenseCategory; amount: string; expense_date: string; description: string; vendor: string; receipt_path: string | null };

export default function ExpensesPage() {
  const me = useProfile(); const run = useAction(); const { confirm } = useUi();
  const canEdit = can(me.role, "manageExpenses");
  const [month, setMonth] = useState(thisMonth()); const [cat, setCat] = useState("");
  const [form, setForm] = useState<Form | null>(null); const [file, setFile] = useState<File | null>(null);

  const q = useQuery(async () => {
    let qb = sb().from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
    if (month) { const [y, m] = month.split("-").map(Number); const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; qb = qb.gte("expense_date", monthStart(month)).lt("expense_date", next); }
    return unwrap(await qb) as unknown as ExpenseRow[];
  }, [month]);

  const rows = useMemo(() => (q.data ?? []).filter((e) => !cat || e.category === cat), [q.data, cat]);
  const total = rows.reduce((a, e) => a + Number(e.amount), 0);
  const byCat = useMemo(() => { const m = new Map<string, number>(); (q.data ?? []).forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount))); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]); }, [q.data]);
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const all = q.data.reduce((a, e) => a + Number(e.amount), 0);

  async function save() {
    if (!form) return;
    const amt = Number(form.amount);
    if (!(amt > 0)) throw new Error("Enter an amount above 0.");
    if (!form.expense_date) throw new Error("Pick the expense date.");
    let receipt = form.receipt_path;
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw new Error("Receipt is larger than 10 MB.");
      receipt = await uploadFile("expense-receipts", `${new Date().getFullYear()}/${Date.now()}-${safeName(file.name)}`, file);
    }
    const row = { category: form.category, amount: amt, expense_date: form.expense_date, description: form.description, vendor: form.vendor, receipt_path: receipt };
    unwrap(form.id ? await sb().from("expenses").update(row).eq("id", form.id) : await sb().from("expenses").insert(row));
  }
  async function remove(e: ExpenseRow) {
    if (!(await confirm({ title: "Delete this expense?", message: `${catLabel(e.category)} · ${inr(e.amount)} on ${fmtDate(e.expense_date)}. The deletion is recorded in the audit log.`, danger: true, confirmLabel: "Delete" }))) return;
    if (await run(async () => unwrap(await sb().from("expenses").delete().eq("id", e.id)), "Expense deleted")) q.reload();
  }
  const cols: Column<ExpenseRow>[] = [
    { key: "d", header: "Date", sort: (e) => e.expense_date, render: (e) => fmtDate(e.expense_date) },
    { key: "c", header: "Category", sort: (e) => e.category, render: (e) => <Badge tone="indigo">{catLabel(e.category)}</Badge> },
    { key: "desc", header: "Description", render: (e) => <span>{e.description || "—"}{e.vendor && <span className="block text-xs text-gray-400">{e.vendor}</span>}</span> },
    { key: "a", header: "Amount", align: "right", sort: (e) => Number(e.amount), render: (e) => <b>{inr(e.amount)}</b> },
    { key: "r", header: "Receipt", render: (e) => (e.receipt_path ? <button className="btn-ghost" onClick={async () => { const u = await signedUrl("expense-receipts", e.receipt_path!); if (u) window.open(u, "_blank"); }}><Icon name="eye" />View</button> : <span className="text-gray-300">—</span>) },
    ...(canEdit ? [{ key: "act", header: "", align: "right" as const, render: (e: ExpenseRow) => (
      <div className="flex justify-end gap-1"><button className="btn-ghost" aria-label="Edit" onClick={() => { setFile(null); setForm({ id: e.id, category: e.category, amount: String(e.amount), expense_date: e.expense_date, description: e.description, vendor: e.vendor, receipt_path: e.receipt_path }); }}><Icon name="pencil" /></button>
        <button className="btn-ghost hover:!text-rose-600" aria-label="Delete" onClick={() => remove(e)}><Icon name="trash" /></button></div>) }] : []),
  ];
  return (
    <>
      <PageHeader title="Expenses" subtitle="Track what it costs to run the PG"
        actions={canEdit && <button className="btn-primary" onClick={() => { setFile(null); setForm({ category: "electricity", amount: "", expense_date: todayISO(), description: "", vendor: "", receipt_path: null }); }}><Icon name="plus" />Add expense</button>} />
      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <Stat label={month ? `Total — ${monthLabel(monthStart(month))}` : "Total — all time"} value={inr(all)} sub={cat ? `${catLabel(cat)}: ${inr(total)}` : `${q.data.length} entries`} />
        <div className="card p-4 lg:col-span-2"><p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide mb-3">By category</p>
          {byCat.length === 0 ? <p className="text-sm text-gray-400">No expenses in this period.</p> : (
            <ul className="space-y-2">{byCat.slice(0, 5).map(([c, v]) => (
              <li key={c} className="flex items-center gap-3 text-sm"><span className="w-32 text-gray-600 truncate">{catLabel(c)}</span>
                <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-indigo-500 rounded-full" style={{ width: `${(v / all) * 100}%` }} /></span><span className="w-24 text-right tabular-nums">{inr(v)}</span></li>))}</ul>)}</div>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(e) => e.id} searchText={(e) => `${e.description} ${e.vendor} ${e.category}`} searchPlaceholder="Search description or vendor…" initialSort={{ key: "d", dir: "desc" }}
        toolbar={<><input type="month" className="input !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
          <select className="input !w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
          {month && <button className="btn-ghost" onClick={() => setMonth("")}>All months</button>}</>}
        footer={<tfoot><tr className="bg-gray-50 font-semibold"><td className="px-4 py-3" colSpan={3}>Total of {rows.length} shown</td><td className="px-4 py-3 text-right tabular-nums">{inr(total)}</td><td colSpan={canEdit ? 2 : 1} /></tr></tfoot>} />

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit expense" : "Add expense"}
        footer={<><button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(save, "Expense saved")) { setForm(null); q.reload(); } }}>Save</AsyncButton></>}>
        {form && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Category"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>{CATEGORIES.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select></Field>
            <Field label="Amount (₹)"><input type="number" min={0} className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus /></Field>
            <Field label="Date"><input type="date" className="input" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="Vendor / paid to"><input className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Bill / receipt" className="sm:col-span-2" hint={form.receipt_path && !file ? "A receipt is already attached. Choose a file to replace it." : "Photo or PDF, up to 10 MB"}><input type="file" accept="image/*,application/pdf" className="input !p-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          </div>)}
      </Modal>
    </>
  );
}
