import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/** Only an active Super Admin may create users or reset passwords. Role/active changes go straight to `profiles` (RLS-protected). */
async function requireSuperAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  return p?.active && p.role === "super_admin" ? user : null;
}

const createSchema = z.object({
  email: z.string().email(), full_name: z.string().trim().min(2).max(80),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["super_admin", "manager", "accountant"]),
});

export async function POST(req: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { email, password, full_name, role } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? "Could not create user" }, { status: 400 });
  const { error: pe } = await admin.from("profiles").update({ role, active: true, full_name }).eq("id", data.user.id);
  if (pe) { await admin.auth.admin.deleteUser(data.user.id); return NextResponse.json({ error: pe.message }, { status: 500 }); }
  return NextResponse.json({ id: data.user.id });
}

const resetSchema = z.object({ id: z.string().uuid(), password: z.string().min(8, "Password must be at least 8 characters").max(72) });
export async function PATCH(req: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const parsed = resetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { error } = await createAdminClient().auth.admin.updateUserById(parsed.data.id, { password: parsed.data.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
