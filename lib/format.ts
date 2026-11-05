/** Indian formatting helpers: ₹ with lakh/crore grouping, DD-MM-YYYY dates. */
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function inr(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? inrWhole.format(v) : inrFmt.format(v);
}
/** compact for chart axes: 1.2L, 45k */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n}`;
}
/** 'YYYY-MM-DD' (or ISO timestamp) -> 'DD-MM-YYYY'. Never goes through Date, so no timezone drift. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
}
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(dt);
  return p.replace(/\//g, "-").replace(",", "");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthShort = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`;
export const monthLabel = (d: string) => `${MONTHS_LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const monthName = (m: number) => MONTHS_LONG[m - 1];
/** today in India (IST) as YYYY-MM-DD */
export const todayISO = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
export const thisMonth = () => todayISO().slice(0, 7);          // YYYY-MM
export const monthStart = (ym: string) => `${ym.slice(0, 7)}-01`;
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const sharingLabel = (s: string | null | undefined) => (s ? `${cap(s)} sharing` : "—");
export function waLink(phone: string, text: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(text)}`;
}
const METHOD_LABELS: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", card: "Card", deposit_adjustment: "Deposit adjustment" };
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? cap(m);
