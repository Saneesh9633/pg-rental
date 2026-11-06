"use client";
import { useEffect, useMemo, useState } from "react";
import { cap, inr } from "@/lib/format";
import { useSignedUrl } from "@/lib/hooks";
import type { PaymentStatus } from "@/types";

const ICONS: Record<string, string> = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  bed: "M3 19V8m0 7h18m0 4v-6a3 3 0 00-3-3h-7v6M7 12.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  tag: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
  file: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  wallet: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  receipt: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
  chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  cog: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  plus: "M12 4v16m8-8H4",
  x: "M6 18L18 6M6 6l12 12",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  upload: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  printer: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z",
  check: "M5 13l4 4L19 7",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  pencil: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  down: "M19 9l-7 7-7-7",
  up: "M5 15l7-7 7 7",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  swap: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  door: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  arrow: "M7 17L17 7M9 7h8v8",
  alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
};
export function Icon({ name, className = "w-4 h-4" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONS[name] ?? ICONS.file} />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl sm:text-[28px] leading-tight font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TINTS = { white: "bg-white", mint: "bg-tint-mint", peach: "bg-tint-peach", lilac: "bg-tint-lilac", sky: "bg-tint-sky", butter: "bg-tint-butter", blush: "bg-tint-blush" } as const;
export type Tint = keyof typeof TINTS;
const TONE_TINT: Record<string, Tint> = { default: "white", good: "mint", warn: "butter", bad: "blush" };
const TONE_INK = { default: "text-gray-900", good: "text-emerald-800", warn: "text-amber-800", bad: "text-rose-700" };

/** KPI tile. `size="lg"` is the big pastel card with an arrow chip (dashboard hero row). */
export function Stat({ label, value, sub, tone = "default", icon, tint, size = "md", href }: {
  label: string; value: string | number; sub?: string; tone?: "default" | "good" | "warn" | "bad"; icon?: string; tint?: Tint; size?: "md" | "lg"; href?: string;
}) {
  const bg = TINTS[tint ?? TONE_TINT[tone]];
  const big = size === "lg";
  const body = (
    <div className={`${bg} rounded-3xl ${big ? "p-5 sm:p-6 min-h-[142px]" : "p-4 sm:p-5"} shadow-card h-full flex flex-col ${href ? "transition-transform hover:-translate-y-0.5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`${big ? "text-sm font-semibold text-gray-700" : "text-xs font-semibold text-gray-500"} leading-snug`}>{label}</p>
        {big ? (
          <span className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center text-gray-800 shrink-0"><Icon name={icon ?? "arrow"} className="w-4 h-4" /></span>
        ) : icon ? (
          <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Icon name={icon} className="w-4 h-4" /></span>
        ) : null}
      </div>
      <p className={`mt-auto pt-3 font-bold tabular-nums tracking-tight ${big ? "text-2xl sm:text-[28px]" : "text-xl sm:text-2xl"} ${TONE_INK[tone]}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 min-h-[1rem]">{sub ?? ""}</p>
    </div>
  );
  return href ? <a href={href} className="block h-full">{body}</a> : body;
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700",
  blue: "bg-sky-50 text-sky-700", gray: "bg-gray-100 text-gray-600", indigo: "bg-brand-50 text-brand-700",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}
const STATUS_TONE: Record<PaymentStatus, keyof typeof TONES> = { paid: "green", partial: "blue", pending: "amber", overdue: "red" };
export const StatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={STATUS_TONE[status]}><span className="w-1.5 h-1.5 rounded-full bg-current" />{cap(status === "partial" ? "partially paid" : status)}</Badge>
);
export const SharingBadge = ({ sharing }: { sharing: string | null }) => (sharing ? <Badge tone="indigo">{cap(sharing)}</Badge> : <>—</>);

export function Modal({ open, title, onClose, children, footer, size = "md" }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-[3px] sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-white w-full ${w} rounded-t-3xl sm:rounded-3xl shadow-lift max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-lg tracking-tight">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Close"><Icon name="x" className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50/60 rounded-b-3xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] font-semibold text-gray-700 mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-rose-600 mt-1">{error}</span>}
    </label>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400"><span className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />{label}</div>;
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-rose-700">{error}</p>
      {onRetry && <button className="btn-secondary mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="text-sm text-gray-400 mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mb-5 max-w-full overflow-x-auto pb-1">
      <div className="inline-flex gap-1 bg-white rounded-full p-1 shadow-card" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-full transition-colors ${value === t.id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Avatar({ name, path, size = 36 }: { name: string; path?: string | null; size?: number }) {
  const url = useSignedUrl("tenant-documents", path);
  const initials = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const style = { width: size, height: size, fontSize: size * 0.38 };
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={name} style={style} className="rounded-full object-cover shrink-0 bg-gray-100" />;
  return <span style={style} className="rounded-full bg-brand-100 text-brand-700 font-bold inline-flex items-center justify-center shrink-0">{initials}</span>;
}

export const Money = ({ v, className = "" }: { v: number | string; className?: string }) => <span className={`tabular-nums ${className}`}>{inr(v)}</span>;

// ---- DataTable: search + sort + pagination -----------------------------------
export interface Column<T> {
  key: string; header: string; render?: (row: T) => React.ReactNode; sort?: (row: T) => string | number | null;
  align?: "right" | "left"; className?: string; hideOnMobile?: boolean; wrap?: boolean; sticky?: boolean;
}
export function DataTable<T>({ rows, columns, rowKey, searchText, searchPlaceholder = "Search…", onRowClick, pageSize = 15, toolbar, empty, initialSort, footer, initialQuery = "" }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; searchText?: (r: T) => string; searchPlaceholder?: string;
  onRowClick?: (r: T) => void; pageSize?: number; toolbar?: React.ReactNode; empty?: React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" }; footer?: React.ReactNode; initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, rows.length]);

  const shown = useMemo(() => {
    let r = rows;
    if (q && searchText) { const n = q.toLowerCase(); r = r.filter((x) => searchText(x).toLowerCase().includes(n)); }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const f = col?.sort;
      if (f) r = [...r].sort((a, b) => {
        const x = f(a), y = f(b);
        if (x == null) return 1; if (y == null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
        return sort.dir === "asc" ? c : -c;
      });
    }
    return r;
  }, [rows, q, sort, columns, searchText]);

  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = shown.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="card overflow-hidden">
      {(searchText || toolbar) && (
        <div className="dt-toolbar flex flex-col lg:flex-row lg:items-center gap-3 p-4 sm:p-5">
          {searchText && (
            <div className="relative sm:w-72 shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Icon name="search" /></span>
              <input className="input pl-10 !rounded-full !bg-gray-50 !border-transparent" placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{toolbar}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-y border-gray-100 bg-gray-50/60">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`px-3 py-3 font-semibold text-[11px] uppercase tracking-wider whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.sticky ? "sticky right-0 bg-gray-50 shadow-[-10px_0_10px_-10px_rgba(20,27,24,0.15)]" : ""}`}>
                    {c.sort ? (
                      <button className="inline-flex items-center gap-1 hover:text-gray-900 uppercase tracking-wide"
                        onClick={() => setSort(active ? (sort!.dir === "asc" ? { key: c.key, dir: "desc" } : null) : { key: c.key, dir: "asc" })}>
                        {c.header}
                        <span className={`text-[10px] ${active ? "text-indigo-600" : "text-gray-300"}`}>{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {slice.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? "cursor-pointer hover:bg-brand-50/60 transition-colors" : "hover:bg-gray-50/60"}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-3.5 ${c.sticky ? "sticky right-0 bg-white shadow-[-10px_0_10px_-10px_rgba(20,27,24,0.15)]" : ""} ${c.wrap ? "" : "whitespace-nowrap"} ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}>
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer}
        </table>
      </div>
      {shown.length === 0 && (empty ?? <Empty title="Nothing to show" hint={q ? "Try a different search." : undefined} />)}
      {shown.length > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>{cur * pageSize + 1}–{Math.min(shown.length, (cur + 1) * pageSize)} of {shown.length}</span>
          <div className="flex gap-2">
            <button className="btn-secondary !py-1 !px-3" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
            <button className="btn-secondary !py-1 !px-3" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Button that shows a busy state while its async handler runs (prevents double submits). */
export function AsyncButton({ onClick, children, className = "btn-primary", disabled, busyLabel }: {
  onClick: () => Promise<unknown> | void; children: React.ReactNode; className?: string; disabled?: boolean; busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy || disabled} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>
      {busy ? (busyLabel ?? "Working…") : children}
    </button>
  );
}
