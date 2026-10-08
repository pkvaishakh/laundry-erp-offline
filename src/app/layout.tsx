import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export const metadata: Metadata = {
  title: "LaundryPro - Billing & Order Management",
  description: "Professional laundry billing and order management system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: { fontSize: "14px", borderRadius: "8px" },
          }}
        />
      </body>
    </html>
  );
}
