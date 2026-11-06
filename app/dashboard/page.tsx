"use client";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, ErrorBox, PageHeader, Spinner, Stat, StatusBadge } from "@/components/ui";
import { fmtDate, inr, inrShort, monthLabel, monthShort, monthStart, thisMonth } from "@/lib/format";
import { sb, unwrap, useProfile, useQuery } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { DashboardStats, InvoiceRow, TenantRow } from "@/types";

/** Chart palette — categorical slots validated with validate_palette.js (light): ΔE CVD ≥ 13.8, normal ≥ 17.4, contrast ≥ 3:1. */
const C = { received: "#14917A", billed: "#6C8EDB", expenses: "#E0735A", occupied: "#14917A", vacant: "#E6E4DC", good: "#2E9E6B", pending: "#E3A83B", overdue: "#DC5A4E" };
const INK = "#141B18", MUTED = "#77756A";
const tip = { contentStyle: { background: INK, border: "none", borderRadius: 12, color: "#fff", fontSize: 12, boxShadow: "0 12px 30px -12px rgba(0,0,0,.45)" }, labelStyle: { color: "#fff", fontWeight: 600 }, itemStyle: { color: "#fff" } };
const legendInk = (v: string) => <span style={{ color: MUTED }}>{v}</span>;
const axis = { tick: { fontSize: 11, fill: MUTED }, tickLine: false, axisLine: false } as const;

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
  const billedTotal = collected + notDue + late;
  const pie = [{ name: "Collected", value: collected, color: C.good }, { name: "Pending", value: notDue, color: C.pending }, { name: "Overdue", value: late, color: C.overdue }].filter((p) => p.value > 0);
  const monthly = s.monthly.map((m) => ({ ...m, label: monthShort(m.month), billed: Number(m.billed), received: Number(m.received), expenses: Number(m.expenses) }));
  const thisReceived = monthly.at(-1)?.received ?? 0;
  const occ = s.occupancy.map((o) => ({ name: o.sharing[0].toUpperCase() + o.sharing.slice(1), Occupied: Number(o.occupied), Vacant: Number(o.beds) - Number(o.occupied) }));
  const first = (me.full_name || "there").split(" ")[0];

  return (
    <>
      <PageHeader title={`Welcome back, ${first}`} subtitle={`Here’s how things look for ${monthLabel(monthStart(month))}`}
        actions={<input type="month" className="input !w-auto !rounded-full !bg-white shadow-card !border-transparent !px-5" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />} />

      {/* Money row: four pastel tiles + the collection hero chart */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat size="lg" tint="peach" label="Expected Revenue" value={inr(s.expected)} sub={`Billed for ${monthLabel(monthStart(month))}`} href="/dashboard/billing" />
          <Stat size="lg" tint="mint" label="Collected" value={inr(s.collected)} sub="Received on this month’s bills" href="/dashboard/payments" />
          <Stat size="lg" tint="butter" label="Pending Payments" value={inr(s.pending_amount)} sub={`${s.pending_count} invoices not yet due`} href="/dashboard/payments" />
          <Stat size="lg" tint="blush" tone={s.overdue_count ? "bad" : "default"} label="Overdue Payments" value={inr(s.overdue_amount)} sub={`${s.overdue_count} invoices overdue`} href="/dashboard/payments" />
        </div>

        <section className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 text-white p-5 sm:p-6 shadow-card min-h-[300px] flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Monthly rental collection</h2>
              <p className="mt-1 text-3xl sm:text-4xl font-bold tabular-nums tracking-tight">{inr(thisReceived)}</p>
              <p className="text-xs text-white/70 mt-0.5">Cash received in {monthShort(monthly.at(-1)?.month ?? monthStart(month))}</p>
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold whitespace-nowrap">Last 12 months</span>
          </div>
          <div className="flex-1 min-h-[170px] mt-4" role="img" aria-label="Bar chart of rent received in each of the last 12 months">
            <ResponsiveContainer>
              <BarChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.14)" />
                <XAxis dataKey="label" interval="preserveStartEnd" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} tickLine={false} axisLine={false} width={52} />
                <Tooltip {...tip} formatter={(v: number) => [inr(v), "Received"]} cursor={{ fill: "rgba(255,255,255,0.08)" }} />
                <Bar dataKey="received" name="Received" radius={[5, 5, 0, 0]} maxBarSize={18}>
                  {monthly.map((m, i) => <Cell key={m.month} fill={i === monthly.length - 1 ? "#FFFFFF" : "#FBF1CF"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Property numbers */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mt-4">
        <Stat label="Total Rooms" value={s.total_rooms} icon="home" />
        <Stat label="Total Beds" value={s.total_beds} icon="bed" />
        <Stat label="Occupied Beds" value={s.occupied_beds} sub={`${s.total_beds ? Math.round((s.occupied_beds / s.total_beds) * 100) : 0}% occupancy`} icon="users" />
        <Stat label="Available Beds" value={s.available_beds} tone={s.available_beds ? "good" : "default"} sub="Ready to allot" icon="bed" />
        <Stat label="Total Tenants" value={s.total_tenants} sub="Currently staying" icon="users" />
        <Stat label="Deposits Held" value={inr(s.deposits_held)} sub="Held, not income" icon="shield" />
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mt-4">
        <section className="card p-5 sm:p-6 xl:col-span-2">
          <h2 className="section-title">Monthly revenue trend</h2>
          <div className="h-64" role="img" aria-label="Line chart of billed, received and expenses per month">
            <ResponsiveContainer>
              <LineChart data={monthly} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEEDE6" />
                <XAxis dataKey="label" interval="preserveStartEnd" {...axis} />
                <YAxis tickFormatter={inrShort} {...axis} width={52} />
                <Tooltip {...tip} formatter={(v: number) => inr(v)} cursor={{ stroke: "#D3D1C7" }} />
                <Legend iconType="circle" iconSize={8} formatter={legendInk} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="received" name="Received" stroke={C.received} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
                <Line type="monotone" dataKey="billed" name="Billed" stroke={C.billed} strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
                {showFin && <Line type="monotone" dataKey="expenses" name="Expenses" stroke={C.expenses} strokeWidth={2.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="section-title">Pending vs collected</h2>
          <p className="text-xs text-gray-400 -mt-2 mb-2">{monthLabel(monthStart(month))}</p>
          {pie.length === 0 ? <p className="text-sm text-gray-400 py-20 text-center">No invoices for this month yet.</p> : (
            <>
              <div className="h-44 relative" role="img" aria-label="Donut chart of collected, pending and overdue amounts">
                <ResponsiveContainer>
                  <PieChart><Pie data={pie} dataKey="value" innerRadius="64%" outerRadius="92%" paddingAngle={3} cornerRadius={6} stroke="none">{pie.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie>
                    <Tooltip {...tip} formatter={(v: number) => inr(v)} /></PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold tabular-nums">{billedTotal ? Math.round((collected / billedTotal) * 100) : 0}%</span>
                  <span className="text-[11px] text-gray-500">collected</span>
                </div>
              </div>
              <ul className="mt-3 space-y-2.5 text-sm">
                {[["Collected", collected, C.good], ["Pending", notDue, C.pending], ["Overdue", late, C.overdue]].map(([n, v, c]) => (
                  <li key={n as string} className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c as string }} /><span className="text-gray-600">{n}</span><span className="ml-auto font-semibold tabular-nums">{inr(v as number)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <section className="card p-5 sm:p-6">
          <h2 className="section-title">Occupancy by sharing type</h2>
          <div className="h-48" role="img" aria-label="Stacked bar chart of occupied and vacant beds by sharing type">
            <ResponsiveContainer>
              <BarChart data={occ} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid horizontal={false} stroke="#EEEDE6" />
                <XAxis type="number" allowDecimals={false} {...axis} />
                <YAxis type="category" dataKey="name" {...axis} tick={{ fontSize: 12, fill: INK }} width={58} />
                <Tooltip {...tip} cursor={{ fill: "rgba(20,27,24,0.04)" }} />
                <Legend iconType="circle" iconSize={8} formatter={legendInk} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Occupied" stackId="a" fill={C.occupied} stroke="#fff" strokeWidth={2} radius={[6, 0, 0, 6]} barSize={18} />
                <Bar dataKey="Vacant" stackId="a" fill={C.vacant} stroke="#fff" strokeWidth={2} radius={[0, 6, 6, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {occ.map((o) => (
              <li key={o.name} className="flex items-center justify-between gap-3">
                <span className="text-gray-600">{o.name}</span>
                <span className="font-semibold tabular-nums">{o.Occupied} of {o.Occupied + o.Vacant} beds <span className="font-normal text-gray-400">· {o.Occupied + o.Vacant ? Math.round((o.Occupied / (o.Occupied + o.Vacant)) * 100) : 0}%</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3"><h2 className="section-title !mb-0">Needs attention</h2><Link href="/dashboard/payments" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link></div>
          {overdue.length === 0 ? <p className="text-sm text-gray-400 py-6">Nothing overdue. 🎉</p> : (
            <ul className="space-y-1">
              {overdue.map((i) => (
                <li key={i.id}><Link href={`/dashboard/billing/${i.id}`} className="flex items-center gap-3 p-2.5 -mx-2.5 rounded-2xl hover:bg-gray-50">
                  <span className="w-9 h-9 rounded-full bg-tint-blush text-rose-700 text-xs font-bold flex items-center justify-center shrink-0">{i.room_no}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{i.tenant_name}</p><p className="text-xs text-gray-400">Due {fmtDate(i.due_date)}</p></div>
                  <div className="text-right"><p className="text-sm font-bold text-rose-700 tabular-nums">{inr(i.balance)}</p><StatusBadge status={i.status} /></div>
                </Link></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="section-title">Upcoming check-outs</h2>
          {checkouts.length === 0 ? <p className="text-sm text-gray-400 py-6">No planned check-outs.</p> : (
            <ul className="space-y-1">
              {checkouts.map((t) => (
                <li key={t.id}><Link href={`/dashboard/tenants/${t.id}`} className="flex items-center gap-3 p-2.5 -mx-2.5 rounded-2xl hover:bg-gray-50">
                  <span className="w-9 h-9 rounded-full bg-tint-butter text-amber-800 text-xs font-bold flex items-center justify-center shrink-0">{t.room_no}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{t.full_name}</p><p className="text-xs text-gray-400">Deposit held {inr(t.deposit_held)}</p></div>
                  <Badge tone="amber">{fmtDate(t.planned_checkout)}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
