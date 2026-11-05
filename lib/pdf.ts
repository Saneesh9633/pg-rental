"use client";
/** Client-side PDF + Excel generation. PDFs use "Rs." because the built-in PDF fonts have no ₹ glyph. */
import type { InvoiceItem, InvoiceRow, PaymentRow, Settings } from "@/types";
import { cap, fmtDate, monthLabel, methodLabel } from "@/lib/format";

export const pdfInr = (n: number | string) =>
  "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });

type Doc = import("jspdf").jsPDF;
async function newDoc(format: "a4" | "a5" = "a4", orientation: "p" | "l" = "p") {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format, orientation });
  return { doc, autoTable };
}
export function emit(doc: Doc, filename: string, mode: "download" | "print") {
  if (mode === "download") return doc.save(filename);
  doc.autoPrint();
  window.open(doc.output("bloburl") as unknown as string, "_blank");
}
function letterhead(doc: Doc, pg: Settings, title: string, w: number) {
  doc.setFillColor(79, 70, 229); doc.rect(0, 0, w, 3, "F");
  doc.setTextColor(17, 24, 39); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(pg.pg_name, 14, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(107, 114, 128);
  const lines = [pg.address, [pg.phone, pg.email].filter(Boolean).join("  |  ")].filter(Boolean);
  lines.forEach((l, i) => doc.text(l, 14, 19 + i * 4));
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(79, 70, 229); doc.text(title, w - 14, 14, { align: "right" });
  doc.setDrawColor(229, 231, 235); doc.line(14, 28, w - 14, 28);
  doc.setTextColor(17, 24, 39);
}
function kv(doc: Doc, x: number, y: number, k: string, v: string, w = 70) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(107, 114, 128); doc.text(k, x, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(17, 24, 39); doc.text(doc.splitTextToSize(v || "—", w), x, y + 4.5);
}

export async function receiptPdf(pg: Settings, p: PaymentRow, inv: InvoiceRow, paidSoFar: number): Promise<Doc> {
  const { doc, autoTable } = await newDoc("a5", "l");
  const W = 210;
  letterhead(doc, pg, "PAYMENT RECEIPT", W);
  kv(doc, 14, 36, "Receipt No.", p.receipt_no); kv(doc, 80, 36, "Date", fmtDate(p.paid_on)); kv(doc, 140, 36, "Payment method", methodLabel(p.method));
  kv(doc, 14, 50, "Received from", inv.tenant_name); kv(doc, 80, 50, "Room / Bed", `${inv.room_no} / Bed ${inv.bed_no} (${cap(inv.sharing)})`);
  kv(doc, 140, 50, "Reference", p.reference || "—", 55);
  kv(doc, 14, 64, "Against invoice", `${inv.invoice_no} — ${monthLabel(inv.period)}`);
  autoTable(doc, {
    startY: 76, margin: { left: 14, right: 14 }, theme: "grid", styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [79, 70, 229] },
    head: [["Description", "Amount"]],
    body: [
      ["Invoice total", pdfInr(inv.total)],
      ["Paid before this receipt", pdfInr(Math.max(paidSoFar - Number(p.amount), 0))],
      [{ content: "Amount received now", styles: { fontStyle: "bold" } }, { content: pdfInr(p.amount), styles: { fontStyle: "bold" } }],
      ["Balance after this payment", pdfInr(Math.max(Number(inv.total) - paidSoFar, 0))],
    ],
    columnStyles: { 1: { halign: "right" } },
  });
  if (p.voided_at) { doc.setTextColor(220, 38, 38); doc.setFontSize(22); doc.text("VOID", W / 2, 100, { align: "center", angle: 20 }); doc.setTextColor(17, 24, 39); }
  doc.setFontSize(8.5); doc.setTextColor(107, 114, 128);
  doc.text(pg.receipt_footer || "Thank you!", 14, 140);
  doc.text("This is a computer-generated receipt.", W - 14, 140, { align: "right" });
  return doc;
}

