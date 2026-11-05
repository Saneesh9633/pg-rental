"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RecordPaymentModal, showReceipt } from "@/components/PaymentParts";
import { Badge, DataTable, ErrorBox, Icon, PageHeader, SharingBadge, Spinner, Stat, StatusBadge, Tabs, type Column } from "@/components/ui";
import { cap, fmtDate, inr, monthName, thisMonth, methodLabel } from "@/lib/format";
import { sb, unwrap, useProfile, useQuery } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { InvoiceRow, PaymentRow } from "@/types";

type PayTx = PaymentRow & { invoice: { invoice_no: string; period: string }; tenant: { full_name: string } };

export default function PaymentsPage() {
  const me = useProfile();
  const now = thisMonth();
  const [tab, setTab] = useState<"dues" | "txns">("dues");
  const [year, setYear] = useState(now.slice(0, 4)); const [month, setMonth] = useState(now.slice(5, 7));
  const [room, setRoom] = useState(""); const [sharing, setSharing] = useState(""); const [tenant, setTenant] = useState(""); const [status, setStatus] = useState("");
  const [paying, setPaying] = useState<InvoiceRow | null>(null);

  const q = useQuery(async () => {
    const c = sb();
    const [i, p] = await Promise.all([c.from("v_invoice_summary").select("*").order("period", { ascending: false }), c.from("payments").select("*, invoice:invoices(invoice_no,period), tenant:tenants(full_name)").order("paid_on", { ascending: false }).order("created_at", { ascending: false }).limit(500)]);
    return { inv: unwrap(i) as unknown as InvoiceRow[], tx: unwrap(p) as unknown as PayTx[] };
  });
  const inv = useMemo(() => q.data?.inv ?? [], [q.data]);
  const years = useMemo(() => Array.from(new Set([now.slice(0, 4), ...inv.map((i) => i.period.slice(0, 4))])).sort().reverse(), [inv, now]);
  const rooms = useMemo(() => Array.from(new Set(inv.map((i) => i.room_no))).sort(), [inv]);
  const tenants = useMemo(() => Array.from(new Map(inv.map((i) => [i.tenant_id, i.tenant_name])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [inv]);
  const rows = useMemo(() => inv.filter((i) => (!year || i.period.startsWith(year)) && (!month || i.period.slice(5, 7) === month) && (!room || i.room_no === room) && (!sharing || i.sharing === sharing) && (!tenant || i.tenant_id === tenant) && (!status || i.status === status)), [inv, year, month, room, sharing, tenant, status]);

  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const sum = (f: (i: InvoiceRow) => number) => rows.reduce((a, i) => a + f(i), 0);

  const cols: Column<InvoiceRow>[] = [
    { key: "t", header: "Tenant", sort: (i) => i.tenant_name, render: (i) => <Link href={`/dashboard/tenants/${i.tenant_id}`} className="font-medium text-gray-900 hover:text-indigo-700" onClick={(e) => e.stopPropagation()}>{i.tenant_name}</Link> },
    { key: "r", header: "Room", sort: (i) => i.room_no, render: (i) => i.room_no },
    { key: "s", header: "Sharing", hideOnMobile: true, sort: (i) => i.sharing, render: (i) => <SharingBadge sharing={i.sharing} /> },
    { key: "p", header: "Month", sort: (i) => i.period, render: (i) => `${monthName(Number(i.period.slice(5, 7))).slice(0, 3)} ${i.period.slice(0, 4)}` },
    { key: "rent", header: "Monthly rent", align: "right", hideOnMobile: true, sort: (i) => Number(i.rent), render: (i) => inr(i.rent) },
    { key: "tot", header: "Total bill", align: "right", sort: (i) => Number(i.total), render: (i) => <Link href={`/dashboard/billing/${i.id}`} className="hover:underline">{inr(i.total)}</Link> },
    { key: "paid", header: "Paid", align: "right", sort: (i) => Number(i.paid), render: (i) => inr(i.paid) },
    { key: "bal", header: "Balance", align: "right", sort: (i) => Number(i.balance), render: (i) => <b>{inr(Math.max(Number(i.balance), 0))}</b> },
    { key: "due", header: "Due date", sort: (i) => i.due_date, render: (i) => fmtDate(i.due_date) },
    { key: "st", header: "Status", sort: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
    { key: "a", header: "", align: "right", render: (i) => can(me.role, "recordPayment") && Number(i.balance) > 0 ? <button className="btn-secondary !py-1 !px-2.5 whitespace-nowrap" onClick={() => setPaying(i)}>Record payment</button> : null },
  ];
  const txCols: Column<PayTx>[] = [
    { key: "d", header: "Date", sort: (p) => p.paid_on, render: (p) => fmtDate(p.paid_on) },
    { key: "r", header: "Receipt", sort: (p) => p.receipt_no, render: (p) => p.receipt_no },
    { key: "t", header: "Tenant", sort: (p) => p.tenant.full_name, render: (p) => p.tenant.full_name },
    { key: "i", header: "Invoice", hideOnMobile: true, render: (p) => <Link className="text-indigo-700 hover:underline" href={`/dashboard/billing/${p.invoice_id}`}>{p.invoice.invoice_no}</Link> },
    { key: "m", header: "Method", render: (p) => methodLabel(p.method) },
    { key: "ref", header: "Reference", hideOnMobile: true, render: (p) => p.reference || "—" },
    { key: "a", header: "Amount", align: "right", sort: (p) => Number(p.amount), render: (p) => (p.voided_at ? <span className="line-through text-gray-400">{inr(p.amount)}</span> : <b>{inr(p.amount)}</b>) },
    { key: "v", header: "", render: (p) => (p.voided_at ? <Badge tone="red">Void</Badge> : null) },
    { key: "rc", header: "", align: "right", render: (p) => <button className="btn-ghost" aria-label="Print receipt" onClick={async () => { const iv = inv.find((x) => x.id === p.invoice_id); if (iv) await showReceipt(p, iv, "print"); }}><Icon name="printer" /></button> },
  ];
  const sel = "input !w-auto";
  return (
    <>
      <PageHeader title="Payments" subtitle="Track what every tenant has paid and what is still due" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "dues", label: "Dues & status" }, { id: "txns", label: "Payment transactions" }]} />
      {tab === "dues" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Stat label="Total billed" value={inr(sum((i) => Number(i.total)))} sub={`${rows.length} invoices`} />
            <Stat label="Collected" value={inr(sum((i) => Number(i.paid)))} tone="good" />
            <Stat label="Balance" value={inr(sum((i) => Math.max(Number(i.balance), 0)))} tone="warn" />
            <Stat label="Overdue" value={inr(sum((i) => (i.status === "overdue" ? Number(i.balance) : 0)))} tone="bad" sub={`${rows.filter((i) => i.status === "overdue").length} invoices`} />
          </div>
          <DataTable rows={rows} columns={cols} rowKey={(i) => i.id} pageSize={15} searchText={(i) => `${i.tenant_name} ${i.room_no} ${i.invoice_no}`} searchPlaceholder="Search tenant, room, invoice…" initialSort={{ key: "p", dir: "desc" }}
            toolbar={<>
              <select className={sel} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"><option value="">All months</option>{Array.from({ length: 12 }, (_, k) => <option key={k} value={String(k + 1).padStart(2, "0")}>{monthName(k + 1)}</option>)}</select>
              <select className={sel} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year"><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
              <select className={sel} value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room"><option value="">All rooms</option>{rooms.map((r) => <option key={r} value={r}>Room {r}</option>)}</select>
              <select className={sel} value={sharing} onChange={(e) => setSharing(e.target.value)} aria-label="Sharing"><option value="">All sharing</option><option value="single">Single</option><option value="double">Double</option><option value="triple">Triple</option></select>
              <select className={sel} value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label="Tenant"><option value="">All tenants</option>{tenants.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
              <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Payment status"><option value="">All statuses</option><option value="paid">Paid</option><option value="partial">Partially paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option></select>
            </>} />
        </>
      ) : <DataTable rows={q.data.tx} columns={txCols} rowKey={(p) => p.id} pageSize={15} searchText={(p) => `${p.tenant.full_name} ${p.receipt_no} ${p.reference} ${p.invoice.invoice_no}`} searchPlaceholder="Search tenant, receipt, reference…" initialSort={{ key: "d", dir: "desc" }} />}
      {paying && <RecordPaymentModal invoice={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); q.reload(); }} />}
    </>
  );
}
