"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AsyncButton, DataTable, ErrorBox, PageHeader, Spinner, Stat, StatusBadge, type Column } from "@/components/ui";
import { fmtDate, inr, monthLabel, monthStart, thisMonth } from "@/lib/format";
import { sb, unwrap, useAction, useQuery, useUi } from "@/lib/hooks";
import type { InvoiceRow } from "@/types";

export default function BillingPage() {
  const router = useRouter(); const run = useAction(); const { confirm, toast } = useUi();
  const [month, setMonth] = useState(thisMonth()); const [status, setStatus] = useState("");
  const q = useQuery(async () => unwrap(await sb().from("v_invoice_summary").select("*").eq("period", monthStart(month)).order("room_no")) as unknown as InvoiceRow[], [month]);

  async function generate() {
    if (!(await confirm({ title: `Generate invoices for ${monthLabel(monthStart(month))}?`, message: "One invoice is created for every tenant staying in that month (rent plus their fixed monthly extras). Tenants who already have an invoice are skipped, so it is safe to run again.", confirmLabel: "Generate" }))) return;
    let n = 0;
    if (await run(async () => { n = unwrap(await sb().rpc("generate_monthly_invoices", { p_period: monthStart(month) })) as unknown as number; })) {
      toast("ok", n ? `${n} invoice${n > 1 ? "s" : ""} created.` : "All tenants already have an invoice for this month."); q.reload();
    }
  }
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const all = q.data; const rows = all.filter((i) => !status || i.status === status);
  const sum = (f: (i: InvoiceRow) => number) => all.reduce((a, i) => a + f(i), 0);
  const cols: Column<InvoiceRow>[] = [
    { key: "no", header: "Invoice", sort: (i) => i.invoice_no, render: (i) => <span className="font-medium text-indigo-700">{i.invoice_no}</span> },
    { key: "t", header: "Tenant", sort: (i) => i.tenant_name, render: (i) => i.tenant_name },
    { key: "r", header: "Room", sort: (i) => i.room_no, hideOnMobile: true, render: (i) => i.room_no },
    { key: "due", header: "Due date", sort: (i) => i.due_date, hideOnMobile: true, render: (i) => fmtDate(i.due_date) },
    { key: "tot", header: "Total", align: "right", sort: (i) => Number(i.total), render: (i) => inr(i.total) },
    { key: "paid", header: "Paid", align: "right", sort: (i) => Number(i.paid), render: (i) => inr(i.paid) },
    { key: "bal", header: "Balance", align: "right", sort: (i) => Number(i.balance), render: (i) => <b className={Number(i.balance) > 0 ? "text-gray-900" : "text-gray-400"}>{inr(Math.max(Number(i.balance), 0))}</b> },
    { key: "st", header: "Status", sort: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
  ];
  return (
    <>
      <PageHeader title="Billing & Invoices" subtitle="Monthly invoices — one individual bill per tenant"
        actions={<><input type="month" className="input !w-auto" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <AsyncButton busyLabel="Generating…" onClick={generate}>Generate invoices</AsyncButton></>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Invoices" value={all.length} />
        <Stat label="Billed" value={inr(sum((i) => Number(i.total)))} />
        <Stat label="Collected" value={inr(sum((i) => Number(i.paid)))} tone="good" />
        <Stat label="Outstanding" value={inr(sum((i) => Math.max(Number(i.balance), 0)))} tone="warn" />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(i) => i.id} searchText={(i) => `${i.invoice_no} ${i.tenant_name} ${i.room_no}`} searchPlaceholder="Search invoice, tenant, room…" onRowClick={(i) => router.push(`/dashboard/billing/${i.id}`)}
        toolbar={<select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partially paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select>}
        empty={<div className="text-center py-12 text-sm text-gray-500">No invoices for {monthLabel(monthStart(month))} yet.<br />Use <b>Generate invoices</b> to create this month’s bills.</div>} />
    </>
  );
}
