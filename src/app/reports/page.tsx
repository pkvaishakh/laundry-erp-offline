"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Calendar, Download, Printer, FileText, TrendingUp, Users, CreditCard, ShoppingBag, Receipt, Scale, Landmark, BookOpen, Clock } from "lucide-react";
import { formatCurrency, formatDate, getTodayDate, EXPENSE_STATUS_COLORS, EXPENSE_STATUS_LABELS } from "@/lib/utils";
import { useReactToPrint } from "react-to-print";
import Link from "next/link";

type ReportType = "orders" | "payments" | "dues" | "sales" | "expenses" | "trial-balance" | "balance-sheet" | "general-ledger" | "ap-aging";

interface OrderRow {
  id: number; orderCode: string; status: string; deliveryDate: string;
  totalAmount: string; paidAmount: string; dueAmount: string; createdAt: string;
  customerName: string; customerPhone: string;
}
interface PaymentRow {
  id: number; orderId: number | null; amount: string; method: string;
  note: string | null; paymentType: string; createdAt: string;
  customerName: string; customerPhone: string;
}
interface DueRow {
  id: number; name: string; phone: string; address: string | null;
  totalDue: string; orderCount: number; lastOrder: string;
}
interface SalesRow {
  service_name: string; unit: string; total_qty: string; total_revenue: string; order_count: number;
}
interface ExpenseRow {
  id: number; expenseCode: string; date: string; amount: string; description: string;
  paymentMethod: string; derivedStatus: string; categoryName: string; vendorName: string | null;
}
interface TrialBalanceRow {
  id: number; code: string; name: string; type: string; totalDebit: number; totalCredit: number; balance: number;
}
interface BalanceSheetRow {
  section: string; name: string; amount: number;
}
interface GeneralLedgerRow {
  id: number; journalEntryId: number; entryDate: string; reference: string; entryDescription: string;
  accountName: string; accountCode: string; debit: string; credit: string; runningBalance: number;
}
interface ApAgingRow {
  id: number; expenseCode: string; description: string; vendorName: string | null;
  amount: string; dueDate: string | null; bucket: string;
}

type AnyRow = OrderRow | PaymentRow | DueRow | SalesRow | ExpenseRow | TrialBalanceRow | BalanceSheetRow | GeneralLedgerRow | ApAgingRow;

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

