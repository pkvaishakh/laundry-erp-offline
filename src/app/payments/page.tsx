"use client";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import { Search, Calendar, CreditCard, TrendingUp } from "lucide-react";
import { formatCurrency, formatDate, getTodayDate } from "@/lib/utils";
import Pagination from "@/components/Pagination";
import Link from "next/link";

interface Payment {
  id: number;
  orderId: number | null;
  customerId: number;
  amount: string;
  method: string;
  note: string | null;
  paymentType: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
}

interface PaymentSummary {
  total: number;
  byCash: number;
  byCard: number;
  byUpi: number;
}

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentSummary>({ total: 0, byCash: 0, byCard: 0, byUpi: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(getTodayDate());
  const [toDate, setToDate] = useState(getTodayDate());
  const [search, setSearch] = useState("");

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (search) params.set("q", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    const res = await fetch(`/api/payments?${params}`);
    const data = await res.json();
    setPayments(data.rows);
    setRowTotal(data.total);
    setSummary(data.summary);
    setLoading(false);
  }, [fromDate, toDate, search, page]);

  useEffect(() => {
    const t = setTimeout(fetchPayments, 300);
    return () => clearTimeout(t);
  }, [fetchPayments]);

  const { total, byCash, byUpi, byCard } = summary;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search customer..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-slate-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total Collected", value: total, color: "text-green-600", bg: "bg-green-50" },
              { label: "Cash", value: byCash, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "UPI", value: byUpi, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "Card", value: byCard, color: "text-orange-600", bg: "bg-orange-50" },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl p-3 border border-slate-100`}>
                <div className={`text-xl font-bold ${c.color}`}>{formatCurrency(c.value)}</div>
                <div className="text-xs text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Note</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">Loading...</td></tr>
                ) : payments.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400">No payments found</td></tr>
                ) : payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${p.customerId}`} className="font-medium text-blue-600 hover:underline">
                        {p.customerName}
                      </Link>
                      <div className="text-xs text-slate-400">{p.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.orderId ? (
                        <Link href={`/orders/${p.orderId}`} className="text-blue-600 hover:underline text-xs">
                          #{p.orderId}
                        </Link>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.method === "cash" ? "bg-green-100 text-green-700" :
                        p.method === "upi" ? "bg-purple-100 text-purple-700" :
                        p.method === "card" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 capitalize">{p.paymentType}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{p.note ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              {rowTotal > 0 && (
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-slate-700">Total ({rowTotal} transactions)</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600">{formatCurrency(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={rowTotal} onPageChange={setPage} itemLabel="payment(s)" />
        </div>
      </main>
    </div>
  );
}
