"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AsyncButton, Field, Modal } from "@/components/ui";
import { cap, inr, todayISO } from "@/lib/format";
import { safeName, sb, unwrap, uploadFile, useAction, useQuery } from "@/lib/hooks";
import type { BedRow, RoomRow, Settings } from "@/types";

const PHONE = /^[0-9+ -]{8,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ID_TYPES = [["aadhaar", "Aadhaar"], ["pan", "PAN"], ["passport", "Passport"], ["driving_license", "Driving licence"], ["voter_id", "Voter ID"], ["other", "Other"]];

const blank = { full_name: "", phone: "", email: "", emergency_name: "", emergency_phone: "", address: "", id_proof_type: "aadhaar", id_proof_number: "", bed_id: "", start_date: todayISO(), rent: "", deposit: "", prorate: true, planned_checkout: "" };

export default function CheckInModal({ open, onClose, presetBed }: { open: boolean; onClose: () => void; presetBed?: string | null }) {
  const router = useRouter();
  const run = useAction();
  const [f, setF] = useState({ ...blank });
  const [photo, setPhoto] = useState<File | null>(null);
  const [touchedDeposit, setTouchedDeposit] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const q = useQuery(async () => {
    const c = sb();
    const [b, r, s] = await Promise.all([
      c.from("v_bed_status").select("*").is("tenant_id", null).eq("room_status", "available").order("room_no").order("bed_no"),
      c.from("v_room_overview").select("room_id,rent_per_bed,sharing"),
      c.from("settings").select("default_deposit_months").eq("id", 1).single(),
    ]);
    return { beds: unwrap(b) as unknown as BedRow[], rooms: unwrap(r) as unknown as Pick<RoomRow, "room_id" | "rent_per_bed" | "sharing">[], months: (unwrap(s) as unknown as Settings).default_deposit_months };
  }, [open]);

  useEffect(() => { if (open) { setF({ ...blank, start_date: todayISO(), bed_id: presetBed ?? "" }); setPhoto(null); setTouchedDeposit(false); setErrors({}); } }, [open, presetBed]);

  const bed = q.data?.beds.find((b) => b.bed_id === f.bed_id);
  const listRent = useMemo(() => Number(q.data?.rooms.find((r) => r.room_id === bed?.room_id)?.rent_per_bed ?? 0), [q.data, bed]);
  // choosing a bed pre-fills rent (and deposit) from pricing
  useEffect(() => {
    if (!bed) return;
    setF((p) => ({ ...p, rent: String(listRent), deposit: touchedDeposit ? p.deposit : String(listRent * (q.data?.months ?? 2)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.bed_id, listRent]);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  function validate() {
    const e: Record<string, string> = {};
    if (f.full_name.trim().length < 2) e.full_name = "Enter the tenant's full name.";
    if (!PHONE.test(f.phone.trim())) e.phone = "Enter a valid phone number (8–15 digits).";
    if (f.email && !EMAIL.test(f.email)) e.email = "Enter a valid email or leave empty.";
    if (f.emergency_phone && !PHONE.test(f.emergency_phone.trim())) e.emergency_phone = "Enter a valid phone number.";
    if (!f.bed_id) e.bed_id = "Choose a room and bed.";
    if (!f.start_date) e.start_date = "Pick the joining date.";
    if (f.rent === "" || Number(f.rent) < 0) e.rent = "Enter the monthly rent.";
    if (f.deposit !== "" && Number(f.deposit) < 0) e.deposit = "Deposit can't be negative.";
    if (f.planned_checkout && f.planned_checkout <= f.start_date) e.planned_checkout = "Must be after the joining date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    let tid = "";
    const ok = await run(async () => {
      tid = unwrap(await sb().rpc("check_in", {
        p_tenant: { full_name: f.full_name, phone: f.phone.trim(), email: f.email, emergency_name: f.emergency_name, emergency_phone: f.emergency_phone, address: f.address, id_proof_type: f.id_proof_type, id_proof_number: f.id_proof_number, planned_checkout: f.planned_checkout },
        p_bed: f.bed_id, p_start: f.start_date, p_rent: Number(f.rent), p_deposit: Number(f.deposit || 0), p_prorate: f.prorate,
      })) as unknown as string;
    }, "Tenant checked in. First invoice created.");
    if (!ok) return;
    if (photo) {
      await run(async () => {
        const path = await uploadFile("tenant-documents", `${tid}/photo-${Date.now()}-${safeName(photo.name)}`, photo);
        unwrap(await sb().from("tenants").update({ photo_path: path }).eq("id", tid));
      });
    }
    onClose();
    router.push(`/dashboard/tenants/${tid}`);
  }

  const beds = q.data?.beds ?? [];
  const custom = bed && f.rent !== "" && Number(f.rent) !== listRent;
  return (
    <Modal open={open} onClose={onClose} title="Check in a new tenant" size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><AsyncButton onClick={submit} busyLabel="Checking in…" disabled={q.loading}>Check in</AsyncButton></>}>
      <div className="space-y-6">
        <section>
          <h3 className="section-title">Tenant details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name *" error={errors.full_name}><input className="input" value={f.full_name} onChange={set("full_name")} autoFocus /></Field>
            <Field label="Phone number *" error={errors.phone}><input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="98450 12345" /></Field>
            <Field label="Email" error={errors.email}><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
            <Field label="Profile photo" hint="Optional · JPG or PNG"><input type="file" accept="image/*" className="input !p-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-700" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Emergency contact name"><input className="input" value={f.emergency_name} onChange={set("emergency_name")} /></Field>
            <Field label="Emergency contact phone" error={errors.emergency_phone}><input className="input" inputMode="tel" value={f.emergency_phone} onChange={set("emergency_phone")} /></Field>
            <Field label="Permanent address" className="sm:col-span-2"><textarea className="input" rows={2} value={f.address} onChange={set("address")} /></Field>
            <Field label="ID proof type"><select className="input" value={f.id_proof_type} onChange={set("id_proof_type")}>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="ID proof number"><input className="input" value={f.id_proof_number} onChange={set("id_proof_number")} /></Field>
          </div>
        </section>
        <section>
          <h3 className="section-title">Room, rent &amp; deposit</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Room & bed *" error={errors.bed_id} hint={beds.length === 0 && !q.loading ? "No vacant beds right now." : undefined}>
              <select className="input" value={f.bed_id} onChange={set("bed_id")}>
                <option value="">Select a vacant bed…</option>
                {beds.map((b) => <option key={b.bed_id} value={b.bed_id}>Room {b.room_no} · Bed {b.bed_no} · {cap(b.sharing)}</option>)}
              </select></Field>
            <Field label="Joining date *" error={errors.start_date}><input type="date" className="input" value={f.start_date} onChange={set("start_date")} /></Field>
            <Field label="Monthly rent (₹) *" error={errors.rent} hint={custom ? `Custom rent — list price is ${inr(listRent)}` : bed ? `List price for this room: ${inr(listRent)}` : undefined}>
              <input type="number" min={0} className="input" value={f.rent} onChange={set("rent")} /></Field>
            <Field label="Security deposit (₹)" error={errors.deposit} hint="Tracked separately from rent income">
              <input type="number" min={0} className="input" value={f.deposit} onChange={(e) => { setTouchedDeposit(true); set("deposit")(e); }} /></Field>
            <Field label="Planned check-out (optional)" error={errors.planned_checkout}><input type="date" className="input" value={f.planned_checkout} onChange={set("planned_checkout")} /></Field>
            <label className="flex items-start gap-2 text-sm text-gray-700 sm:mt-7"><input type="checkbox" className="mt-0.5 rounded" checked={f.prorate} onChange={(e) => setF({ ...f, prorate: e.target.checked })} />
              <span>Charge only the remaining days of the joining month<span className="block text-xs text-gray-400">Untick to bill the full month</span></span></label>
          </div>
        </section>
      </div>
    </Modal>
  );
}