const NO_DATE_FILTER_TABS: ReportType[] = ["dues", "trial-balance", "balance-sheet", "ap-aging"];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportType>("orders");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(getTodayDate());
  // Summary shapes vary per report type (numbers, booleans, nested category
  // breakdowns) so this is intentionally loose rather than cast at every call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<{ rows: AnyRow[]; summary?: Record<string, any>; total?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Report-${tab}-${fromDate}-${toDate}`,
  });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ type: tab, from: fromDate, to: toDate });
    const res = await fetch(`/api/reports?${params}`);
    setData(await res.json());
    setLoading(false);
  }, [tab, fromDate, toDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const tabs: { key: ReportType; label: string; icon: React.ComponentType<{ size: number }> }[] = [
    { key: "orders", label: "Orders Report", icon: ShoppingBag },
    { key: "payments", label: "Payments Ledger", icon: CreditCard },
    { key: "dues", label: "Due Report", icon: Users },
    { key: "sales", label: "Sales Analysis", icon: TrendingUp },
    { key: "expenses", label: "Expense Report", icon: Receipt },
    { key: "trial-balance", label: "Trial Balance", icon: Scale },
    { key: "balance-sheet", label: "Balance Sheet", icon: Landmark },
    { key: "general-ledger", label: "General Ledger", icon: BookOpen },
    { key: "ap-aging", label: "AP Aging", icon: Clock },
  ];

  const exportCsv = useCallback((rows: Array<unknown>, filename: string) => {
    if (!rows.length) return;
    const typedRows = rows as Array<Record<string, unknown>>;
    const headers = Object.keys(typedRows[0]);
    const csvContent = [headers.join(","), ...typedRows.map((row) => headers.map((header) => {
      const value = row[header];
      const stringValue = value == null ? "" : String(value).replace(/\n/g, " ").replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }, []);

  const handleExport = () => {
    if (tab === "orders") {
      exportCsv(orderRows as Array<unknown>, `orders-${fromDate}-to-${toDate}.csv`);
      return;
    }
    if (tab === "payments") {
      exportCsv(paymentRows as Array<unknown>, `payments-${fromDate}-to-${toDate}.csv`);
      return;
    }
    if (tab === "dues") {
      exportCsv(dueRows as Array<unknown>, `dues-${fromDate}-to-${toDate}.csv`);
      return;
    }
    if (tab === "sales") {
      exportCsv(salesRows as Array<unknown>, `sales-${fromDate}-to-${toDate}.csv`);
      return;
    }
    if (tab === "expenses") {
      exportCsv(expenseRows as Array<unknown>, `expenses-${fromDate}-to-${toDate}.csv`);
      return;
    }
    if (tab === "trial-balance") {
      exportCsv(trialBalanceRows as Array<unknown>, `trial-balance-${toDate}.csv`);
      return;
    }
    if (tab === "balance-sheet") {
      exportCsv(balanceSheetRows as Array<unknown>, `balance-sheet-${toDate}.csv`);
      return;
    }
    if (tab === "general-ledger") {
      exportCsv(generalLedgerRows as Array<unknown>, `general-ledger-${fromDate}-to-${toDate}.csv`);
      return;
    }
    exportCsv(apAgingRows as Array<unknown>, `ap-aging-${toDate}.csv`);
  };

  const orderRows = (tab === "orders" ? (data?.rows ?? []) : []) as OrderRow[];
  const paymentRows = (tab === "payments" ? (data?.rows ?? []) : []) as PaymentRow[];
  const dueRows = (tab === "dues" ? (data?.rows ?? []) : []) as DueRow[];
  const salesRows = (tab === "sales" ? (data?.rows ?? []) : []) as SalesRow[];
  const expenseRows = (tab === "expenses" ? (data?.rows ?? []) : []) as ExpenseRow[];
  const trialBalanceRows = (tab === "trial-balance" ? (data?.rows ?? []) : []) as TrialBalanceRow[];
  const balanceSheetRows = (tab === "balance-sheet" ? (data?.rows ?? []) : []) as BalanceSheetRow[];
  const generalLedgerRows = (tab === "general-ledger" ? (data?.rows ?? []) : []) as GeneralLedgerRow[];
  const apAgingRows = (tab === "ap-aging" ? (data?.rows ?? []) : []) as ApAgingRow[];
  const summary = data?.summary;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileText size={22} className="text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={() => handlePrint()}
                className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
              >
                <Printer size={14} /> Print Report
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-xl p-1 shadow-sm flex-wrap">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Date Filters */}
          {!NO_DATE_FILTER_TABS.includes(tab) && (
            <div className="flex items-center gap-3 mb-4">
              <Calendar size={15} className="text-slate-400" />
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-slate-400 text-sm">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          {/* Orders Report */}
          {tab === "orders" && (
            <div>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Total Orders", value: summary.totalOrders, isNum: true },
                    { label: "Total Revenue", value: formatCurrency(summary.totalRevenue) },
                    { label: "Total Collected", value: formatCurrency(summary.totalCollected) },
                    { label: "Total Due", value: formatCurrency(summary.totalDue) },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                      <div className="text-xl font-bold text-slate-800">{c.isNum ? c.value : c.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Order</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Paid</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : orderRows.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : orderRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                        <td className="px-4 py-2">
                          <Link href={`/orders/${row.id}`} className="text-blue-600 hover:underline font-medium">{row.orderCode}</Link>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-slate-700">{row.customerName}</div>
                          <div className="text-xs text-slate-400">{row.customerPhone}</div>
                        </td>
                        <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(row.totalAmount)}</td>
                        <td className="px-4 py-2 text-right text-green-600">{formatCurrency(row.paidAmount)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${parseFloat(row.dueAmount) > 0 ? "text-red-600" : "text-slate-400"}`}>
                          {formatCurrency(row.dueAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payments Ledger */}
          {tab === "payments" && (
            <div>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Total Transactions", value: summary.totalPayments, isNum: true },
                    { label: "Total Amount", value: formatCurrency(summary.totalAmount) },
                    { label: "Cash", value: formatCurrency(summary.byCash) },
                    { label: "UPI", value: formatCurrency(summary.byUpi) },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                      <div className="text-xl font-bold text-slate-800">{c.isNum ? c.value : c.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Method</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Note</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : paymentRows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : paymentRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(row.createdAt)}</td>
                        <td className="px-4 py-2">
                          <div className="text-slate-700 font-medium">{row.customerName}</div>
                          <div className="text-xs text-slate-400">{row.customerPhone}</div>
                        </td>
                        <td className="px-4 py-2 capitalize">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            row.method === "cash" ? "bg-green-100 text-green-700" :
                            row.method === "upi" ? "bg-purple-100 text-purple-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{row.method}</span>
                        </td>
                        <td className="px-4 py-2 text-xs capitalize text-slate-500">{row.paymentType}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">{row.note ?? "—"}</td>
                        <td className="px-4 py-2 text-right font-semibold text-green-600">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {paymentRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-slate-50">
                        <td colSpan={5} className="px-4 py-2 font-semibold text-slate-700">Total</td>
                        <td className="px-4 py-2 text-right font-bold text-green-600">
                          {formatCurrency(paymentRows.reduce((s, r) => s + parseFloat(r.amount), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Due Report */}
          {tab === "dues" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                  <span className="text-red-600 font-bold text-lg">{formatCurrency(data?.total)}</span>
                  <span className="text-slate-500 text-sm ml-2">Total Outstanding</span>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Customer</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Orders</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Last Order</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Due Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : dueRows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">No outstanding dues 🎉</td></tr>
                    ) : dueRows.map((row, i) => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-2">
                          <Link href={`/customers/${row.id}`} className="font-medium text-blue-600 hover:underline">{row.name}</Link>
                          {row.address && <div className="text-xs text-slate-400">{row.address}</div>}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{row.phone}</td>
                        <td className="px-4 py-2 text-center">{row.orderCount}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{row.lastOrder ? formatDate(row.lastOrder) : "—"}</td>
                        <td className="px-4 py-2 text-right font-bold text-red-600">{formatCurrency(row.totalDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales Analysis */}
          {tab === "sales" && (
            <div className="space-y-6">
              {salesRows.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-4">Revenue by Service</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={salesRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="service_name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                      <Tooltip formatter={(v) => [`₹${Number(v).toFixed(2)}`, "Revenue"]} />
                      <Bar dataKey="total_revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Service</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Unit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Orders</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : salesRows.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : salesRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-800">{row.service_name}</td>
                        <td className="px-4 py-2 capitalize text-slate-500 text-xs">per {row.unit}</td>
                        <td className="px-4 py-2 text-right">{parseFloat(row.total_qty).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{row.order_count}</td>
                        <td className="px-4 py-2 text-right font-bold text-green-600">{formatCurrency(row.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {salesRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t bg-slate-50">
                        <td colSpan={4} className="px-4 py-2 font-semibold text-slate-700">Total Revenue</td>
                        <td className="px-4 py-2 text-right font-bold text-green-600">
                          {formatCurrency(salesRows.reduce((s, r) => s + parseFloat(r.total_revenue), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Expense Report */}
          {tab === "expenses" && (
            <div>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Total Expenses", value: formatCurrency(summary.totalExpenses as number) },
                    { label: "Paid", value: formatCurrency(summary.totalPaid as number) },
                    { label: "Pending / Payable", value: formatCurrency(summary.totalPending as number) },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                      <div className="text-xl font-bold text-slate-800">{c.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Expense</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vendor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : expenseRows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : expenseRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(row.date)}</td>
                        <td className="px-4 py-2">
                          <Link href={`/expenses/${row.id}`} className="text-blue-600 hover:underline font-medium">{row.expenseCode}</Link>
                          <div className="text-xs text-slate-400">{row.description}</div>
                        </td>
                        <td className="px-4 py-2 text-slate-600">{row.categoryName}</td>
                        <td className="px-4 py-2 text-slate-600">{row.vendorName ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            EXPENSE_STATUS_COLORS[row.derivedStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
                          }`}>
                            {EXPENSE_STATUS_LABELS[row.derivedStatus] ?? row.derivedStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trial Balance */}
          {tab === "trial-balance" && (
            <div>
              {summary && (
                <div className="flex items-center gap-3 mb-4">
                  <div className={`rounded-xl px-4 py-2 border ${summary.balanced ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <span className={`font-bold text-lg ${summary.balanced ? "text-green-600" : "text-red-600"}`}>
                      {summary.balanced ? "Balanced ✓" : "Not Balanced ✗"}
                    </span>
                    <span className="text-slate-500 text-sm ml-2">
                      Debit {formatCurrency(summary.sumDebit as number)} / Credit {formatCurrency(summary.sumCredit as number)}
                    </span>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Code</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Account</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Debit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Credit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : trialBalanceRows.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : trialBalanceRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500 font-mono">{row.code}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-2 text-xs capitalize text-slate-500">{row.type}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.totalDebit)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.totalCredit)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {tab === "balance-sheet" && (
            <div>
              {summary && (
                <div className="flex items-center gap-3 mb-4">
                  <div className={`rounded-xl px-4 py-2 border ${summary.balanced ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <span className={`font-bold text-lg ${summary.balanced ? "text-green-600" : "text-red-600"}`}>
                      {summary.balanced ? "Balanced ✓" : "Not Balanced ✗"}
                    </span>
                    <span className="text-slate-500 text-sm ml-2">
                      Assets {formatCurrency(summary.assets as number)} = Liabilities {formatCurrency(summary.liabilities as number)} + Equity {formatCurrency(summary.equity as number)}
                    </span>
                  </div>
                  {!summary.balanced && (
                    <Link href="/accounts" className="text-blue-600 hover:underline text-sm font-medium">
                      Close the accounting period →
                    </Link>
                  )}
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Section</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Account</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={3} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : balanceSheetRows.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs uppercase text-slate-400">{row.section}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* General Ledger */}
          {tab === "general-ledger" && (
            <div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Account</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Description</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Debit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Credit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : generalLedgerRows.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">No data</td></tr>
                    ) : generalLedgerRows.map((row, idx) => (
                      <tr key={`${row.journalEntryId}-${row.id}-${idx}`} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(row.entryDate)}</td>
                        <td className="px-4 py-2 text-xs font-mono text-slate-500">{row.reference}</td>
                        <td className="px-4 py-2 font-medium text-slate-700">{row.accountName}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">{row.entryDescription}</td>
                        <td className="px-4 py-2 text-right">{parseFloat(row.debit) > 0 ? formatCurrency(row.debit) : ""}</td>
                        <td className="px-4 py-2 text-right">{parseFloat(row.credit) > 0 ? formatCurrency(row.credit) : ""}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AP Aging */}
          {tab === "ap-aging" && (
            <div>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  {["Current", "1-30", "31-60", "61-90", "90+"].map(bucket => (
                    <div key={bucket} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                      <div className="text-lg font-bold text-slate-800">{formatCurrency(summary[bucket] as number)}</div>
                      <div className="text-xs text-slate-500 mt-1">{bucket} days</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Expense</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vendor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Due Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Bucket</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400">Loading...</td></tr>
                    ) : apAgingRows.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-400">No outstanding payables 🎉</td></tr>
                    ) : apAgingRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <Link href={`/expenses/${row.id}`} className="text-blue-600 hover:underline font-medium">{row.expenseCode}</Link>
                          <div className="text-xs text-slate-400">{row.description}</div>
                        </td>
                        <td className="px-4 py-2 text-slate-600">{row.vendorName ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{row.dueDate ? formatDate(row.dueDate) : "—"}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            row.bucket === "Current" ? "bg-green-100 text-green-700" :
                            row.bucket === "90+" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                          }`}>{row.bucket}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Print area */}
        <div className="hidden">
          <div ref={printRef} style={{ padding: "20px", fontFamily: "monospace", fontSize: "12px" }}>
            <h1 style={{ textAlign: "center", marginBottom: "10px" }}>
              {tabs.find(t => t.key === tab)?.label ?? "Report"}
            </h1>
            <p style={{ textAlign: "center", marginBottom: "20px" }}>
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
            {tab === "dues" && (
              <div>
                <p><strong>Total Outstanding: {formatCurrency(data?.total)}</strong></p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #000", padding: "4px" }}>Customer</th>
                      <th style={{ border: "1px solid #000", padding: "4px" }}>Phone</th>
                      <th style={{ border: "1px solid #000", padding: "4px" }}>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueRows.map(r => (
                      <tr key={r.id}>
                        <td style={{ border: "1px solid #000", padding: "4px" }}>{r.name}</td>
                        <td style={{ border: "1px solid #000", padding: "4px" }}>{r.phone}</td>
                        <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{formatCurrency(r.totalDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
