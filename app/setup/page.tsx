import { redirect } from "next/navigation";
import { missingEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = missingEnv();
  if (missing.length === 0) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-lg p-8">
        <h1 className="text-lg font-semibold text-gray-900">Almost there — connect your database</h1>
        <p className="text-sm text-gray-600 mt-2">This deployment is missing required environment variables, so the app can&apos;t reach Supabase yet:</p>
        <ul className="mt-3 space-y-1">{missing.map((m) => <li key={m}><code className="text-sm bg-gray-100 rounded px-2 py-0.5">{m}</code></li>)}</ul>
        <ol className="list-decimal ml-5 mt-5 text-sm text-gray-600 space-y-2">
          <li>In Vercel: <b>Project → Settings → Environment Variables</b>. Add the variables above (Supabase → Project Settings → API), enabled for <b>Production and Preview</b>. Also add <code>SUPABASE_SERVICE_ROLE_KEY</code> and <code>CRON_SECRET</code>.</li>
          <li>The URL must be your hosted Supabase project (<code>https://&lt;ref&gt;.supabase.co</code>), not <code>localhost</code>.</li>
          <li><b>Redeploy.</b> <code>NEXT_PUBLIC_*</code> values are baked in at build time, so existing deployments don&apos;t pick up new variables.</li>
          <li>Make sure the database schema is applied (<code>supabase db push</code>).</li>
        </ol>
      </div>
    </div>
  );
}
