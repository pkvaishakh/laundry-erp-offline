"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import { Landmark, Plus, Edit3, Ban, RotateCcw, Lock, Scale } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/utils";
import toast from "react-hot-toast";

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
  active: boolean;
  balance: number;
  createdAt: string;
}

const CORE_ACCOUNT_CODES = ["CASH", "BANK", "AP", "CAPITAL", "SALES"];

export default function AccountsPage() {
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [form, setForm] = useState({ name: "", type: "expense" as string });
  const [closing, setClosing] = useState(false);

  const fetchAccounts = async () => {
    setLoading(true);
    const res = await fetch("/api/accounts");
    setAccounts(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, []);

  const closePeriod = async () => {
    const ok = await confirm({
      title: "Close accounting period?",
      message:
        "Every income and expense account's balance since the last close will be swept into Owner's Capital via a closing journal entry. This is the standard step needed before the Balance Sheet will show as balanced.",
      confirmLabel: "Close period",
      tone: "primary",
    });
    if (!ok) return;
    setClosing(true);
    const res = await fetch("/api/accounts/close-period", { method: "POST" });
    const data = await res.json();
    setClosing(false);
    if (!res.ok) { toast.error(data.error ?? "Failed to close period"); return; }
    if (!data.entry) { toast.success(data.message ?? "Nothing to close"); return; }
    toast.success(`Period closed — net ${data.netIncome >= 0 ? "income" : "loss"} of ${formatCurrency(Math.abs(data.netIncome))} swept to Capital`);
    fetchAccounts();
  };

  const openAdd = () => {
    setEditAccount(null);
    setForm({ name: "", type: "expense" });
    setShowModal(true);
  };

  const openEdit = (a: Account) => {
    setEditAccount(a);
    setForm({ name: a.name, type: a.type });
    setShowModal(true);
  };

  const saveAccount = async () => {
    if (!form.name.trim()) { toast.error("Account name is required"); return; }
    if (editAccount) {
      const res = await fetch(`/api/accounts/${editAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to update account"); return; }
      toast.success("Account updated!");
    } else {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to add account"); return; }
      toast.success("Account added!");
    }
    setShowModal(false);
    fetchAccounts();
  };

  const deactivate = async (a: Account) => {
    const ok = await confirm({
      title: "Deactivate account?",
      message: `${a.name} (${a.code}) will be hidden from new transactions. Its ledger history and balance are kept.`,
      confirmLabel: "Deactivate",
    });
    if (!ok) return;
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error ?? "Failed to deactivate account"); return; }
    toast.success("Account deactivated");
    fetchAccounts();
  };

  const reactivate = async (a: Account) => {
    const res = await fetch(`/api/accounts/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) { toast.error("Failed to reactivate account"); return; }
    toast.success("Account reactivated");
    fetchAccounts();
  };

  const groups = ACCOUNT_TYPES.map((type) => ({
    type,
    label: ACCOUNT_TYPE_LABELS[type],
    accounts: accounts.filter((a) => a.type === type),
    total: accounts.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0),
  }));

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Landmark size={22} className="text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-800">Chart of Accounts</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={closePeriod}
                disabled={closing}
                className="flex items-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                <Scale size={16} /> {closing ? "Closing..." : "Close Period"}
              </button>
              <button
                onClick={openAdd}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={16} /> Add Account
              </button>
            </div>
          </div>

          {/* Balance summary by type */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {groups.map((g) => (
              <div key={g.type} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="text-lg font-bold text-slate-800">{formatCurrency(g.total)}</div>
                <div className="text-xs text-slate-500 mt-1">{g.label}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <div key={g.type}>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.label}</h3>
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Code</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Balance</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.accounts.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-6 text-slate-400 text-sm">No {g.label.toLowerCase()} accounts</td></tr>
                        ) : g.accounts.map((a) => {
                          const isCore = CORE_ACCOUNT_CODES.includes(a.code);
                          return (
                            <tr key={a.id} className={`hover:bg-slate-50 ${!a.active ? "opacity-50" : ""}`}>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.code}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  {a.name}
                                  {isCore && (
                                    <span title="Core system account">
                                      <Lock size={11} className="text-slate-400" />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  a.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                                }`}>
                                  {a.active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-right font-semibold ${a.balance < 0 ? "text-red-600" : "text-slate-800"}`}>
                                {formatCurrency(a.balance)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => openEdit(a)} className="text-slate-400 hover:text-blue-600" title="Edit name">
                                    <Edit3 size={15} />
                                  </button>
                                  {a.active ? (
                                    !isCore && (
                                      <button onClick={() => deactivate(a)} className="text-slate-400 hover:text-red-600" title="Deactivate">
                                        <Ban size={15} />
                                      </button>
                                    )
                                  ) : (
                                    <button onClick={() => reactivate(a)} className="text-slate-400 hover:text-green-600" title="Reactivate">
                                      <RotateCcw size={15} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editAccount ? "Edit Account" : "Add Account"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Petty Cash, HDFC Bank"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter") saveAccount(); }}
            />
          </div>
          {!editAccount && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`py-2 rounded-lg text-sm capitalize border transition-colors ${
                      form.type === t ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {ACCOUNT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">A ledger code is generated automatically from the name.</p>
            </div>
          )}
          {editAccount && (
            <div className="text-xs text-slate-400">
              Code <span className="font-mono">{editAccount.code}</span> and type ({ACCOUNT_TYPE_LABELS[editAccount.type]}) can&apos;t be changed once created.
            </div>
          )}
          <button
            onClick={saveAccount}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editAccount ? "Update Account" : "Add Account"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
