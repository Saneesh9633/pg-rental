import type { Role } from "@/types";

export const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", manager: "Manager", accountant: "Accountant" };

const A: Role[] = ["super_admin"], M: Role[] = ["super_admin", "manager"], F: Role[] = ["super_admin", "accountant"], ALL: Role[] = ["super_admin", "manager", "accountant"];
/** UI permissions. The database enforces the same rules with RLS; this only hides what a role can't use. */
export const PERMS = {
  manageRooms: M, manageTenants: M, checkInOut: M, editPricing: A, manageSettings: A, manageUsers: A,
  manageInvoices: F, recordPayment: ALL, voidPayment: F, manageExpenses: F, viewFinancials: F, viewAudit: F,
} satisfies Record<string, Role[]>;
export type Perm = keyof typeof PERMS;
export const can = (role: Role | undefined, perm: Perm) => !!role && (PERMS[perm] as Role[]).includes(role);

export const NAV: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", roles: ALL },
  { href: "/dashboard/rooms", label: "Rooms & Beds", icon: "bed", roles: ALL },
  { href: "/dashboard/tenants", label: "Tenants", icon: "users", roles: ALL },
  { href: "/dashboard/pricing", label: "Rental Pricing", icon: "tag", roles: A },
  { href: "/dashboard/billing", label: "Billing & Invoices", icon: "file", roles: ALL },
  { href: "/dashboard/payments", label: "Payments", icon: "wallet", roles: ALL },
  { href: "/dashboard/expenses", label: "Expenses", icon: "receipt", roles: F },
  { href: "/dashboard/reports", label: "Reports", icon: "chart", roles: ALL },
  { href: "/dashboard/users", label: "Users & Roles", icon: "shield", roles: A },
  { href: "/dashboard/settings", label: "Settings", icon: "cog", roles: A },
];
