"use client";
import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Trash2, AlertTriangle, Search, ShoppingBag, Users, CreditCard, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUSES, PAYMENT_METHODS } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

type DataType = "orders" | "customers" | "payments" | "expenses";

interface Counts {
  customers: number;
  orders: number;
  orderItems: number;
  payments: number;
  expenses: number;
  journalEntries: number;
}
interface SampleRow {
  id: number;
  label: string;
  sub: string;
  amount: string | null;
}
interface Preview {
  type: DataType;
  counts: Counts;
  sample: SampleRow[];
  totalMatched: number;
  blocked: number;
  blockedReason: string | null;
}
interface Option {
  id: number;
  name: string;
  active?: boolean;
}

const TABS: { key: DataType; label: string; icon: React.ComponentType<{ size: number }> }[] = [
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "customers", label: "Customers", icon: Users },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "expenses", label: "Expenses", icon: Receipt },
];

const EXPENSE_STATUSES = ["pending", "overdue", "paid", "cancelled"];

const COUNT_LABELS: { key: keyof Counts; label: string }[] = [
  { key: "customers", label: "Customers" },
  { key: "orders", label: "Orders" },
  { key: "orderItems", label: "Order items" },
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "journalEntries", label: "Ledger entries" },
];

const emptyFilters = {
  from: "",
  to: "",
  status: "all",
  method: "all",
  dueState: "all",
  q: "",
  categoryAccountId: "",
  vendorId: "",
};

export default function DataCleanupPage() {
  const confirm = useConfirm();
  const [type, setType] = useState<DataType>("orders");
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<Option[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);

  useEffect(() => {
    fetch("/api/expense-categories").then((r) => r.json()).then((rows: Option[]) =>
      setCategories(rows.filter((r) => r.active !== false))
    );
    fetch("/api/vendors").then((r) => r.json()).then((rows: Option[]) =>
      setVendors(rows.filter((r) => r.active !== false))
    );
  }, []);

  // Any filter or tab change invalidates the preview — deleting against a
  // stale count is exactly the mistake this screen exists to prevent.
  const update = (key: keyof typeof emptyFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPreview(null);
  };

  const switchType = (next: DataType) => {
    setType(next);
    setFilters({ ...emptyFilters });
    setPreview(null);
  };

  const runPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, filters, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not load preview");
        return;
      }
      setPreview(data);
    } finally {
      setLoading(false);
    }
  }, [type, filters]);

  const runDelete = async () => {
    if (!preview || preview.totalMatched === 0) return;
    const typeLabel = TABS.find((t) => t.key === type)?.label.toLowerCase() ?? type;
    const extras = COUNT_LABELS.filter((c) => c.key !== type && preview.counts[c.key] > 0)
      .map((c) => `${preview.counts[c.key]} ${c.label.toLowerCase()}`)
      .join(", ");

    const ok = await confirm({
      title: `Delete ${preview.totalMatched} ${typeLabel}?`,
      message: (
        <div className="space-y-2">
          <p>
            This permanently removes <strong>{preview.totalMatched} {typeLabel}</strong>
            {extras ? <> and everything attached to them — {extras}.</> : "."}
          </p>
          <p className="text-red-600 font-medium">This cannot be undone.</p>
        </div>
      ),
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, filters, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Delete failed");
        return;
      }
      toast.success(`Deleted ${data.totalMatched} ${typeLabel}`);
      setPreview(null);
    } finally {
      setDeleting(false);
    }
  };

  const dateLabel = type === "customers" ? "Joined between" : type === "expenses" ? "Expense date" : "Created between";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Trash2 size={22} className="text-red-600" />
            <h1 className="text-2xl font-bold text-slate-800">Bulk Data Cleanup</h1>
          </div>
          <p className="text-sm text-slate-500 mb-5">
            Filter records, preview exactly what matches, then delete them permanently.
          </p>

          <div className="flex gap-3 items-start bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <div className="font-semibold mb-0.5">Deletions here are permanent</div>
              Deleted orders and customers take their items and payments with them, and the matching
              ledger entries are removed so the books stay balanced. Outstanding dues are recalculated
              automatically afterwards.
            </div>
          </div>

          {/* Data type tabs */}
          <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-xl p-1 shadow-sm flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchType(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === t.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
            <h2 className="font-semibold text-slate-700 mb-4 text-sm">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{dateLabel}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => update("from", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => update("to", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Leave both empty to match every date.</p>
              </div>

              {type === "orders" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => update("status", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Any status</option>
                      {ORDER_STATUSES.map((s: string) => (
                        <option key={s} value={s} className="capitalize">{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Payment state</label>
                    <select
                      value={filters.dueState}
                      onChange={(e) => update("dueState", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Any</option>
                      <option value="due">Has outstanding due</option>
                      <option value="paid">Fully paid</option>
                    </select>
                  </div>
                </>
              )}

              {type === "customers" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Name or phone contains</label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={filters.q}
                        onChange={(e) => update("q", e.target.value)}
                        placeholder="e.g. test"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Outstanding due</label>
                    <select
                      value={filters.dueState}
                      onChange={(e) => update("dueState", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Any</option>
                      <option value="due">Owes money</option>
                      <option value="paid">No dues</option>
                    </select>
                  </div>
                </>
              )}

              {type === "payments" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
                  <select
                    value={filters.method}
                    onChange={(e) => update("method", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Any method</option>
                    {PAYMENT_METHODS.map((m: string) => (
                      <option key={m} value={m} className="capitalize">{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {type === "expenses" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => update("status", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">Any status</option>
                      {EXPENSE_STATUSES.map((s) => (
                        <option key={s} value={s} className="capitalize">{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select
                      value={filters.categoryAccountId}
                      onChange={(e) => update("categoryAccountId", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Any category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
                    <select
                      value={filters.vendorId}
                      onChange={(e) => update("vendorId", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Any vendor</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
              <button
                onClick={runPreview}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              >
                <Search size={14} /> {loading ? "Checking..." : "Preview matches"}
              </button>
              <button
                onClick={() => { setFilters({ ...emptyFilters }); setPreview(null); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="font-semibold text-slate-700">
                    {preview.totalMatched} record(s) match
                  </h2>
                  <p className="text-xs text-slate-400">
                    {preview.totalMatched === 0
                      ? "Nothing matches these filters."
                      : "Review below, then delete."}
                  </p>
                  {preview.blocked > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      {preview.blocked} more matched but will be kept — {preview.blockedReason}.
                    </p>
                  )}
                </div>
                <button
                  onClick={runDelete}
                  disabled={preview.totalMatched === 0 || deleting}
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {deleting ? "Deleting..." : `Delete ${preview.totalMatched}`}
                </button>
              </div>

              {preview.totalMatched > 0 && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-slate-50 border-b">
                    {COUNT_LABELS.filter((c) => preview.counts[c.key] > 0).map((c) => (
                      <div key={c.key} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                        <div className="text-lg font-bold text-slate-800">{preview.counts[c.key]}</div>
                        <div className="text-xs text-slate-500">{c.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {preview.sample.map((row) => (
                      <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{row.label}</div>
                          <div className="text-xs text-slate-500 truncate">{row.sub}</div>
                        </div>
                        {row.amount != null && (
                          <div className="text-sm font-medium text-slate-600 shrink-0 ml-3">
                            {formatCurrency(row.amount)}
                          </div>
                        )}
                      </div>
                    ))}
                    {preview.totalMatched > preview.sample.length && (
                      <div className="px-4 py-2.5 text-xs text-slate-400">
                        …and {preview.totalMatched - preview.sample.length} more not shown
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
