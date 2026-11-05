"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Empty, ErrorBox, Icon, PageHeader, Spinner } from "@/components/ui";
import { fmtDateTime, waLink } from "@/lib/format";
import { sb, unwrap, useAction, useQuery } from "@/lib/hooks";

interface N { id: string; kind: string; title: string; body: string; tenant_id: string | null; invoice_id: string | null; read_at: string | null; created_at: string; tenant: { phone: string; full_name: string } | null }
const KIND: Record<string, { label: string; tone: "amber" | "red" | "green" | "blue" }> = { due_reminder: { label: "Due soon", tone: "amber" }, overdue: { label: "Overdue", tone: "red" }, payment_received: { label: "Payment", tone: "green" }, checkout_reminder: { label: "Check-out", tone: "blue" } };

export default function NotificationsPage() {
  const run = useAction(); const [only, setOnly] = useState(false);
  const q = useQuery(async () => {
    await sb().rpc("refresh_notifications");               // cheap + de-duplicated; keeps reminders current
    return unwrap(await sb().from("notifications").select("*, tenant:tenants(phone,full_name)").order("created_at", { ascending: false }).limit(150)) as unknown as N[];
  }, []);
  const first = useRef(true); useEffect(() => { first.current = false; }, []);
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const rows = q.data.filter((n) => !only || !n.read_at);
  const unread = q.data.filter((n) => !n.read_at).length;
  const mark = (ids: string[]) => run(async () => { unwrap(await sb().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids)); }).then(() => q.reload());

  return (
    <>
      <PageHeader title="Notifications" subtitle={`${unread} unread — rent reminders, overdue alerts, payment confirmations, check-outs`}
        actions={<><label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />Unread only</label>
          <button className="btn-secondary" disabled={!unread} onClick={() => mark(q.data!.filter((n) => !n.read_at).map((n) => n.id))}><Icon name="check" />Mark all read</button></>} />
      <div className="card divide-y divide-gray-100">
        {rows.length === 0 && <Empty title="You're all caught up" hint="New reminders appear here automatically." />}
        {rows.map((n) => (
          <div key={n.id} className={`flex flex-wrap items-start gap-3 px-4 py-3.5 ${n.read_at ? "" : "bg-indigo-50/40"}`}>
            <Badge tone={KIND[n.kind]?.tone ?? "blue"}>{KIND[n.kind]?.label ?? n.kind}</Badge>
            <div className="flex-1 min-w-[200px]"><p className={`text-sm ${n.read_at ? "text-gray-700" : "font-semibold text-gray-900"}`}>{n.title}</p><p className="text-xs text-gray-500">{n.body}</p><p className="text-[11px] text-gray-400 mt-0.5">{fmtDateTime(n.created_at)}</p></div>
            <div className="flex items-center gap-1">
              {n.tenant && ["due_reminder", "overdue"].includes(n.kind) && <a className="btn-ghost" target="_blank" rel="noreferrer" href={waLink(n.tenant.phone, `Hello ${n.tenant.full_name}, ${n.title.split(" — ")[1] ?? "a payment is pending"}. ${n.body}. Please pay at the earliest. Thank you!`)}><Icon name="chat" />WhatsApp</a>}
              {n.invoice_id && <Link href={`/dashboard/billing/${n.invoice_id}`} className="btn-ghost">Invoice</Link>}
              {!n.read_at && <button className="btn-ghost" onClick={() => mark([n.id])}>Mark read</button>}
            </div>
          </div>))}
      </div>
      <p className="text-xs text-gray-400 mt-3">WhatsApp buttons open a ready-to-send message in WhatsApp. To send reminders automatically, set <code>NOTIFY_WEBHOOK_URL</code> (see README).</p>
    </>
  );
}
