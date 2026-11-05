// Creates the three demo logins (one per role). Run after `supabase db reset`.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-users.mjs
// DEMO ONLY — change or delete these users before going live.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@12345";
const users = [
  { email: "admin@sunrise-pg.example", full_name: "Suresh (Owner)", role: "super_admin" },
  { email: "manager@sunrise-pg.example", full_name: "Meena (Manager)", role: "manager" },
  { email: "accounts@sunrise-pg.example", full_name: "Anand (Accountant)", role: "accountant" },
];

for (const u of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.full_name },
  });
  let id = data?.user?.id;
  if (error) {
    if (!/already|registered/i.test(error.message)) throw error;
    const list = await admin.auth.admin.listUsers({ perPage: 200 });
    id = list.data.users.find((x) => x.email === u.email)?.id;
  }
  const { error: pe } = await admin.from("profiles").update({ role: u.role, active: true, full_name: u.full_name }).eq("id", id);
  if (pe) throw pe;
  console.log(`✔ ${u.role.padEnd(12)} ${u.email}`);
}
console.log(`Password for all demo users: ${PASSWORD}`);
