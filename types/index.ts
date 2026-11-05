export type Role = "super_admin" | "manager" | "accountant";
export type Sharing = "single" | "double" | "triple";
export type PaymentStatus = "paid" | "partial" | "pending" | "overdue";
export type PaymentMethod = "cash" | "upi" | "bank_transfer" | "card" | "deposit_adjustment";
export type ItemKind = "rent" | "electricity" | "food" | "laundry" | "maintenance" | "other" | "discount" | "adjustment";
export type ExpenseCategory = "electricity" | "water" | "food_groceries" | "internet" | "cleaning" | "maintenance" | "staff_salary" | "other";

export interface Profile { id: string; full_name: string; email: string | null; role: Role; active: boolean; created_at: string }
export interface Settings {
  pg_name: string; address: string; phone: string; email: string; due_day: number; reminder_days_before: number;
  checkout_notice_days: number; default_deposit_months: number; upi_id: string; receipt_footer: string;
}
export interface Pricing { sharing: Sharing; beds_per_room: number; monthly_rent: number; updated_at: string }

export interface RoomRow {
  room_id: string; room_no: string; sharing: Sharing; total_beds: number; status: "available" | "maintenance"; notes: string;
  rent_per_bed: number; custom_rent_per_bed: number | null; occupied: number; available: number;
  display_status: "available" | "fully_occupied" | "maintenance";
  occupants: { tenant_id: string; name: string; bed_no: number; rent: number; since: string }[];
}
export interface BedRow { bed_id: string; room_id: string; bed_no: number; room_no: string; sharing: Sharing; room_status: string; stay_id: string | null; tenant_id: string | null; tenant_name: string | null }

export interface TenantRow {
  id: string; full_name: string; photo_path: string | null; phone: string; email: string | null;
  emergency_name: string; emergency_phone: string; address: string; id_proof_type: string | null; id_proof_number: string;
  status: "active" | "checked_out"; created_at: string;
  stay_id: string | null; bed_id: string | null; start_date: string | null; end_date: string | null; monthly_rent: number | null;
  is_custom_rent: boolean | null; planned_checkout: string | null; room_id: string | null; room_no: string | null;
  sharing: Sharing | null; bed_no: number | null; deposit_held: number; deposit_collected: number;
}
export interface InvoiceRow {
  id: string; invoice_no: string; tenant_id: string; stay_id: string; period: string; due_date: string; notes: string; created_at: string;
  tenant_name: string; tenant_phone: string; room_id: string; room_no: string; sharing: Sharing; bed_no: number;
  rent: number; total: number; paid: number; balance: number; status: PaymentStatus;
}
export interface InvoiceItem { id: string; invoice_id: string; kind: ItemKind; description: string; amount: number }
export interface PaymentRow {
  id: string; receipt_no: string; invoice_id: string; tenant_id: string; amount: number; method: PaymentMethod; reference: string;
  paid_on: string; note: string; voided_at: string | null; void_reason: string | null; created_at: string;
}
export interface ExpenseRow { id: string; category: ExpenseCategory; amount: number; expense_date: string; description: string; vendor: string; receipt_path: string | null }
export interface DashboardStats {
  month: string; total_rooms: number; total_beds: number; occupied_beds: number; available_beds: number; total_tenants: number;
  expected: number; collected: number; pending_amount: number; pending_count: number; overdue_amount: number; overdue_count: number;
  deposits_held: number;
  monthly: { month: string; billed: number; received: number; expenses: number }[];
  occupancy: { sharing: Sharing; beds: number; occupied: number }[];
}
