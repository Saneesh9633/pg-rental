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

export type NavGroup = "Main menu" | "Manage" | "Account";
export const NAV: { href: string; label: string; icon: string; roles: Role[]; group: NavGroup }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", roles: ALL, group: "Main menu" },
  { href: "/dashboard/rooms", label: "Rooms & Beds", icon: "bed", roles: ALL, group: "Main menu" },
  { href: "/dashboard/tenants", label: "Tenants", icon: "users", roles: ALL, group: "Main menu" },
  { href: "/dashboard/billing", label: "Billing & Invoices", icon: "file", roles: ALL, group: "Main menu" },
  { href: "/dashboard/payments", label: "Payments", icon: "wallet", roles: ALL, group: "Main menu" },
  { href: "/dashboard/pricing", label: "Rental Pricing", icon: "tag", roles: A, group: "Manage" },
  { href: "/dashboard/expenses", label: "Expenses", icon: "receipt", roles: F, group: "Manage" },
  { href: "/dashboard/reports", label: "Reports", icon: "chart", roles: ALL, group: "Manage" },
  { href: "/dashboard/users", label: "Users & Roles", icon: "shield", roles: A, group: "Account" },
  { href: "/dashboard/settings", label: "Settings", icon: "cog", roles: A, group: "Account" },
];
