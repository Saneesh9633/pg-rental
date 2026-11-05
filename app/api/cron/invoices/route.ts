import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Automatic monthly billing + reminders. Call daily (vercel.json does this; any scheduler works):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/invoices
 * Idempotent: invoices that already exist are skipped, notifications are de-duplicated.
 * Optional: set NOTIFY_WEBHOOK_URL to forward new reminders (e.g. to a WhatsApp/SMS gateway).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 }); }
  const ist = new Date(Date.now() + 5.5 * 3600e3).toISOString();
  const period = `${ist.slice(0, 7)}-01`;
  const gen = await admin.rpc("generate_monthly_invoices", { p_period: period });
  if (gen.error) return NextResponse.json({ error: gen.error.message }, { status: 500 });
  const notif = await admin.rpc("refresh_notifications");
  if (notif.error) return NextResponse.json({ error: notif.error.message }, { status: 500 });

  let forwarded = 0;
  const hook = process.env.NOTIFY_WEBHOOK_URL;
  if (hook) {
    const since = new Date(Date.now() - 25 * 3600e3).toISOString();
    const { data } = await admin.from("notifications").select("kind,title,body,created_at,tenant:tenants(full_name,phone)").in("kind", ["due_reminder", "overdue", "checkout_reminder"]).gte("created_at", since);
    if (data?.length) {
      const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notifications: data }) }).catch(() => null);
      if (r?.ok) forwarded = data.length;
    }
  }
  return NextResponse.json({ period, invoices_created: gen.data, notifications_created: notif.data, forwarded });
}
