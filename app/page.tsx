import { redirect } from "next/navigation";
import { missingEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (missingEnv().length) redirect("/setup");
  let signedIn = false;
  let failure = "";
  try {
    const { data: { user } } = await createServerSupabaseClient().auth.getUser();
    signedIn = !!user;
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  if (failure) redirect(`/setup?e=${encodeURIComponent(failure.slice(0, 300))}`);   // redirect() throws, so it stays outside the try
  redirect(signedIn ? "/dashboard" : "/login");
}
