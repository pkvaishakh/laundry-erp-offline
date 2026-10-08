"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useOrdersChanged } from "@/lib/ordersSync";
import {
  ShoppingBag, CreditCard, AlertCircle, TrendingUp, Clock,
  CheckCircle, XCircle, Package, ArrowRight, RefreshCw, Receipt, Wallet, Landmark
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface DashboardData {
  statusCounts: { status: string; count: number }[];
  todayOrders: number;
  todayCollection: number;
  totalDues: number;
  totalRevenue: number;
  weeklyData: { date: string; revenue: number; order_count: number }[];
  monthlyData: { month: string; revenue: number; order_count: number }[];
  paymentMethods: { method: string; total: number; count: number }[];
  topCustomers: { id: number; name: string; phone: string; totalDue: string; orderCount: number }[];
  recentOrders: {
    id: number; orderCode: string; status: string; totalAmount: string;
    dueAmount: string; createdAt: string; customerName: string; customerPhone: string;
  }[];
  overdueOrders: number;
  todayExpenses: number;
  totalExpensesThisMonth: number;
  totalPayables: number;
  cashBalance: number;
  bankBalance: number;
  pendingExpensesCount: number;
  overdueExpensesCount: number;
  recentExpenses: {
    id: number; expenseCode: string; description: string; amount: string; date: string; status: string;
  }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  // Pick up orders/payments made in another window, or while minimised.
  useOrdersChanged(fetchData);
  useEffect(() => {
    setToday(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);

  const statusMap = Object.fromEntries(
    (data?.statusCounts ?? []).map(s => [s.status, s.count])
  );

  const statCards = [
    {
      label: "Today's Orders",
      value: data?.todayOrders ?? 0,
      icon: ShoppingBag,
      color: "bg-blue-500",
      light: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      label: "Today's Collection",
      value: formatCurrency(data?.todayCollection),
      icon: CreditCard,
      color: "bg-green-500",
      light: "bg-green-50",
      text: "text-green-600",
    },
    {
      label: "Total Outstanding",
      value: formatCurrency(data?.totalDues),
      icon: AlertCircle,
      color: "bg-red-500",
      light: "bg-red-50",
      text: "text-red-600",
    },
    {
      label: "Total Revenue",
      value: formatCurrency(data?.totalRevenue),
      icon: TrendingUp,
      color: "bg-purple-500",
      light: "bg-purple-50",
      text: "text-purple-600",
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {today ?? "Loading dashboard..."}
              </p>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border rounded-lg hover:bg-slate-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className={`${card.light} p-2 rounded-lg`}>
                    <card.icon size={20} className={card.text} />
                  </div>
                </div>
                <div className={`text-2xl font-bold ${card.text}`}>{card.value}</div>
                <div className="text-xs text-slate-500 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Expense Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-orange-50 p-2 rounded-lg">
                  <Receipt size={20} className="text-orange-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-orange-600">{formatCurrency(data?.totalExpensesThisMonth)}</div>
              <div className="text-xs text-slate-500 mt-1">Expenses This Month</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-red-50 p-2 rounded-lg">
                  <Wallet size={20} className="text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(data?.totalPayables)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Accounts Payable Due
                {(data?.overdueExpensesCount ?? 0) > 0 && (
                  <span className="text-red-500"> · {data?.overdueExpensesCount} overdue</span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="bg-teal-50 p-2 rounded-lg">
                  <Landmark size={20} className="text-teal-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-teal-600">
                {formatCurrency((data?.cashBalance ?? 0) + (data?.bankBalance ?? 0))}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Cash + Bank Balance ({formatCurrency(data?.cashBalance)} cash, {formatCurrency(data?.bankBalance)} bank)
              </div>
            </div>
          </div>

          {/* Status Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { key: "pending", label: "Pending", icon: Clock, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
              { key: "processing", label: "Processing", icon: Package, color: "text-blue-600 bg-blue-50 border-blue-200" },
              { key: "ready", label: "Ready", icon: CheckCircle, color: "text-green-600 bg-green-50 border-green-200" },
              { key: "delivered", label: "Delivered", icon: CheckCircle, color: "text-gray-600 bg-gray-50 border-gray-200" },
            ].map((s) => (
              <div key={s.key} className={`rounded-xl border p-3 ${s.color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <s.icon size={16} />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
                <div className="text-2xl font-bold">{statusMap[s.key] ?? 0}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Weekly Revenue Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-700 mb-4">Weekly Revenue</h3>
              {data?.weeklyData && data.weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(v) => [`₹${Number(v).toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
              )}
            </div>

            {/* Payment Methods */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="font-semibold text-slate-700 mb-4">Today's Payment Methods</h3>
              {data?.paymentMethods && data.paymentMethods.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={data.paymentMethods}
                      dataKey="total"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      label={false}
                    >
                      {data.paymentMethods.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `₹${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No payments today</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-slate-700">Recent Orders</h3>
                <Link href="/orders" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y">
                {(data?.recentOrders ?? []).slice(0, 6).map((order) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm text-slate-800">{order.orderCode}</div>
                      <div className="text-xs text-slate-500">{order.customerName}</div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={order.status} />
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatCurrency(order.totalAmount)}
                        {parseFloat(String(order.dueAmount)) > 0 && (
                          <span className="text-red-500 ml-1">({formatCurrency(order.dueAmount)} due)</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
                {(!data?.recentOrders || data.recentOrders.length === 0) && (
                  <div className="p-6 text-center text-slate-400 text-sm">No orders yet</div>
                )}
              </div>
            </div>

            {/* Top Customers & Dues */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-slate-700">Customers with Dues</h3>
                <Link href="/customers" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y">
                {(data?.topCustomers ?? [])
                  .filter(c => parseFloat(String(c.totalDue)) > 0)
                  .slice(0, 6)
                  .map((c) => (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-sm text-slate-800">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.phone}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-red-600">{formatCurrency(c.totalDue)}</div>
                        <div className="text-xs text-slate-400">{c.orderCount} orders</div>
                      </div>
                    </Link>
                  ))}
                {(data?.topCustomers ?? []).filter(c => parseFloat(String(c.totalDue)) > 0).length === 0 && (
                  <div className="p-6 text-center text-slate-400 text-sm">No pending dues 🎉</div>
                )}
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold text-slate-700">Recent Expenses</h3>
                <Link href="/expenses" className="text-blue-600 text-xs hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              <div className="divide-y">
                {(data?.recentExpenses ?? []).map((e) => (
                  <Link
                    key={e.id}
                    href={`/expenses/${e.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <div className="font-medium text-sm text-slate-800">{e.expenseCode}</div>
                      <div className="text-xs text-slate-500">{e.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-700">{formatCurrency(e.amount)}</div>
                      <div className="text-xs text-slate-400 mt-0.5 capitalize">{e.status}</div>
                    </div>
                  </Link>
                ))}
                {(!data?.recentExpenses || data.recentExpenses.length === 0) && (
                  <div className="p-6 text-center text-slate-400 text-sm">No expenses recorded yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
