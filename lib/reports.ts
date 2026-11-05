/** Report definitions: each returns plain rows so the same data feeds the screen, PDF and Excel export. */
import { cap, fmtDate, fmtDateTime, monthLabel, monthName, todayISO, methodLabel } from "@/lib/format";
import { sb, unwrap } from "@/lib/hooks";
import type { ExpenseRow, InvoiceRow, PaymentRow, RoomRow } from "@/types";

export interface ReportData { columns: string[]; rows: (string | number)[][]; totals?: (string | number)[]; moneyCols: number[]; subtitle: string }
export type ReportId = "monthly" | "annual" | "outstanding" | "tenant" | "occupancy" | "sharing" | "deposits" | "expenses" | "pnl" | "audit";
export interface ReportMeta { id: ReportId; label: string; desc: string; needs?: "year" | "tenant"; finance?: boolean }

export const REPORTS: ReportMeta[] = [
  { id: "monthly", label: "Monthly rental income", desc: "Billed vs received for each month", needs: "year" },
  { id: "annual", label: "Annual rental income", desc: "Year-by-year totals" },
  { id: "outstanding", label: "Outstanding payments", desc: "Every unpaid or part-paid invoice" },
  { id: "tenant", label: "Tenant payment history", desc: "All payments made by one tenant", needs: "tenant" },
  { id: "occupancy", label: "Room occupancy", desc: "Beds, occupants and vacancies per room" },
  { id: "sharing", label: "Sharing category revenue", desc: "Single vs double vs triple", needs: "year" },
  { id: "deposits", label: "Security deposit summary", desc: "Collected, deducted, refunded and held" },
  { id: "expenses", label: "Expense report", desc: "Category-wise monthly expenses", needs: "year", finance: true },
  { id: "pnl", label: "Profit & loss", desc: "Rent received minus expenses", needs: "year", finance: true },
  { id: "audit", label: "Audit trail", desc: "Latest 300 financial & settings changes", finance: true },
];

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const yearRange = (y: string) => [`${y}-01-01`, `${Number(y) + 1}-01-01`] as const;

async function invoices(): Promise<InvoiceRow[]> { return unwrap(await sb().from("v_invoice_summary").select("*").order("period")) as unknown as InvoiceRow[]; }
async function payments(from?: string, to?: string): Promise<PaymentRow[]> {
  let q = sb().from("payments").select("*").is("voided_at", null);
  if (from) q = q.gte("paid_on", from).lt("paid_on", to!);
  return unwrap(await q) as unknown as PaymentRow[];
}
async function expenses(from: string, to: string): Promise<ExpenseRow[]> { return unwrap(await sb().from("expenses").select("*").gte("expense_date", from).lt("expense_date", to)) as unknown as ExpenseRow[]; }

