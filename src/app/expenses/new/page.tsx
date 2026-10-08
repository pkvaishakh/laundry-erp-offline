"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { Receipt, Banknote, Landmark, Clock } from "lucide-react";
import { getTodayDate, EXPENSE_PAYMENT_METHODS } from "@/lib/utils";
import toast from "react-hot-toast";

interface Category {
  id: number;
  name: string;
  active: boolean;
}
interface Vendor {
  id: number;
  name: string;
  active: boolean;
}

const METHOD_META: Record<string, { label: string; icon: typeof Banknote }> = {
  cash: { label: "Cash", icon: Banknote },
  bank: { label: "Bank Transfer", icon: Landmark },
  credit: { label: "Credit (Due Later)", icon: Clock },
};

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    date: getTodayDate(),
    amount: "",
    description: "",
    categoryAccountId: "",
    vendorId: "",
    paymentMethod: "cash" as (typeof EXPENSE_PAYMENT_METHODS)[number],
    dueDate: "",
  });

  useEffect(() => {
    fetch("/api/expense-categories").then((r) => r.json()).then(setCategories);
    fetch("/api/vendors").then((r) => r.json()).then(setVendors);
  }, []);

  const submit = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount greater than 0"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    if (!form.categoryAccountId) { toast.error("Select an expense category"); return; }
    if (form.paymentMethod === "credit" && !form.dueDate) { toast.error("Due date is required for a credit/payable expense"); return; }

    setSubmitting(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        amount,
        description: form.description.trim(),
        categoryAccountId: parseInt(form.categoryAccountId),
        vendorId: form.vendorId ? parseInt(form.vendorId) : null,
        paymentMethod: form.paymentMethod,
        dueDate: form.paymentMethod === "credit" ? form.dueDate : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Failed to create expense" }));
      toast.error(data.error ?? "Failed to create expense");
      setSubmitting(false);
      return;
    }

    const expense = await res.json();
    toast.success("Expense recorded!");
    router.push(`/expenses/${expense.id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Receipt size={22} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-800">New Expense</h1>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.date}
                  max={getTodayDate()}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 border border-slate-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Monthly shop rent for August"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.categoryAccountId}
                  onChange={(e) => setForm({ ...form, categoryAccountId: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category...</option>
                  {categories.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
                <select
                  value={form.vendorId}
                  onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None</option>
                  {vendors.filter((v) => v.active).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {EXPENSE_PAYMENT_METHODS.map((m) => {
                  const meta = METHOD_META[m];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, paymentMethod: m })}
                      className={`flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-medium border transition-colors ${
                        form.paymentMethod === m
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={16} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {form.paymentMethod === "credit" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Due Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.dueDate}
                  min={form.date}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">Due date must be within 90 days of the expense date.</p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving..." : "Record Expense"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
