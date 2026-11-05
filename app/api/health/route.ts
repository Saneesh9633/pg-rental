import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { envProblems } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Setup check — safe to expose: reports only whether things are set, never their values. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const out: Record<string, unknown> = {
    env: { NEXT_PUBLIC_SUPABASE_URL: !!url, NEXT_PUBLIC_SUPABASE_ANON_KEY: !!anon, SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET: !!process.env.CRON_SECRET },
    problems: envProblems(),
  };
  try {
    if (url && anon && envProblems().length === 0) {
      out.supabaseHost = new URL(url.trim()).host;
      const r = await fetch(`${url.trim().replace(/\/$/, "")}/auth/v1/health`, { headers: { apikey: anon.trim() }, signal: AbortSignal.timeout(6000) });
      out.authReachable = r.ok ? "ok" : `HTTP ${r.status}${r.status === 401 ? " — the anon key looks wrong" : ""}`;
      const { error } = await createClient(url.trim(), anon.trim(), { auth: { persistSession: false } }).from("settings").select("id").limit(1);
      // "permission denied" (42501) is what anonymous visitors should get on an existing table, so it proves the schema is there
      out.schema = !error || error.code === "42501" ? "applied" : /PGRST205|42P01|schema cache|does not exist/i.test(`${error.code} ${error.message}`) ? "NOT applied — run `npx supabase db push`" : `error: ${error.message}`;
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  out.ok = envProblems().length === 0 && out.authReachable === "ok" && out.schema === "applied";
  return NextResponse.json(out, { status: out.ok ? 200 : 503 });
}
