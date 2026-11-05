"use client";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, ErrorBox, PageHeader, Spinner, Stat, StatusBadge } from "@/components/ui";
import { fmtDate, inr, inrShort, monthLabel, monthShort, monthStart, thisMonth } from "@/lib/format";
import { sb, unwrap, useProfile, useQuery } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { DashboardStats, InvoiceRow, TenantRow } from "@/types";

const C = { billed: "#4f46e5", received: "#059669", expenses: "#e11d48", pending: "#d97706", overdue: "#e11d48", vacant: "#e5e7eb" };
const tip = { contentStyle: { borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 } };

export default function DashboardPage() {
  const me = useProfile();
  const [month, setMonth] = useState(thisMonth());
  const showFin = can(me.role, "viewFinancials");

  const q = useQuery(async () => {
    const c = sb();
    const [stats, inv, att, co] = await Promise.all([
      c.rpc("dashboard_stats", { p_month: monthStart(month) }),
      c.from("v_invoice_summary").select("*").order("due_date"),
      c.from("v_invoice_summary").select("*").in("status", ["overdue"]).order("due_date").limit(6),
      c.from("v_tenant_current").select("*").eq("status", "active").not("planned_checkout", "is", null).order("planned_checkout").limit(5),
    ]);
    return {
      stats: unwrap(stats) as unknown as DashboardStats,
      invoices: unwrap(inv) as unknown as InvoiceRow[],
      overdue: unwrap(att) as unknown as InvoiceRow[],
      checkouts: unwrap(co) as unknown as TenantRow[],
    };
  }, [month]);

  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? "Failed to load"} onRetry={q.reload} />;
  const { stats: s, invoices, overdue, checkouts } = q.data;

  const forMonth = invoices.filter((i) => i.period === monthStart(month));
  const collected = forMonth.reduce((a, i) => a + Number(i.paid), 0);
  const notDue = forMonth.filter((i) => i.status === "pending" || i.status === "partial").reduce((a, i) => a + Number(i.balance), 0);
  const late = forMonth.filter((i) => i.status === "overdue").reduce((a, i) => a + Number(i.balance), 0);
  const pie = [{ name: "Collected", value: collected, color: C.received }, { name: "Pending", value: notDue, color: C.pending }, { name: "Overdue", value: late, color: C.overdue }].filter((p) => p.value > 0);
  const monthly = s.monthly.map((m) => ({ ...m, label: monthShort(m.month), billed: Number(m.billed), received: Number(m.received), expenses: Number(m.expenses) }));
  const occ = s.occupancy.map((o) => ({ name: o.sharing[0].toUpperCase() + o.sharing.slice(1), Occupied: Number(o.occupied), Vacant: Number(o.beds) - Number(o.occupied) }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Overview for ${monthLabel(monthStart(month))}`}
        actions={<input type="month" className="input !w-auto" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        <Stat label="Total Rooms" value={s.total_rooms} icon="home" />
        <Stat label="Total Beds" value={s.total_beds} icon="bed" />
        <Stat label="Occupied Beds" value={s.occupied_beds} sub={`${s.total_beds ? Math.round((s.occupied_beds / s.total_beds) * 100) : 0}% occupancy`} icon="users" />
        <Stat label="Available Beds" value={s.available_beds} tone={s.available_beds ? "good" : "default"} sub="Ready to allot" icon="bed" />
        <Stat label="Total Tenants" value={s.total_tenants} sub="Currently staying" icon="users" />
        <Stat label="Expected Revenue" value={inr(s.expected)} sub={`Billed for ${monthLabel(monthStart(month))}`} icon="chart" />
        <Stat label="Collected" value={inr(s.collected)} tone="good" sub="Received on this month's bills" icon="wallet" />
        <Stat label="Pending Payments" value={inr(s.pending_amount)} tone="warn" sub={`${s.pending_count} invoices not yet due`} icon="file" />
        <Stat label="Overdue Payments" value={inr(s.overdue_amount)} tone={s.overdue_count ? "bad" : "default"} sub={`${s.overdue_count} invoices overdue`} icon="alert" />
        <Stat label="Deposits Held" value={inr(s.deposits_held)} sub="Not counted as income" icon="shield" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <div className="card p-5">
          <h2 className="section-title">Monthly rental collection</h2>
          <p className="text-xs text-gray-400 -mt-2 mb-3">Cash received each month</p>
          <div className="h-64" role="img" aria-label="Bar chart of rent received per month">
            <ResponsiveContainer>
              <BarChart data={monthly}><CartesianGrid vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={inrShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip {...tip} formatter={(v: number) => inr(v)} cursor={{ fill: "#f9fafb" }} />
                <Bar dataKey="received" name="Received" fill={C.received} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="section-title">Pending vs collected — {monthLabel(monthStart(month))}</h2>
          {pie.length === 0 ? <p className="text-sm text-gray-400 py-20 text-center">No invoices for this month yet.</p> : (
            <div className="h-64 flex items-center" role="img" aria-label="Donut chart of collected, pending and overdue amounts">
              <div className="w-1/2 h-full">
                <ResponsiveContainer>
                  <PieChart><Pie data={pie} dataKey="value" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">{pie.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie>
                    <Tooltip {...tip} formatter={(v: number) => inr(v)} /></PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-1/2 space-y-3 text-sm">
                {[["Collected", collected, C.received], ["Pending", notDue, C.pending], ["Overdue", late, C.overdue]].map(([n, v, c]) => (
                  <li key={n as string} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c as string }} /><span className="text-gray-500">{n}</span><span className="ml-auto font-medium tabular-nums">{inr(v as number)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="section-title">Occupancy by sharing type</h2>
          <div className="h-64" role="img" aria-label="Stacked bar chart of occupied and vacant beds by sharing type">
            <ResponsiveContainer>
              <BarChart data={occ} layout="vertical" margin={{ left: 8 }}><CartesianGrid horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={60} />
                <Tooltip {...tip} cursor={{ fill: "#f9fafb" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Occupied" stackId="a" fill={C.billed} radius={[4, 0, 0, 4]} />
                <Bar dataKey="Vacant" stackId="a" fill={C.vacant} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="section-title">Monthly revenue trend</h2>
          <div className="h-64" role="img" aria-label="Line chart of billed, received and expenses per month">
            <ResponsiveContainer>
              <LineChart data={monthly}><CartesianGrid vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={inrShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip {...tip} formatter={(v: number) => inr(v)} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="billed" name="Billed" stroke={C.billed} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="received" name="Received" stroke={C.received} strokeWidth={2} dot={false} />
                {showFin && <Line type="monotone" dataKey="expenses" name="Expenses" stroke={C.expenses} strokeWidth={2} strokeDasharray="4 3" dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="section-title !mb-0">Needs attention — overdue</h2><Link href="/dashboard/payments" className="text-xs text-indigo-600 hover:underline">View all</Link></div>
          {overdue.length === 0 ? <p className="text-sm text-gray-400 py-4">Nothing overdue. 🎉</p> : (
            <ul className="divide-y divide-gray-100">
              {overdue.map((i) => (
                <li key={i.id}><Link href={`/dashboard/billing/${i.id}`} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{i.tenant_name}</p><p className="text-xs text-gray-400">Room {i.room_no} · due {fmtDate(i.due_date)}</p></div>
                  <span className="text-sm font-semibold text-rose-700 tabular-nums">{inr(i.balance)}</span><StatusBadge status={i.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-title">Upcoming check-outs</h2>
          {checkouts.length === 0 ? <p className="text-sm text-gray-400 py-4">No planned check-outs.</p> : (
            <ul className="divide-y divide-gray-100">
              {checkouts.map((t) => (
                <li key={t.id}><Link href={`/dashboard/tenants/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{t.full_name}</p><p className="text-xs text-gray-400">Room {t.room_no} · deposit held {inr(t.deposit_held)}</p></div>
                  <Badge tone="amber">{fmtDate(t.planned_checkout)}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
