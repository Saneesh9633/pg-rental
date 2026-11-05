import { redirect } from "next/navigation";
import { missingEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (missingEnv().length) redirect("/setup");
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
