/** Problems with the required public env vars. Literal accesses so Next inlines them like the Supabase clients do. */
export function envProblems(): { name: string; issue: string }[] {
  const out: { name: string; issue: string }[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) out.push({ name: "NEXT_PUBLIC_SUPABASE_URL", issue: "missing" });
  else {
    let ok = false;
    try { const u = new URL(url.trim()); ok = u.protocol === "https:" || u.protocol === "http:"; } catch { /* invalid */ }
    if (!ok) out.push({ name: "NEXT_PUBLIC_SUPABASE_URL", issue: "is not a valid URL — it must look like https://<project-ref>.supabase.co" });
    else if (/localhost|127\.0\.0\.1/.test(url) && process.env.VERCEL) out.push({ name: "NEXT_PUBLIC_SUPABASE_URL", issue: "points to localhost, which Vercel cannot reach — use your hosted Supabase URL" });
  }
  if (!key) out.push({ name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", issue: "missing" });
  return out;
}
export const missingEnv = () => envProblems().map((p) => p.name);
