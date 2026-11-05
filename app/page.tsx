import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
