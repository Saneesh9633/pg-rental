"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import CheckInModal from "@/components/CheckInModal";
import { Avatar, Badge, DataTable, ErrorBox, Icon, PageHeader, SharingBadge, Spinner, type Column } from "@/components/ui";
import { fmtDate, inr } from "@/lib/format";
import { sb, unwrap, useProfile, useQuery } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { TenantRow } from "@/types";

function TenantsInner() {
  const me = useProfile();
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [status, setStatus] = useState(params.get("q") ? "" : "active"); const [sharing, setSharing] = useState("");

  useEffect(() => { const b = params.get("checkin"); if (b) { setPreset(b); setOpen(true); } }, [params]);
  const q = useQuery(async () => unwrap(await sb().from("v_tenant_current").select("*").order("full_name")) as unknown as TenantRow[], [open]);
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;

  const rows = q.data.filter((t) => (!status || t.status === status) && (!sharing || t.sharing === sharing));
  const cols: Column<TenantRow>[] = [
    { key: "name", header: "Tenant", sort: (t) => t.full_name, render: (t) => (
      <div className="flex items-center gap-3 min-w-[180px]"><Avatar name={t.full_name} path={t.photo_path} />
        <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{t.full_name}</p><p className="text-xs text-gray-400">{t.phone}</p></div></div>) },
    { key: "room", header: "Room / Bed", sort: (t) => t.room_no, render: (t) => (t.room_no ? `${t.room_no} / B${t.bed_no}` : "—") },
    { key: "sharing", header: "Sharing", hideOnMobile: true, sort: (t) => t.sharing, render: (t) => <SharingBadge sharing={t.sharing} /> },
    { key: "rent", header: "Monthly rent", align: "right", sort: (t) => Number(t.monthly_rent ?? 0), render: (t) => <>{inr(t.monthly_rent ?? 0)}{t.is_custom_rent && <span title="Custom rent" className="text-indigo-500"> *</span>}</> },
    { key: "dep", header: "Deposit held", align: "right", hideOnMobile: true, sort: (t) => Number(t.deposit_held), render: (t) => inr(t.deposit_held) },
    { key: "join", header: "Joined", hideOnMobile: true, sort: (t) => t.start_date, render: (t) => fmtDate(t.start_date) },
    { key: "status", header: "Status", sort: (t) => t.status, render: (t) => t.status === "active"
      ? <div className="flex gap-1">{<Badge tone="green">Active</Badge>}{t.planned_checkout && <Badge tone="amber">Leaving {fmtDate(t.planned_checkout)}</Badge>}</div>
      : <Badge tone="gray">Checked out {fmtDate(t.end_date)}</Badge> },
  ];
  return (
    <>
      <PageHeader title="Tenants" subtitle={`${q.data.filter((t) => t.status === "active").length} staying · ${q.data.filter((t) => t.status !== "active").length} past tenants`}
        actions={can(me.role, "checkInOut") && <button className="btn-primary" onClick={() => { setPreset(null); setOpen(true); }}><Icon name="plus" />Check in tenant</button>} />
      <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} searchText={(t) => `${t.full_name} ${t.phone} ${t.room_no ?? ""} ${t.email ?? ""}`} searchPlaceholder="Search name, phone, room…"
        onRowClick={(t) => router.push(`/dashboard/tenants/${t.id}`)} initialSort={{ key: "name", dir: "asc" }} initialQuery={params.get("q") ?? ""}
        toolbar={<>
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="active">Currently staying</option><option value="checked_out">Past tenants</option><option value="">All</option></select>
          <select className="input !w-auto" value={sharing} onChange={(e) => setSharing(e.target.value)} aria-label="Sharing"><option value="">All sharing types</option><option value="single">Single</option><option value="double">Double</option><option value="triple">Triple</option></select>
        </>} />
      <p className="text-xs text-gray-400 mt-2"><span className="text-indigo-500">*</span> custom rent, different from the list price. Past tenants are never deleted — their full history stays available.</p>
      <CheckInModal open={open} presetBed={preset} onClose={() => { setOpen(false); if (params.get("checkin")) router.replace("/dashboard/tenants"); }} />
      <Link href="/dashboard/rooms" className="sr-only">Rooms</Link>
    </>
  );
}
export default function TenantsPage() { return <Suspense fallback={<Spinner />}><TenantsInner /></Suspense>; }
