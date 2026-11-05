"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { ProfileProvider, UiProvider, sb } from "@/lib/hooks";
import { NAV, ROLE_LABEL } from "@/lib/roles";
import type { Profile } from "@/types";

export default function Shell({ profile, pgName, children }: { profile: Profile; pgName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
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

  const nav = (
    <>
      <div className="px-5 h-16 flex items-center gap-3 border-b border-gray-100">
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><Icon name="home" className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{pgName}</p>
          <p className="text-[11px] text-gray-400">PG Manager</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive(l.href) ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
            <Icon name={l.icon} className="w-[18px] h-[18px]" />{l.label}
          </Link>
        ))}
      </nav>
      <div className="px-3 pb-4 pt-3 border-t border-gray-100">
        <div className="px-3 mb-2">
          <p className="text-sm font-medium text-gray-800 truncate">{profile.full_name || profile.email}</p>
          <p className="text-xs text-gray-400">{ROLE_LABEL[profile.role]}</p>
        </div>
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 w-full"><Icon name="logout" />Sign out</button>
      </div>
    </>
  );

  return (
    <ProfileProvider value={profile}>
      <UiProvider>
        <div className="min-h-screen lg:flex">
          <aside className="hidden lg:flex w-64 bg-white border-r border-gray-100 flex-col shrink-0 sticky top-0 h-screen">{nav}</aside>

          {open && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              <div className="w-72 max-w-[85vw] bg-white flex flex-col shadow-xl">{nav}</div>
              <button className="flex-1 bg-gray-900/40" aria-label="Close menu" onClick={() => setOpen(false)} />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col">
            <header className="topbar h-14 lg:h-16 bg-white/80 backdrop-blur border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
              <button className="lg:hidden p-2 -ml-2 text-gray-600" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" className="w-6 h-6" /></button>
              <span className="lg:hidden font-semibold text-sm truncate mx-2">{pgName}</span>
              <div className="flex items-center gap-2 ml-auto">
                <Link href="/dashboard/notifications" className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={`Notifications, ${unread} unread`}>
                  <Icon name="bell" className="w-5 h-5" />
                  {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 99 ? "99+" : unread}</span>}
                </Link>
              </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
          </div>
        </div>
      </UiProvider>
    </ProfileProvider>
  );
}
