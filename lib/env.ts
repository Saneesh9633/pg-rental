/** Names of required public env vars that are missing. Literal accesses so Next inlines them like the Supabase clients do. */
export function missingEnv(): string[] {
  const m: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) m.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) m.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return m;
}
