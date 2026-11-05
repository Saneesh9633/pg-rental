import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { missingEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Profile } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (missingEnv().length) redirect("/setup");
  const supabase = createServerSupabaseClient();
  let user: { id: string } | null = null;
  let failure = "";
  try {
    user = (await supabase.auth.getUser()).data.user;
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  if (failure) redirect(`/setup?e=${encodeURIComponent(failure.slice(0, 300))}`);
  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  if (profileError && /PGRST205|42P01|schema cache|does not exist/i.test(`${profileError.code} ${profileError.message}`)) {
    redirect(`/setup?e=${encodeURIComponent("The database schema has not been applied yet. Run: npx supabase db push")}`);
  }
  if (!profile || !profile.active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">Account awaiting activation</h1>
          <p className="text-sm text-gray-500 mt-2">Your login works, but the owner hasn’t activated your account yet. Please ask them to enable it under Users &amp; Roles.</p>
          <form action="/auth/signout" method="post" className="mt-5"><button className="btn-secondary">Sign out</button></form>
        </div>
      </div>
    );
  }
  const { data: settings } = await supabase.from("settings").select("pg_name").eq("id", 1).single();
  return <Shell profile={profile as Profile} pgName={settings?.pg_name ?? "My PG"}>{children}</Shell>;
}
