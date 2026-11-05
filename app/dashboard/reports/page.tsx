"use client";
import { useState } from "react";
import { AsyncButton, Empty, ErrorBox, Icon, PageHeader, Spinner } from "@/components/ui";
import { inr, thisMonth } from "@/lib/format";
import { sb, unwrap, useAction, useProfile, useQuery } from "@/lib/hooks";
import { tablePdf, emit, pdfInr, xlsxDownload } from "@/lib/pdf";
import { REPORTS, runReport, type ReportId } from "@/lib/reports";
import { loadSettings } from "@/components/PaymentParts";
import { can } from "@/lib/roles";

export default function ReportsPage() {
  const me = useProfile(); const run = useAction();
  const list = REPORTS.filter((r) => !r.finance || can(me.role, "viewFinancials"));
  const [id, setId] = useState<ReportId>("monthly");
  const [year, setYear] = useState(thisMonth().slice(0, 4)); const [tenantId, setTenantId] = useState("");
  const meta = list.find((r) => r.id === id) ?? list[0];
  const tenants = useQuery(async () => unwrap(await sb().from("tenants").select("id,full_name").order("full_name")) as unknown as { id: string; full_name: string }[], []);
  const q = useQuery(() => runReport(meta.id, { year, tenantId }), [meta.id, year, tenantId]);
  const thisYear = Number(thisMonth().slice(0, 4));
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map(String);

  const fmtCell = (v: string | number, col: number) => (q.data?.moneyCols.includes(col) && typeof v === "number" ? inr(v) : String(v));
  async function pdf(mode: "download" | "print") {
    const d = q.data!; const pg = await loadSettings();
    const conv = (row: (string | number)[]) => row.map((v, i) => (d.moneyCols.includes(i) && typeof v === "number" ? pdfInr(v) : v));
    emit(await tablePdf({ title: meta.label, subtitle: d.subtitle, pg, columns: d.columns.map((c) => c.replace("₹", "Rs.")), rows: d.rows.map(conv), totals: d.totals && conv(d.totals), numericCols: d.moneyCols }), `${meta.id}-${year}.pdf`, mode);
  }
  async function xlsx() { const d = q.data!; await xlsxDownload(`${meta.id}-${year}.xlsx`, meta.label, d.columns, d.rows, d.totals); }

  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Pick a report, then print it or export to PDF / Excel" />
      <div className="grid lg:grid-cols-[260px_1fr] gap-5">
        <nav className="card p-2 h-fit" aria-label="Reports">
          {list.map((r) => (
            <button key={r.id} onClick={() => setId(r.id)} aria-current={meta.id === r.id}
              className={`w-full text-left px-3 py-2.5 rounded-lg ${meta.id === r.id ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
              <p className={`text-sm font-medium ${meta.id === r.id ? "text-indigo-700" : "text-gray-800"}`}>{r.label}</p><p className="text-xs text-gray-400">{r.desc}</p></button>))}
        </nav>
        <div className="min-w-0">
          <div className="card p-4 mb-4 flex flex-wrap items-center gap-3">
            <div className="mr-auto"><h2 className="font-semibold">{meta.label}</h2><p className="text-xs text-gray-400">{q.data?.subtitle}</p></div>
            {meta.needs === "year" && <select className="input !w-auto" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>}
            {meta.needs === "tenant" && <select className="input !w-56" value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Tenant"><option value="">Select tenant…</option>{tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>}
            <AsyncButton className="btn-secondary" disabled={!q.data?.rows.length} onClick={() => run(() => pdf("print"))}><Icon name="printer" />Print</AsyncButton>
            <AsyncButton className="btn-secondary" disabled={!q.data?.rows.length} onClick={() => run(() => pdf("download"))}><Icon name="download" />PDF</AsyncButton>
            <AsyncButton className="btn-secondary" disabled={!q.data?.rows.length} onClick={() => run(xlsx)}><Icon name="download" />Excel</AsyncButton>
          </div>
          {q.loading && !q.data ? <Spinner /> : q.error || !q.data ? <ErrorBox error={q.error ?? ""} onRetry={q.reload} /> : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/70 text-gray-500"><tr>{q.data.columns.map((c, i) => <th key={c} className={`px-4 py-2.5 text-xs uppercase tracking-wide font-medium whitespace-nowrap ${q.data!.moneyCols.includes(i) ? "text-right" : "text-left"}`}>{c}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">{q.data.rows.map((r, ri) => <tr key={ri} className="hover:bg-gray-50/60">{r.map((v, i) => <td key={i} className={`px-4 py-2.5 ${q.data!.moneyCols.includes(i) ? "text-right tabular-nums" : ""} ${typeof v === "number" && !q.data!.moneyCols.includes(i) ? "tabular-nums" : ""}`}>{fmtCell(v, i)}</td>)}</tr>)}</tbody>
                {q.data.totals && q.data.rows.length > 0 && <tfoot><tr className="bg-gray-50 font-semibold">{q.data.totals.map((v, i) => <td key={i} className={`px-4 py-3 ${q.data!.moneyCols.includes(i) ? "text-right tabular-nums" : ""}`}>{fmtCell(v, i)}</td>)}</tr></tfoot>}
              </table>
              {q.data.rows.length === 0 && <Empty title={meta.id === "tenant" && !tenantId ? "Choose a tenant to see their payment history" : "No data for this report yet"} />}
            </div>)}
        </div>
      </div>
    </>
  );
}
