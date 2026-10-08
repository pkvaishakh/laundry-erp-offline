"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  PlusCircle,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  Shirt,
  Tag,
  FileText,
  ChevronLeft,
  ChevronRight,
  Layers,
  Receipt,
  Wallet,
  Landmark,
  Trash2,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/orders/new", icon: PlusCircle, label: "New Order" },
  { href: "/orders", icon: ShoppingBag, label: "Orders" },
  { href: "/customers", icon: Users, label: "Customers" },
  { href: "/payments", icon: CreditCard, label: "Payments" },
  { href: "/expenses/new", icon: Receipt, label: "New Expense" },
  { href: "/expenses", icon: Wallet, label: "Expenses" },
  { href: "/accounts", icon: Landmark, label: "Accounts" },
  { href: "/barcodes", icon: Tag, label: "Barcodes" },
  { href: "/reports", icon: BarChart3, label: "Reports" },
  { href: "/catalog", icon: Layers, label: "Catalog" },
  { href: "/data-cleanup", icon: Trash2, label: "Data Cleanup" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-56"
      } bg-slate-900 text-white flex flex-col h-screen sticky top-0 transition-all duration-200 shrink-0`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shirt className="text-blue-400 shrink-0" size={22} />
            <span className="font-bold text-sm leading-tight">LaundryPro</span>
          </div>
        )}
        {collapsed && <Shirt className="text-blue-400 mx-auto" size={22} />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-slate-400 hover:text-white transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg mb-0.5 transition-all text-sm ${
                isActive
                  ? "bg-blue-600 text-white font-medium"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
          LaundryPro v1.0
        </div>
      )}
    </aside>
  );
}
