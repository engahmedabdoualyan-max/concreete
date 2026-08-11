import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fimto Soft — Concrete Plant ERP",
  description:
    "Multi-Role Mobile-First ERP System for Ready-Mix Concrete operations. Fleet management, weighbridge governance, quality control, finance pipeline, and workshop management.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
