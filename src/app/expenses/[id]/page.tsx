"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import { Receipt, Banknote, Landmark, XCircle, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate, EXPENSE_STATUS_COLORS, EXPENSE_STATUS_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";

interface JournalLine {
  id: number;
  accountId: number;
  accountName: string;
  accountCode: string;
  debit: string;
  credit: string;
}
interface JournalEntry {
  id: number;
  reference: string;
  entryDate: string;
  description: string | null;
  sourceType: string;
  lines: JournalLine[];
}
interface ExpenseDetail {
  id: number;
  expenseCode: string;
  date: string;
  amount: string;
  description: string;
  paymentMethod: string;
  derivedStatus: string;
  status: string;
  dueDate: string | null;
  paidDate: string | null;
  paidMethod: string | null;
  categoryName: string;
  vendorName: string | null;
  journalEntries: JournalEntry[];
}

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("cash");
  const [busy, setBusy] = useState(false);

  const fetchExpense = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/expenses/${id}`);
    if (res.ok) setExpense(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchExpense(); }, [fetchExpense]);

  const markPaid = async () => {
    setBusy(true);
    const res = await fetch(`/api/expenses/${id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: payMethod }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to mark as paid");
    } else {
      toast.success("Expense marked as paid");
      setShowPayModal(false);
      fetchExpense();
    }
    setBusy(false);
  };

  const voidExpense = async () => {
    const ok = await confirm({
      title: "Void this expense?",
      message:
        "A reversing entry will be posted and the original journal entries will remain in the audit trail.",
      confirmLabel: "Void expense",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/expenses/${id}/void`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to void expense");
    } else {
      toast.success("Expense voided");
      fetchExpense();
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-slate-400">Loading...</main>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-slate-400">Expense not found</main>
      </div>
    );
  }

  const canAct = expense.derivedStatus === "pending" || expense.derivedStatus === "overdue";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Receipt size={22} className="text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{expense.expenseCode}</h1>
                <p className="text-sm text-slate-500">{formatDate(expense.date)}</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
                EXPENSE_STATUS_COLORS[expense.derivedStatus] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {EXPENSE_STATUS_LABELS[expense.derivedStatus] ?? expense.derivedStatus}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Amount</div>
                <div className="text-xl font-bold text-slate-800">{formatCurrency(expense.amount)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Category</div>
                <div className="font-medium text-slate-700">{expense.categoryName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Vendor</div>
                <div className="font-medium text-slate-700">{expense.vendorName ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Payment Method</div>
                <div className="font-medium text-slate-700 capitalize">{expense.paymentMethod}</div>
              </div>
              {expense.dueDate && (
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Due Date</div>
                  <div className="font-medium text-slate-700">{formatDate(expense.dueDate)}</div>
                </div>
              )}
              {expense.paidDate && (
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Paid</div>
                  <div className="font-medium text-slate-700">
                    {formatDate(expense.paidDate)} via {expense.paidMethod}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Description</div>
                <div className="text-slate-700">{expense.description}</div>
              </div>
            </div>

            {canAct && (
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
                {expense.paymentMethod === "credit" && (
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    <CheckCircle2 size={15} /> Mark as Paid
                  </button>
                )}
                <button
                  onClick={voidExpense}
                  disabled={busy}
                  className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50"
                >
                  <XCircle size={15} /> Void
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50 font-semibold text-slate-700 text-sm">
              Journal Entries (Audit Trail)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Reference</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Account</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Debit</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expense.journalEntries.flatMap((entry) =>
                  entry.lines.map((line, i) => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-500">{i === 0 ? entry.reference : ""}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{i === 0 ? formatDate(entry.entryDate) : ""}</td>
                      <td className="px-4 py-2 text-slate-700">{line.accountName}</td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {parseFloat(line.debit) > 0 ? formatCurrency(line.debit) : ""}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {parseFloat(line.credit) > 0 ? formatCurrency(line.credit) : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Mark as Paid">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Settle {formatCurrency(expense.amount)} from Accounts Payable using:</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPayMethod("cash")}
              className={`flex flex-col items-center gap-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                payMethod === "cash" ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Banknote size={16} /> Cash
            </button>
            <button
              onClick={() => setPayMethod("bank")}
              className={`flex flex-col items-center gap-1 py-3 rounded-lg text-sm font-medium border transition-colors ${
                payMethod === "bank" ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Landmark size={16} /> Bank
            </button>
          </div>
          <button
            onClick={markPaid}
            disabled={busy}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Processing..." : "Confirm Payment"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
