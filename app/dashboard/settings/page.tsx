"use client";
import { useEffect, useState } from "react";
import { AsyncButton, ErrorBox, Field, PageHeader, Spinner } from "@/components/ui";
import { sb, unwrap, useAction, useProfile, useQuery } from "@/lib/hooks";
import type { Settings } from "@/types";

export default function SettingsPage() {
  const me = useProfile(); const run = useAction();
  const q = useQuery(async () => unwrap(await sb().from("settings").select("*").eq("id", 1).single()) as unknown as Settings, []);
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  if (me.role !== "super_admin") return <ErrorBox error="Only the Super Admin can change settings." />;
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !f) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const txt = (k: keyof Settings) => ({ className: "input", value: String(f[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });
  const num = (k: keyof Settings, min: number, max: number) => ({ type: "number" as const, min, max, className: "input", value: String(f[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) }) });

  async function save() {
    if (!f!.pg_name.trim()) throw new Error("Enter the PG name.");
    unwrap(await sb().from("settings").update({ pg_name: f!.pg_name.trim(), address: f!.address, phone: f!.phone, email: f!.email, due_day: f!.due_day, reminder_days_before: f!.reminder_days_before, checkout_notice_days: f!.checkout_notice_days, default_deposit_months: f!.default_deposit_months, upi_id: f!.upi_id, receipt_footer: f!.receipt_footer }).eq("id", 1));
  }
  return (
    <>
      <PageHeader title="Settings" subtitle="Your PG's details and billing rules" actions={<AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(save, "Settings saved")) window.location.reload(); }}>Save settings</AsyncButton>} />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5 space-y-4"><h2 className="section-title !mb-0">PG details <span className="font-normal text-gray-400">(shown on invoices &amp; receipts)</span></h2>
          <Field label="PG name"><input {...txt("pg_name")} /></Field>
          <Field label="Address"><textarea rows={2} {...txt("address")} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input {...txt("phone")} /></Field><Field label="Email"><input type="email" {...txt("email")} /></Field></div>
          <Field label="UPI ID" hint="Printed on invoices that have a balance"><input {...txt("upi_id")} placeholder="yourpg@upi" /></Field>
          <Field label="Receipt footer message"><input {...txt("receipt_footer")} /></Field></div>
        <div className="card p-5 space-y-4"><h2 className="section-title !mb-0">Billing &amp; reminders</h2>
          <Field label="Rent due day of the month" hint="Invoices are due on this day (1–28)"><input {...num("due_day", 1, 28)} /></Field>
          <Field label="Remind before due date (days)" hint="A reminder appears this many days before an invoice is due"><input {...num("reminder_days_before", 0, 15)} /></Field>
          <Field label="Check-out reminder window (days)" hint="Reminder for tenants with a planned check-out"><input {...num("checkout_notice_days", 0, 60)} /></Field>
          <Field label="Default security deposit (months of rent)" hint="Pre-filled at check-in; you can change it per tenant"><input {...num("default_deposit_months", 0, 12)} /></Field></div>
      </div>
    </>
  );
}
