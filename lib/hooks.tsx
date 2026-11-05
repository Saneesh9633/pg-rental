"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";
import type { Profile } from "@/types";

export const sb = () => createClient();

/** Throws a friendly Error when a Supabase call failed, otherwise returns the data. */
export function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(friendly(res.error.message, res.error.code));
  return res.data as T;
}
export function friendly(msg: string, code?: string): string {
  if (code === "23505" || /duplicate key/i.test(msg)) {
    if (/room_no/.test(msg)) return "A room with this number already exists.";
    if (/tenant_id, period|invoices_tenant_id_period/.test(msg)) return "An invoice for this tenant and month already exists.";
    return "This record already exists.";
  }
  if (code === "23503" || /foreign key/i.test(msg)) return "This record is in use elsewhere (it has history), so it can't be deleted.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "You don't have permission to do this.";
  if (/violates check constraint/i.test(msg)) return "One of the values is not allowed. Please check the form.";
  return msg;
}
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then((data) => live && setState({ data, loading: false }))
        .catch((e) => live && setState({ loading: false, error: errText(e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// ---- profile -------------------------------------------------------------
const ProfileCtx = createContext<Profile | null>(null);
export const ProfileProvider = ProfileCtx.Provider;
export function useProfile(): Profile {
  const p = useContext(ProfileCtx);
  if (!p) throw new Error("useProfile outside provider");
  return p;
}

// ---- toasts + confirm ----------------------------------------------------
type Toast = { id: number; kind: "ok" | "err"; text: string };
type ConfirmOpts = { title: string; message?: string; confirmLabel?: string; danger?: boolean };
const UiCtx = createContext<{ toast: (kind: "ok" | "err", text: string) => void; confirm: (o: ConfirmOpts) => Promise<boolean> } | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const toast = useCallback((kind: "ok" | "err", text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), []);
  const close = (v: boolean) => { dlg?.resolve(v); setDlg(null); };
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg border ${t.kind === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>{t.text}</div>
        ))}
      </div>
      {dlg && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/40 p-4" role="alertdialog" aria-modal="true">
          <div className="card w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900">{dlg.title}</h3>
            {dlg.message && <p className="text-sm text-gray-600 mt-2">{dlg.message}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
              <button className={dlg.danger ? "btn-danger" : "btn-primary"} autoFocus onClick={() => close(true)}>{dlg.confirmLabel ?? "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </UiCtx.Provider>
  );
}
export function useUi() {
  const c = useContext(UiCtx);
  if (!c) throw new Error("useUi outside provider");
  return c;
}

/** run an async action with toast feedback; returns true on success */
export function useAction() {
  const { toast } = useUi();
  return useCallback(async (fn: () => Promise<unknown>, success?: string) => {
    try { await fn(); if (success) toast("ok", success); return true; }
    catch (e) { toast("err", errText(e)); return false; }
  }, [toast]);
}

// ---- signed URLs for private storage ---------------------------------------
const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await sb().storage.from(bucket).createSignedUrl(path, 3600);
  if (!data) return null;
  urlCache.set(key, { url: data.signedUrl, exp: Date.now() + 3000e3 });
  return data.signedUrl;
}
export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; if (path) signedUrl(bucket, path).then((u) => live && setUrl(u)); else setUrl(null); return () => { live = false; }; }, [bucket, path]);
  return url;
}
export async function uploadFile(bucket: string, path: string, file: File) {
  const { error } = await sb().storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}
export const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_");