export async function runReport(id: ReportId, p: { year: string; tenantId: string }): Promise<ReportData> {
  const [from, to] = yearRange(p.year);
  switch (id) {
    case "monthly": {
      const [inv, pay] = await Promise.all([invoices(), payments(from, to)]);
      const rows = Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, "0"); const per = `${p.year}-${m}-01`;
        const mi = inv.filter((x) => x.period === per);
        return [monthName(i + 1), mi.length, sum(mi.map((x) => Number(x.total))), sum(pay.filter((x) => x.paid_on.slice(5, 7) === m).map((x) => Number(x.amount))), sum(mi.map((x) => Math.max(Number(x.balance), 0)))];
      });
      return { columns: ["Month", "Invoices", "Billed (₹)", "Received in month (₹)", "Still outstanding on these bills (₹)"], rows, moneyCols: [2, 3, 4], subtitle: `Year ${p.year}`, totals: ["Total", sum(rows.map((r) => r[1] as number)), sum(rows.map((r) => r[2] as number)), sum(rows.map((r) => r[3] as number)), sum(rows.map((r) => r[4] as number))] };
    }
    case "annual": {
      const [inv, pay] = await Promise.all([invoices(), payments()]);
      const years = Array.from(new Set([...inv.map((i) => i.period.slice(0, 4)), ...pay.map((x) => x.paid_on.slice(0, 4))])).sort();
      const rows = years.map((y) => [y, sum(inv.filter((i) => i.period.startsWith(y)).map((i) => Number(i.total))), sum(pay.filter((x) => x.paid_on.startsWith(y)).map((x) => Number(x.amount))), sum(inv.filter((i) => i.period.startsWith(y)).map((i) => Math.max(Number(i.balance), 0)))]);
      return { columns: ["Year", "Billed (₹)", "Received (₹)", "Outstanding on bills (₹)"], rows, moneyCols: [1, 2, 3], subtitle: "All years", totals: ["Total", ...[1, 2, 3].map((c) => sum(rows.map((r) => r[c] as number)))] };
    }
    case "outstanding": {
      const inv = (await invoices()).filter((i) => Number(i.balance) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
      const today = todayISO();
      const rows = inv.map((i) => [i.tenant_name, i.room_no, i.invoice_no, monthLabel(i.period), fmtDate(i.due_date), Number(i.total), Number(i.paid), Number(i.balance), cap(i.status), i.due_date < today ? Math.round((Date.parse(today) - Date.parse(i.due_date)) / 864e5) : 0]);
      return { columns: ["Tenant", "Room", "Invoice", "Month", "Due date", "Total (₹)", "Paid (₹)", "Balance (₹)", "Status", "Days overdue"], rows, moneyCols: [5, 6, 7], subtitle: `As on ${fmtDate(today)}`, totals: ["Total", "", "", "", "", sum(rows.map((r) => r[5] as number)), sum(rows.map((r) => r[6] as number)), sum(rows.map((r) => r[7] as number)), "", ""] };
    }
    case "tenant": {
      if (!p.tenantId) return { columns: ["Select a tenant above"], rows: [], moneyCols: [], subtitle: "" };
      const [t, pay, inv] = await Promise.all([sb().from("tenants").select("full_name").eq("id", p.tenantId).single(), sb().from("payments").select("*").eq("tenant_id", p.tenantId).order("paid_on"), sb().from("v_invoice_summary").select("id,invoice_no,period").eq("tenant_id", p.tenantId)]);
      const invs = unwrap(inv) as unknown as { id: string; invoice_no: string; period: string }[];
      const rows = (unwrap(pay) as unknown as PaymentRow[]).map((x) => { const i = invs.find((v) => v.id === x.invoice_id); return [fmtDate(x.paid_on), x.receipt_no, i ? monthLabel(i.period) : "", methodLabel(x.method), x.reference || "", Number(x.amount), x.voided_at ? "Void" : "OK"]; });
      return { columns: ["Date", "Receipt", "For month", "Method", "Reference", "Amount (₹)", "Status"], rows, moneyCols: [5], subtitle: (unwrap(t) as unknown as { full_name: string }).full_name, totals: ["Total received", "", "", "", "", sum(rows.filter((r) => r[6] === "OK").map((r) => r[5] as number)), ""] };
    }
    case "occupancy": {
      const rooms = unwrap(await sb().from("v_room_overview").select("*").order("room_no")) as unknown as RoomRow[];
      const rows = rooms.map((r) => [r.room_no, cap(r.sharing), r.total_beds, Number(r.occupied), r.status === "maintenance" ? 0 : Number(r.available), cap(r.display_status), r.occupants.map((o) => o.name).join(", ")]);
      return { columns: ["Room", "Sharing", "Total beds", "Occupied", "Available", "Status", "Occupants"], rows, moneyCols: [], subtitle: `As on ${fmtDate(todayISO())}`, totals: ["Total", "", sum(rows.map((r) => r[2] as number)), sum(rows.map((r) => r[3] as number)), sum(rows.map((r) => r[4] as number)), "", ""] };
    }
    case "sharing": {
      const [inv, rooms] = await Promise.all([invoices(), unwrap(await sb().from("v_room_overview").select("*")) as unknown as RoomRow[]]);
      const rows = (["single", "double", "triple"] as const).map((s) => {
        const beds = sum(rooms.filter((r) => r.sharing === s).map((r) => r.total_beds)), occ = sum(rooms.filter((r) => r.sharing === s).map((r) => Number(r.occupied)));
        const yi = inv.filter((i) => i.sharing === s && i.period.startsWith(p.year));
        const billed = sum(yi.map((i) => Number(i.total))), got = sum(yi.map((i) => Number(i.paid)));
        return [cap(s), beds, occ, beds ? `${Math.round((occ / beds) * 100)}%` : "0%", billed, got, billed - got];
      });
      return { columns: ["Sharing", "Beds", "Occupied", "Occupancy", "Billed (₹)", "Collected (₹)", "Outstanding (₹)"], rows, moneyCols: [4, 5, 6], subtitle: `Year ${p.year}`, totals: ["Total", sum(rows.map((r) => r[1] as number)), sum(rows.map((r) => r[2] as number)), "", sum(rows.map((r) => r[4] as number)), sum(rows.map((r) => r[5] as number)), sum(rows.map((r) => r[6] as number))] };
    }
    case "deposits": {
      const [t, d] = await Promise.all([sb().from("tenants").select("id,full_name,status").order("full_name"), sb().from("deposit_transactions").select("tenant_id,kind,amount")]);
      const tx = unwrap(d) as unknown as { tenant_id: string; kind: string; amount: number }[];
      const rows = (unwrap(t) as unknown as { id: string; full_name: string; status: string }[]).map((x) => {
        const f = (k: string) => sum(tx.filter((y) => y.tenant_id === x.id && y.kind === k).map((y) => Number(y.amount)));
        const c = f("collected"), de = f("deduction"), ad = f("adjusted_against_dues"), re = f("refund");
        return [x.full_name, cap(x.status), c, de, ad, re, c - de - ad - re];
      }).filter((r) => (r[2] as number) > 0);
      return { columns: ["Tenant", "Status", "Collected (₹)", "Deductions (₹)", "Adjusted vs dues (₹)", "Refunded (₹)", "Held (₹)"], rows, moneyCols: [2, 3, 4, 5, 6], subtitle: "Deposits are liabilities, not rental income", totals: ["Total", "", ...[2, 3, 4, 5, 6].map((c) => sum(rows.map((r) => r[c] as number)))] };
    }
    case "expenses": {
      const ex = await expenses(from, to);
      const cats = Array.from(new Set(ex.map((e) => e.category))).sort();
      const mm = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const rows = cats.map((c) => { const per = mm.map((_, i) => sum(ex.filter((e) => e.category === c && Number(e.expense_date.slice(5, 7)) === i + 1).map((e) => Number(e.amount)))); return [cap(c), ...per, sum(per)]; });
      return { columns: ["Category", ...mm, "Total"], rows, moneyCols: Array.from({ length: 13 }, (_, i) => i + 1), subtitle: `Year ${p.year}`, totals: ["Total", ...Array.from({ length: 13 }, (_, i) => sum(rows.map((r) => r[i + 1] as number)))] };
    }
    case "pnl": {
      const [pay, ex] = await Promise.all([payments(from, to), expenses(from, to)]);
      const rows = Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, "0"); const inc = sum(pay.filter((x) => x.paid_on.slice(5, 7) === m).map((x) => Number(x.amount))); const exp = sum(ex.filter((x) => x.expense_date.slice(5, 7) === m).map((x) => Number(x.amount))); return [monthName(i + 1), inc, exp, inc - exp]; });
      return { columns: ["Month", "Rental income received (₹)", "Expenses (₹)", "Profit / (loss) (₹)"], rows, moneyCols: [1, 2, 3], subtitle: `Year ${p.year} · security deposits excluded`, totals: ["Total", ...[1, 2, 3].map((c) => sum(rows.map((r) => r[c] as number)))] };
    }
    case "audit": {
      const [a, u] = await Promise.all([sb().from("audit_log").select("*").order("id", { ascending: false }).limit(300), sb().from("profiles").select("id,full_name")]);
      const users = unwrap(u) as unknown as { id: string; full_name: string }[];
      const rows = (unwrap(a) as unknown as { at: string; actor: string | null; table_name: string; action: string; row_id: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }[]).map((l) => {
        const changed = l.action === "UPDATE" && l.old_data && l.new_data ? Object.keys(l.new_data).filter((k) => JSON.stringify(l.new_data![k]) !== JSON.stringify(l.old_data![k])).map((k) => `${k}: ${JSON.stringify(l.old_data![k])} → ${JSON.stringify(l.new_data![k])}`).join("; ") : "";
        return [fmtDateTime(l.at), users.find((x) => x.id === l.actor)?.full_name ?? "System", l.table_name, l.action, changed.slice(0, 160)];
      });
      return { columns: ["When", "Who", "Table", "Action", "What changed"], rows, moneyCols: [], subtitle: "Most recent 300 entries" };
    }
  }
}
