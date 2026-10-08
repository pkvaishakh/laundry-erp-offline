"use client";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { Search, Plus, Receipt } from "lucide-react";
import { formatCurrency, formatDate, EXPENSE_STATUS_COLORS, EXPENSE_STATUS_LABELS, EXPENSE_STATUSES } from "@/lib/utils";
import Pagination from "@/components/Pagination";

interface Expense {
  id: number;
  expenseCode: string;
  date: string;
  amount: string;
  description: string;
  paymentMethod: string;
  derivedStatus: string;
  categoryName: string;
  vendorName: string | null;
}

interface ExpenseSummary {
  total: number;
  paid: number;
  pending: number;
  overdueCount: number;
}

const STATUS_OPTIONS = ["all", ...EXPENSE_STATUSES];
const PAGE_SIZE = 20;

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [summary, setSummary] = useState<ExpenseSummary>({ total: 0, paid: 0, pending: 0, overdueCount: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    const res = await fetch(`/api/expenses?${params}`);
    const data = await res.json();
    setExpenses(data.rows);
    setRowTotal(data.total);
    setSummary(data.summary);
    setLoading(false);
  }, [statusFilter, search, page]);

  useEffect(() => {
    const t = setTimeout(fetchExpenses, 300);
    return () => clearTimeout(t);
  }, [fetchExpenses]);

  const { total, paid, pending, overdueCount } = summary;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Receipt size={22} className="text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
            </div>
            <Link
              href="/expenses/new"
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} /> New Expense
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="text-xl font-bold text-slate-800">{formatCurrency(total)}</div>
              <div className="text-xs text-slate-500 mt-1">Total Expenses</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="text-xl font-bold text-green-600">{formatCurrency(paid)}</div>
              <div className="text-xs text-slate-500 mt-1">Paid</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="text-xl font-bold text-yellow-600">{formatCurrency(pending)}</div>
              <div className="text-xs text-slate-500 mt-1">Pending / Payable</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
              <div className="text-xl font-bold text-red-600">{overdueCount}</div>
              <div className="text-xs text-slate-500 mt-1">Overdue</div>
            </div>
          </div>

          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search expenses, vendors..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    statusFilter === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Expense</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Method</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">Loading...</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">No expenses found</td></tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/expenses/${e.id}`} className="font-medium text-blue-600 hover:underline">
                          {e.expenseCode}
                        </Link>
                        <div className="text-xs text-slate-400">{formatDate(e.date)} · {e.description}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.categoryName}</td>
                      <td className="px-4 py-3 text-slate-600">{e.vendorName ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-slate-500 text-xs">{e.paymentMethod}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(e.amount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            EXPENSE_STATUS_COLORS[e.derivedStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}
                        >
                          {EXPENSE_STATUS_LABELS[e.derivedStatus] ?? e.derivedStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={rowTotal} onPageChange={setPage} itemLabel="expense(s)" />
        </div>
      </main>
    </div>
  );
}
