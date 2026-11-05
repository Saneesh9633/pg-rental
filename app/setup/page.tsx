import { redirect } from "next/navigation";
import { envProblems } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function SetupPage({ searchParams }: { searchParams: { e?: string } }) {
  const problems = envProblems();
  const detail = (searchParams.e ?? "").slice(0, 300);
  if (problems.length === 0 && !detail) redirect("/login");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-lg p-8">
        <h1 className="text-lg font-semibold text-gray-900">Almost there — connect your database</h1>
        {problems.length > 0 ? (
          <>
            <p className="text-sm text-gray-600 mt-2">These environment variables need attention:</p>
            <ul className="mt-3 space-y-2">{problems.map((p) => <li key={p.name} className="text-sm"><code className="bg-gray-100 rounded px-2 py-0.5">{p.name}</code> <span className="text-rose-700">{p.issue}</span></li>)}</ul>
          </>
        ) : (
          <p className="text-sm text-gray-600 mt-2">The app could not talk to Supabase:</p>
        )}
        {detail && <p className="mt-3 text-sm rounded-lg bg-rose-50 text-rose-800 p-3 break-words">{detail}</p>}
        <ol className="list-decimal ml-5 mt-5 text-sm text-gray-600 space-y-2">
          <li>Vercel → <b>Settings → Environment Variables</b>: set <code>NEXT_PUBLIC_SUPABASE_URL</code> (https://&lt;ref&gt;.supabase.co) and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for <b>Production and Preview</b>. Also add <code>SUPABASE_SERVICE_ROLE_KEY</code> and <code>CRON_SECRET</code>.</li>
          <li><b>Redeploy</b> (untick &ldquo;use existing build cache&rdquo;). <code>NEXT_PUBLIC_*</code> values are baked in at build time.</li>
          <li>Apply the database schema: <code>npx supabase db push</code>.</li>
          <li>Open <a className="text-indigo-600 underline" href="/api/health">/api/health</a> for a step-by-step check.</li>
        </ol>
      </div>
    </div>
  );
}
