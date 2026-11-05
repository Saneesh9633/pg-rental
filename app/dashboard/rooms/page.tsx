"use client";
import Link from "next/link";
import { useState } from "react";
import { AsyncButton, Badge, DataTable, ErrorBox, Field, Icon, Modal, PageHeader, SharingBadge, Spinner, type Column } from "@/components/ui";
import { cap, inr } from "@/lib/format";
import { sb, unwrap, useAction, useProfile, useQuery, useUi } from "@/lib/hooks";
import { can } from "@/lib/roles";
import type { BedRow, Pricing, RoomRow, Sharing } from "@/types";

const STATUS: Record<RoomRow["display_status"], { label: string; tone: "green" | "amber" | "gray" }> = {
  available: { label: "Available", tone: "green" }, fully_occupied: { label: "Fully occupied", tone: "amber" }, maintenance: { label: "Maintenance", tone: "gray" },
};
type Form = { id?: string; room_no: string; sharing: Sharing; total_beds: number; rent_per_bed: string; status: "available" | "maintenance"; notes: string };

export default function RoomsPage() {
  const me = useProfile();
  const canEdit = can(me.role, "manageRooms");
  const { confirm } = useUi();
  const run = useAction();
  const [sharingF, setSharingF] = useState(""); const [statusF, setStatusF] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [detail, setDetail] = useState<RoomRow | null>(null);

  const q = useQuery(async () => {
    const c = sb();
    const [r, p, b] = await Promise.all([c.from("v_room_overview").select("*").order("room_no"), c.from("pricing").select("*"), c.from("v_bed_status").select("*").order("bed_no")]);
    return { rooms: unwrap(r) as unknown as RoomRow[], pricing: unwrap(p) as unknown as Pricing[], beds: unwrap(b) as unknown as BedRow[] };
  });
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;
  const { rooms, pricing, beds } = q.data;
  const price = (s: Sharing) => pricing.find((p) => p.sharing === s);

  const rows = rooms.filter((r) => (!sharingF || r.sharing === sharingF) && (!statusF || r.display_status === statusF));
  const tot = rooms.reduce((a, r) => ({ beds: a.beds + r.total_beds, occ: a.occ + Number(r.occupied) }), { beds: 0, occ: 0 });

  const newRoom = () => setForm({ room_no: "", sharing: "double", total_beds: price("double")?.beds_per_room ?? 2, rent_per_bed: "", status: "available", notes: "" });
  const editRoom = (r: RoomRow) => setForm({ id: r.room_id, room_no: r.room_no, sharing: r.sharing, total_beds: r.total_beds, rent_per_bed: r.custom_rent_per_bed != null ? String(r.custom_rent_per_bed) : "", status: r.status, notes: r.notes });

  async function save() {
    if (!form) return;
    if (!form.room_no.trim()) throw new Error("Enter a room number.");
    const row = { room_no: form.room_no.trim(), sharing: form.sharing, total_beds: Number(form.total_beds), rent_per_bed: form.rent_per_bed === "" ? null : Number(form.rent_per_bed), status: form.status, notes: form.notes };
    if (!(row.total_beds >= 1 && row.total_beds <= 10)) throw new Error("Beds must be between 1 and 10.");
    if (row.rent_per_bed != null && !(row.rent_per_bed >= 0)) throw new Error("Rent can't be negative.");
    unwrap(form.id ? await sb().from("rooms").update(row).eq("id", form.id) : await sb().from("rooms").insert(row));
  }
  async function remove(r: RoomRow) {
    if (!(await confirm({ title: `Delete room ${r.room_no}?`, message: "Only rooms that never had a tenant can be deleted. Otherwise mark it as under maintenance.", confirmLabel: "Delete", danger: true }))) return;
    if (await run(async () => unwrap(await sb().from("rooms").delete().eq("id", r.room_id)), "Room deleted")) q.reload();
  }

  const cols: Column<RoomRow>[] = [
    { key: "room_no", header: "Room", sort: (r) => r.room_no, render: (r) => <button className="font-semibold text-indigo-700 hover:underline" onClick={() => setDetail(r)}>{r.room_no}</button> },
    { key: "sharing", header: "Sharing", sort: (r) => r.sharing, render: (r) => <SharingBadge sharing={r.sharing} /> },
    { key: "beds", header: "Total beds", align: "right", sort: (r) => r.total_beds, render: (r) => r.total_beds },
    { key: "occ", header: "Occupied", align: "right", sort: (r) => Number(r.occupied), render: (r) => r.occupied },
    { key: "avail", header: "Available", align: "right", sort: (r) => Number(r.available), render: (r) => <span className={Number(r.available) > 0 && r.status === "available" ? "font-semibold text-emerald-700" : ""}>{r.status === "maintenance" ? 0 : r.available}</span> },
    { key: "rent", header: "Rent / bed", align: "right", sort: (r) => Number(r.rent_per_bed), render: (r) => <span title={r.custom_rent_per_bed != null ? "Custom room rate" : "From pricing"}>{inr(r.rent_per_bed)}{r.custom_rent_per_bed != null && <sup className="text-indigo-500"> *</sup>}</span> },
    { key: "status", header: "Status", sort: (r) => r.display_status, render: (r) => <Badge tone={STATUS[r.display_status].tone}>{STATUS[r.display_status].label}</Badge> },
    { key: "occupants", header: "Occupants", hideOnMobile: true, render: (r) => r.occupants.length ? <div className="flex flex-wrap gap-1">{r.occupants.map((o) => <Link key={o.tenant_id} href={`/dashboard/tenants/${o.tenant_id}`} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-700">{o.name}</Link>)}</div> : <span className="text-gray-300">—</span> },
    ...(canEdit ? [{ key: "act", header: "", align: "right" as const, render: (r: RoomRow) => (
      <div className="flex justify-end gap-1">
        <button className="btn-ghost" onClick={() => editRoom(r)} aria-label={`Edit room ${r.room_no}`}><Icon name="pencil" /></button>
        <button className="btn-ghost hover:!text-rose-600" onClick={() => remove(r)} aria-label={`Delete room ${r.room_no}`}><Icon name="trash" /></button>
      </div>) }] : []),
  ];

  const detailBeds = detail ? beds.filter((b) => b.room_id === detail.room_id) : [];
  return (
    <>
      <PageHeader title="Rooms & Beds" subtitle={`${rooms.length} rooms · ${tot.occ} of ${tot.beds} beds occupied`}
        actions={canEdit && <button className="btn-primary" onClick={newRoom}><Icon name="plus" />Add room</button>} />
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.room_id} searchText={(r) => `${r.room_no} ${r.sharing} ${r.occupants.map((o) => o.name).join(" ")}`} searchPlaceholder="Search room or tenant…" pageSize={20}
        toolbar={<>
          <select className="input !w-auto" value={sharingF} onChange={(e) => setSharingF(e.target.value)} aria-label="Sharing type"><option value="">All sharing types</option><option value="single">Single</option><option value="double">Double</option><option value="triple">Triple</option></select>
          <select className="input !w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="available">Available</option><option value="fully_occupied">Fully occupied</option><option value="maintenance">Maintenance</option></select>
        </>} />
      <p className="text-xs text-gray-400 mt-2"><sup className="text-indigo-500">*</sup> room has its own rate; otherwise the rate from Rental Pricing applies. “Fully occupied” is set automatically when every bed has a tenant.</p>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit room ${form.room_no}` : "Add room"}
        footer={<><button className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(save, "Room saved")) { setForm(null); q.reload(); } }}>Save</AsyncButton></>}>
        {form && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Room number"><input className="input" value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} placeholder="e.g. 105" autoFocus /></Field>
            <Field label="Sharing type">
              <select className="input" value={form.sharing} onChange={(e) => { const s = e.target.value as Sharing; setForm({ ...form, sharing: s, total_beds: price(s)?.beds_per_room ?? form.total_beds }); }}>
                <option value="single">Single (1 person)</option><option value="double">Double (2 people)</option><option value="triple">Triple (3 people)</option>
              </select></Field>
            <Field label="Number of beds" hint="Changing this adds or removes empty beds."><input type="number" min={1} max={10} className="input" value={form.total_beds} onChange={(e) => setForm({ ...form, total_beds: Number(e.target.value) })} /></Field>
            <Field label="Rent per bed (₹/month)" hint={`Leave empty to use ${inr(price(form.sharing)?.monthly_rent ?? 0)} from pricing`}><input type="number" min={0} className="input" value={form.rent_per_bed} onChange={(e) => setForm({ ...form, rent_per_bed: e.target.value })} placeholder="Use standard price" /></Field>
            <Field label="Room status"><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}><option value="available">Available</option><option value="maintenance">Under maintenance</option></select></Field>
            <Field label="Notes"><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Floor, AC, attached bath…" /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Room ${detail.room_no} — ${cap(detail.sharing)} sharing` : ""} size="sm">
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center gap-2"><Badge tone={STATUS[detail.display_status].tone}>{STATUS[detail.display_status].label}</Badge><span className="text-sm text-gray-500">{inr(detail.rent_per_bed)} / bed / month</span></div>
            {detail.notes && <p className="text-sm text-gray-500">{detail.notes}</p>}
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {detailBeds.map((b) => (
                <li key={b.bed_id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold ${b.tenant_id ? "bg-indigo-100 text-indigo-700" : "bg-emerald-50 text-emerald-700"}`}>B{b.bed_no}</span>
                  {b.tenant_id ? <Link href={`/dashboard/tenants/${b.tenant_id}`} className="text-sm font-medium hover:underline">{b.tenant_name}</Link> : <span className="text-sm text-gray-400">Vacant</span>}
                  {!b.tenant_id && detail.status === "available" && can(me.role, "checkInOut") && <Link href={`/dashboard/tenants?checkin=${b.bed_id}`} className="ml-auto text-xs text-indigo-600 hover:underline">Check in →</Link>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
}
