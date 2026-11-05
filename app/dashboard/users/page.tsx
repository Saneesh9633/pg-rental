"use client";
import { useState } from "react";
import { AsyncButton, Badge, DataTable, ErrorBox, Field, Icon, Modal, PageHeader, Spinner, type Column } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { errText, sb, unwrap, useAction, useProfile, useQuery } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/roles";
import type { Profile, Role } from "@/types";

const ROLE_DESC: Record<Role, string> = {
  super_admin: "Full access: pricing, settings, users, all financial reports.",
  manager: "Rooms, tenants, check-in/out, record payments, view reports.",
  accountant: "Invoices, payments, expenses and financial reports.",
};

async function api(method: "POST" | "PATCH", body: unknown) {
  const r = await fetch("/api/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Request failed");
}

export default function UsersPage() {
  const me = useProfile(); const run = useAction();
  const [add, setAdd] = useState(false); const [reset, setReset] = useState<Profile | null>(null);
  const q = useQuery(async () => unwrap(await sb().from("profiles").select("*").order("created_at")) as unknown as Profile[], []);
  if (me.role !== "super_admin") return <ErrorBox error="Only the Super Admin can manage users." />;
  if (q.loading && !q.data) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? ""} onRetry={q.reload} />;

  const update = (u: Profile, patch: Partial<Profile>) => run(async () => { unwrap(await sb().from("profiles").update(patch).eq("id", u.id)); }, "Saved").then((ok) => ok && q.reload());
  const cols: Column<Profile>[] = [
    { key: "n", header: "Name", sort: (u) => u.full_name, render: (u) => <span><b>{u.full_name || "—"}</b>{u.id === me.id && <Badge tone="indigo"> You</Badge>}<span className="block text-xs text-gray-400">{u.email}</span></span> },
    { key: "r", header: "Role", render: (u) => <select className="input !w-auto !py-1" value={u.role} disabled={u.id === me.id} aria-label={`Role for ${u.full_name}`} onChange={(e) => update(u, { role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select> },
    { key: "a", header: "Status", render: (u) => u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge> },
    { key: "c", header: "Added", hideOnMobile: true, render: (u) => fmtDate(u.created_at) },
    { key: "x", header: "", align: "right", render: (u) => (
      <div className="flex justify-end gap-1"><button className="btn-ghost" onClick={() => setReset(u)}>Reset password</button>
        {u.id !== me.id && <button className="btn-ghost" onClick={() => update(u, { active: !u.active })}>{u.active ? "Disable" : "Enable"}</button>}</div>) },
  ];
  return (
    <>
      <PageHeader title="Users & Roles" subtitle="Who can sign in, and what they can do" actions={<button className="btn-primary" onClick={() => setAdd(true)}><Icon name="plus" />Add user</button>} />
      <div className="grid md:grid-cols-3 gap-3 mb-5">{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <div key={r} className="card p-4"><p className="text-sm font-semibold">{ROLE_LABEL[r]}</p><p className="text-xs text-gray-500 mt-1">{ROLE_DESC[r]}</p></div>)}</div>
      <DataTable rows={q.data} columns={cols} rowKey={(u) => u.id} searchText={(u) => `${u.full_name} ${u.email}`} />
      {add && <AddUser onClose={() => setAdd(false)} onSaved={() => { setAdd(false); q.reload(); }} />}
      {reset && <ResetPw u={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const run = useAction(); const [f, setF] = useState({ full_name: "", email: "", password: "", role: "manager" as Role });
  return (
    <Modal open onClose={onClose} title="Add user" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <AsyncButton busyLabel="Creating…" onClick={async () => { if (await run(() => api("POST", f), "User created")) onSaved(); }}>Create user</AsyncButton></>}>
      <div className="space-y-4">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoFocus /></Field>
        <Field label="Email (login)"><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it with them securely."><input type="text" autoComplete="off" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Role" hint={ROLE_DESC[f.role]}><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
      </div>
    </Modal>
  );
}
function ResetPw({ u, onClose }: { u: Profile; onClose: () => void }) {
  const run = useAction(); const [pw, setPw] = useState("");
  return (
    <Modal open onClose={onClose} title={`Reset password — ${u.full_name}`} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button>
      <AsyncButton busyLabel="Saving…" onClick={async () => { if (await run(() => api("PATCH", { id: u.id, password: pw }).catch((e) => { throw new Error(errText(e)); }), "Password changed")) onClose(); }}>Change password</AsyncButton></>}>
      <Field label="New password" hint="At least 8 characters"><input type="text" autoComplete="off" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}
