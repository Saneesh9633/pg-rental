import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "PG Manager",
  description: "PG rental management — rooms, tenants, billing, payments and reports",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#EFEEE8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="bg-canvas text-gray-900 antialiased font-sans">{children}</body>
    </html>
  );
}
