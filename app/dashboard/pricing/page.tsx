"use client";
import { useState } from "react";
import { AsyncButton, Badge, DataTable, ErrorBox, Field, PageHeader, Spinner, type Column } from "@/components/ui";
import { cap, fmtDateTime, inr } from "@/lib/format";
import { sb, unwrap, useAction, useProfile, useQuery, useUi } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { Pricing, Sharing } from "@/types";

interface Hist { id: number; at: string; actor: string | null; old_data: Pricing | null; new_data: Pricing }
const COPY: Record<Sharing, string> = { single: "One person per room", double: "Two people share a room", triple: "Three people share a room" };

export default function PricingPage() {
  const me = useProfile(); const run = useAction(); const { confirm } = useUi();
  const canEdit = can(me.role, "editPricing");
  const q = useQuery(async () => {
    const c = sb();
    const [p, h, u, n] = await Promise.all([
      c.from("pricing").select("*"),
      c.from("audit_log").select("id,at,actor,old_data,new_data").eq("table_name", "pricing").eq("action", "UPDATE").order("id", { ascending: false }).limit(50),
      c.from("profiles").select("id,full_name"),
      c.from("v_tenant_current").select("sharing,is_custom_rent").eq("status", "active"),
    ]);
    return { pricing: unwrap(p) as unknown as Pricing[], hist: unwrap(h) as unknown as Hist[], users: unwrap(u) as unknown as { id: string; full_name: string }[], tenants: unwrap(n) as unknown as { sharing: Sharing; is_custom_rent: boolean }[] };
  });
  const [edit, setEdit] = useState<Partial<Record<Sharing, string>>>({});
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const order: Sharing[] = ["single", "double", "triple"];
  const prices = order.map((s) => q.data!.pricing.find((p) => p.sharing === s)!);
  const who = (id: string | null) => q.data!.users.find((u) => u.id === id)?.full_name ?? "—";

  async function save(s: Sharing) {
    const v = Number(edit[s]);
    if (edit[s] === undefined || Number.isNaN(v) || v < 0) throw new Error("Enter a valid amount.");
    unwrap(await sb().from("pricing").update({ monthly_rent: v }).eq("sharing", s));
    setEdit((e) => { const n = { ...e }; delete n[s]; return n; });
  }
  async function apply(s: Sharing) {
    const n = q.data!.tenants.filter((t) => t.sharing === s && !t.is_custom_rent).length;
    if (!(await confirm({ title: `Apply the ${cap(s)} price to current tenants?`, message: `${n} tenant(s) without a custom rent will be billed the new price from their next invoice. Existing invoices and tenants with a custom rent are not changed.`, confirmLabel: "Apply" }))) return;
    await run(async () => { const c = unwrap(await sb().rpc("apply_pricing_to_active_stays", { p_sharing: s })); return c; }, "Updated current tenants' rent");
    q.reload();
  }
  const cols: Column<Hist>[] = [
    { key: "at", header: "When", render: (h) => fmtDateTime(h.at) },
    { key: "s", header: "Sharing", render: (h) => <Badge tone="indigo">{cap(h.new_data.sharing)}</Badge> },
    { key: "c", header: "Change", render: (h) => <span className="tabular-nums">{inr(h.old_data?.monthly_rent ?? 0)} → <b>{inr(h.new_data.monthly_rent)}</b></span> },
    { key: "u", header: "By", render: (h) => who(h.actor) },
  ];
  return (
    <>
      <PageHeader title="Rental Pricing" subtitle="Monthly rent per person (bed) for each sharing type" />
      <div className="grid md:grid-cols-3 gap-4">
        {prices.map((p) => {
          const dirty = edit[p.sharing] !== undefined && Number(edit[p.sharing]) !== Number(p.monthly_rent);
          const custom = q.data!.tenants.filter((t) => t.sharing === p.sharing && t.is_custom_rent).length;
          const count = q.data!.tenants.filter((t) => t.sharing === p.sharing).length;
          return (
            <div key={p.sharing} className="card p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-gray-900">{cap(p.sharing)} sharing</h2><Badge tone="indigo">{p.beds_per_room} bed{p.beds_per_room > 1 ? "s" : ""}/room</Badge></div>
              <p className="text-xs text-gray-400 mt-1">{COPY[p.sharing]}</p>
              <Field label="Rent per person / month (₹)" className="mt-4">
                <input type="number" min={0} disabled={!canEdit} className="input text-lg font-semibold" value={edit[p.sharing] ?? String(p.monthly_rent)} onChange={(e) => setEdit({ ...edit, [p.sharing]: e.target.value })} /></Field>
              <p className="text-xs text-gray-400 mt-3">{count} tenants · {custom} with custom rent</p>
              {canEdit && (
                <div className="flex gap-2 mt-4">
                  <AsyncButton busyLabel="Saving…" disabled={!dirty} onClick={async () => { if (await run(() => save(p.sharing), "Price updated")) q.reload(); }}>Save price</AsyncButton>
                  <button className="btn-secondary" onClick={() => apply(p.sharing)}>Apply to tenants</button>
                </div>)}
            </div>);
        })}
      </div>
      <div className="card p-5 mt-5 text-sm text-gray-600 space-y-1.5">
        <h2 className="section-title">How pricing works</h2>
        <p>• Rent is charged <b>per occupied bed</b>, never per room. Each tenant has their own rent, which you can set to a custom amount at check-in or later.</p>
        <p>• Changing a price here <b>never alters existing invoices or payments</b>. New tenants get the new price automatically; use “Apply to tenants” to move current tenants (those without a custom rent) to it from their next invoice.</p>
        <p>• Security deposits, electricity, food, laundry, maintenance, discounts and adjustments are set per tenant at check-in and on each invoice.</p>
      </div>
      {can(me.role, "viewAudit") && <div className="mt-6"><h2 className="section-title">Price change history</h2><DataTable rows={q.data.hist} columns={cols} rowKey={(h) => String(h.id)} pageSize={8} empty={<p className="text-center text-sm text-gray-400 py-8">No price changes yet.</p>} /></div>}
    </>
  );
}