export async function invoicePdf(pg: Settings, inv: InvoiceRow, items: InvoiceItem[], payments: PaymentRow[]): Promise<Doc> {
  const { doc, autoTable } = await newDoc("a4", "p");
  const W = 210;
  letterhead(doc, pg, "INVOICE", W);
  kv(doc, 14, 36, "Invoice No.", inv.invoice_no); kv(doc, 70, 36, "Billing month", monthLabel(inv.period)); kv(doc, 130, 36, "Due date", fmtDate(inv.due_date));
  kv(doc, 14, 50, "Billed to", inv.tenant_name); kv(doc, 70, 50, "Room / Bed", `${inv.room_no} / Bed ${inv.bed_no} (${cap(inv.sharing)})`); kv(doc, 130, 50, "Status", cap(inv.status));
  autoTable(doc, {
    startY: 66, margin: { left: 14, right: 14 }, theme: "striped", styles: { fontSize: 9.5, cellPadding: 2.8 }, headStyles: { fillColor: [79, 70, 229] },
    head: [["#", "Description", "Type", "Amount"]],
    body: items.map((it, i) => [i + 1, it.description, cap(it.kind), pdfInr(it.amount)]),
    columnStyles: { 0: { cellWidth: 10 }, 3: { halign: "right" } },
    foot: [
      [{ content: "Total", colSpan: 3, styles: { halign: "right" } }, { content: pdfInr(inv.total), styles: { halign: "right" } }],
      [{ content: "Paid", colSpan: 3, styles: { halign: "right" } }, { content: pdfInr(inv.paid), styles: { halign: "right" } }],
      [{ content: "Balance due", colSpan: 3, styles: { halign: "right" } }, { content: pdfInr(inv.balance), styles: { halign: "right" } }],
    ],
    footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
  });
  const live = payments.filter((p) => !p.voided_at);
  if (live.length) {
    // @ts-expect-error lastAutoTable is added by the plugin
    const y = (doc.lastAutoTable?.finalY ?? 120) + 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Payments received", 14, y);
    autoTable(doc, {
      startY: y + 3, margin: { left: 14, right: 14 }, styles: { fontSize: 9 }, headStyles: { fillColor: [107, 114, 128] },
      head: [["Date", "Receipt", "Method", "Reference", "Amount"]],
      body: live.map((p) => [fmtDate(p.paid_on), p.receipt_no, methodLabel(p.method), p.reference || "—", pdfInr(p.amount)]),
      columnStyles: { 4: { halign: "right" } },
    });
  }
  if (pg.upi_id && Number(inv.balance) > 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(79, 70, 229);
    doc.text(`Pay by UPI: ${pg.upi_id}`, 14, 280);
  }
  return doc;
}

export async function tablePdf(opts: { title: string; subtitle?: string; pg: Settings; columns: string[]; rows: (string | number)[][]; numericCols?: number[]; totals?: (string | number)[] }) {
  const { doc, autoTable } = await newDoc("a4", opts.columns.length > 6 ? "l" : "p");
  const W = opts.columns.length > 6 ? 297 : 210;
  letterhead(doc, opts.pg, opts.title.toUpperCase().slice(0, 28), W);
  if (opts.subtitle) { doc.setFontSize(9); doc.setTextColor(107, 114, 128); doc.text(opts.subtitle, 14, 34); }
  const align: Record<number, { halign: "right" }> = {};
  (opts.numericCols ?? []).forEach((i) => (align[i] = { halign: "right" }));
  autoTable(doc, {
    startY: 38, margin: { left: 14, right: 14 }, styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [79, 70, 229] }, columnStyles: align,
    head: [opts.columns], body: opts.rows.map((r) => r.map(String)),
    foot: opts.totals ? [opts.totals.map(String)] : undefined, footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: "bold" },
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Page ${i} of ${n}  •  Generated ${fmtDate(new Date().toISOString())}`, 14, doc.internal.pageSize.getHeight() - 8); }
  return doc;
}

export async function xlsxDownload(filename: string, sheetName: string, columns: string[], rows: (string | number)[][], totals?: (string | number)[]) {
  const XLSX = await import("xlsx");
  const aoa = [columns, ...rows, ...(totals ? [totals] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c, i) => ({ wch: Math.min(40, Math.max(c.length, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
