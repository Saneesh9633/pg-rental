"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { missingEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase-client";

const POINTS = [
  ["Every bed, every tenant", "See who is staying where, and which beds are free, at a glance."],
  ["Bills that run themselves", "Monthly invoices, part payments and PDF receipts in a few clicks."],
  ["Know your numbers", "Collections, dues, expenses and profit, always up to date."],
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (missingEnv().length) { setError("This deployment isn't connected to a database yet. Open /setup for instructions."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(/fetch|network|failed/i.test(error.message) ? "Could not reach the server. Check your internet connection and try again." : "Invalid email or password.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-canvas lg:p-4 lg:flex lg:gap-4">
      <aside className="hidden lg:flex flex-1 max-w-[560px] relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white p-12 flex-col justify-between">
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -left-16 bottom-24 w-56 h-56 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </span>
          <span className="font-bold text-lg tracking-tight">PG Manager</span>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold leading-[1.15] tracking-tight">Run your PG with<br />clarity and calm.</h2>
          <ul className="mt-10 space-y-6">
            {POINTS.map(([t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="mt-1 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-xs">✓</span>
                <div><p className="font-semibold">{t}</p><p className="text-sm text-white/70 mt-0.5">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Rooms · Tenants · Billing · Payments · Reports</p>
      </aside>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <span className="w-11 h-11 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-[0_8px_18px_-8px_rgba(22,122,102,0.8)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </span>
            <span className="font-bold text-lg tracking-tight">PG Manager</span>
          </div>
          <div className="card p-7 sm:p-9">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-500 mt-1.5">Sign in to your dashboard</p>

            <form onSubmit={handleLogin} className="space-y-4 mt-7">
              <div>
                <label htmlFor="email" className="block text-[13px] font-semibold text-gray-700 mb-1.5">Email</label>
                <input id="email" autoComplete="email" type="email" className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="password" className="block text-[13px] font-semibold text-gray-700 mb-1.5">Password</label>
                <input id="password" autoComplete="current-password" type="password" className="input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 px-3.5 py-2.5 rounded-xl">{error}</p>}
              <button type="submit" className="btn-primary w-full !py-3" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
            </form>
          </div>
          <p className="text-xs text-gray-400 text-center mt-6">Accounts are created by the owner under Users &amp; Roles.</p>
        </div>
      </main>
    </div>
  );
}
