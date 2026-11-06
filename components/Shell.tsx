"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { ProfileProvider, UiProvider, sb } from "@/lib/hooks";
import { NAV, ROLE_LABEL, type NavGroup } from "@/lib/roles";
import type { Profile } from "@/types";

const GROUPS: NavGroup[] = ["Main menu", "Manage", "Account"];
const initials = (n: string) => n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function Shell({ profile, pgName, children }: { profile: Profile; pgName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");
  const links = NAV.filter((n) => n.roles.includes(profile.role));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    let live = true;
    const load = () => sb().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
      .then(({ count }) => live && setUnread(count ?? 0));
    load();
    const t = setInterval(load, 60000);
    return () => { live = false; clearInterval(t); };
  }, [pathname]);

  async function logout() {
    await sb().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));
  const search = (e: React.FormEvent) => { e.preventDefault(); const v = q.trim(); router.push(v ? `/dashboard/tenants?q=${encodeURIComponent(v)}` : "/dashboard/tenants"); setQ(""); };

  const nav = (
    <>
      <div className="px-6 pt-7 pb-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-[0_8px_18px_-8px_rgba(22,122,102,0.8)]"><Icon name="home" className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="font-bold text-[15px] text-gray-900 truncate leading-tight">{pgName}</p>
          <p className="text-[11px] text-gray-400 font-medium">PG Manager</p>
        </div>
      </div>
      <nav className="flex-1 px-4 pb-4 overflow-y-auto" aria-label="Main">
        {GROUPS.map((g) => {
          const items = links.filter((l) => l.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="mb-5">
              <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{g}</p>
              <div className="space-y-1">
                {items.map((l) => (
                  <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm transition-all ${isActive(l.href)
                      ? "bg-brand-600 text-white font-semibold shadow-[0_10px_20px_-10px_rgba(22,122,102,0.9)]"
                      : "text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900"}`}>
                    <Icon name={l.icon} className="w-[18px] h-[18px]" />{l.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="p-4">
        <div className="rounded-2xl bg-gray-50 p-3 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center shrink-0">{initials(profile.full_name || profile.email || "")}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{profile.full_name || profile.email}</p>
            <p className="text-xs text-gray-500">{ROLE_LABEL[profile.role]}</p>
          </div>
          <button onClick={logout} className="p-2 rounded-full text-gray-500 hover:bg-white hover:text-gray-900" aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </div>
    </>
  );

  return (
    <ProfileProvider value={profile}>
      <UiProvider>
        <div className="min-h-screen lg:flex lg:gap-4 lg:p-4">
          <aside className="hidden lg:flex w-[268px] bg-white rounded-4xl shadow-card flex-col shrink-0 sticky top-4 h-[calc(100vh-2rem)]">{nav}</aside>

          {open && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              <div className="w-[300px] max-w-[86vw] bg-white flex flex-col shadow-lift rounded-r-4xl">{nav}</div>
              <button className="flex-1 bg-gray-900/40 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col px-4 pb-8 pt-3 sm:px-6 lg:px-2 lg:pt-1">
            <header className="topbar flex items-center gap-3 mb-6 sm:mb-8">
              <button className="lg:hidden w-11 h-11 rounded-full bg-white shadow-card flex items-center justify-center text-gray-700 shrink-0" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" className="w-5 h-5" /></button>
              <form onSubmit={search} className="relative flex-1 max-w-xl" role="search">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Icon name="search" /></span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tenants…" aria-label="Search tenants"
                  className="w-full h-11 rounded-full bg-white shadow-card pl-11 pr-4 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </form>
              <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
                <Link href="/dashboard/notifications" className="relative w-11 h-11 rounded-full bg-white shadow-card flex items-center justify-center text-gray-600 hover:text-gray-900" aria-label={`Notifications, ${unread} unread`}>
                  <Icon name="bell" className="w-5 h-5" />
                  {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-canvas">{unread > 99 ? "99+" : unread}</span>}
                </Link>
                <div className="hidden sm:flex items-center gap-2.5 h-11 pl-1.5 pr-4 rounded-full bg-white shadow-card">
                  <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center">{initials(profile.full_name || profile.email || "")}</span>
                  <span className="text-sm font-semibold text-gray-800 max-w-[120px] truncate">{(profile.full_name || profile.email || "").split(" ")[0]}</span>
                </div>
              </div>
            </header>
            <main className="flex-1 w-full max-w-[1400px] mx-auto">{children}</main>
          </div>
        </div>
      </UiProvider>
    </ProfileProvider>
  );
}
