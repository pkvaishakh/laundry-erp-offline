"use client";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import Link from "next/link";
import { Search, Plus, Edit3, CreditCard, User, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Pagination from "@/components/Pagination";
import toast from "react-hot-toast";
import { useOrdersChanged, notifyOrdersChanged } from "@/lib/ordersSync";

interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  totalDue: string;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", address: "" });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");

  const fetchCustomers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    const res = await fetch(`/api/customers?${params}`);
    const data = await res.json();
    setCustomers(data.rows);
    setTotal(data.total);
    setTotalOutstanding(data.summary.totalOutstanding);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    const t = setTimeout(() => fetchCustomers(), 300);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  // Dues change whenever an order or payment is made — refresh on those too.
  useOrdersChanged(useCallback(() => fetchCustomers(true), [fetchCustomers]));

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setFormData({ name: c.name, phone: c.phone, address: c.address ?? "" });
    setShowModal(true);
  };

  const saveCustomer = async () => {
    if (!formData.name || !formData.phone) { toast.error("Name and phone required"); return; }
    if (editCustomer) {
      await fetch(`/api/customers/${editCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      toast.success("Customer updated!");
    } else {
      await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      toast.success("Customer added!");
    }
    setShowModal(false);
    fetchCustomers();
  };

  const openPay = (c: Customer) => {
    setPayCustomer(c);
    setPayAmount(String(parseFloat(c.totalDue).toFixed(2)));
    setPayMethod("cash");
    setPayNote("");
    setShowPayModal(true);
  };

  const exportCustomers = async () => {
    // Export every matching customer, not just the current page — the table
    // only ever holds one page's worth once pagination is in play.
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("limit", String(Math.max(total, 1)));
    const res = await fetch(`/api/customers?${params}`);
    const data = await res.json();
    const allMatching: Customer[] = data.rows;

    if (!allMatching.length) {
      toast.error("No customer data to export");
      return;
    }

    const headers = ["id", "name", "phone", "address", "totalDue", "createdAt"];
    const csvRows = [headers.join(","), ...allMatching.map((customer) => headers.map((header) => {
      const value = customer[header as keyof Customer];
      const stringValue = value == null ? "" : String(value).replace(/\n/g, " ").replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(","))];

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "customers.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const collectOutstanding = async () => {
    if (!payCustomer) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter valid amount"); return; }
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: payCustomer.id,
        amount,
        method: payMethod,
        note: payNote || "Outstanding payment",
        paymentType: "outstanding",
      }),
    });
    notifyOrdersChanged();
    toast.success(`Outstanding payment of ${formatCurrency(amount)} collected`);
    setShowPayModal(false);
    fetchCustomers();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={exportCustomers}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <CreditCard size={16} /> Export CSV
              </button>
              <Link
                href="/customers/new"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={16} /> Add Customer
              </Link>
            </div>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-md"
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding Due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">Loading...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">No customers found</td></tr>
                ) : customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                        <User size={13} className="text-slate-400" /> {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.address ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${parseFloat(c.totalDue) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {parseFloat(c.totalDue) > 0 ? formatCurrency(c.totalDue) : "No dues"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/customers/${c.id}`}
                          className="text-slate-400 hover:text-blue-600"
                          title="View Customer"
                        >
                          <Eye size={15} />
                        </Link>
                        <button
                          onClick={() => openEdit(c)}
                          className="text-slate-400 hover:text-blue-600"
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>
                        {parseFloat(c.totalDue) > 0 && (
                          <button
                            onClick={() => openPay(c)}
                            className="text-slate-400 hover:text-green-600"
                            title="Collect Outstanding"
                          >
                            <CreditCard size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div className="mt-4 text-sm text-slate-500 text-right">
              <span className="font-medium text-red-600">
                Total Outstanding: {formatCurrency(totalOutstanding)}
              </span>
            </div>
          )}

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="customer(s)" />
        </div>
      </main>

      {/* Add/Edit Customer Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editCustomer ? "Edit Customer" : "Add Customer"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Customer name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone *</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98765 43210"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Customer address"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={saveCustomer}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editCustomer ? "Update Customer" : "Add Customer"}
          </button>
        </div>
      </Modal>

      {/* Outstanding Payment Modal */}
      <Modal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        title={`Collect Outstanding - ${payCustomer?.name}`}
      >
        <div className="space-y-4">
          <div className="bg-red-50 rounded-lg p-3 text-sm">
            <span className="text-slate-600">Total Outstanding: </span>
            <span className="font-bold text-red-600">{formatCurrency(payCustomer?.totalDue)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {["cash", "card", "upi", "other"].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`py-2 rounded-lg text-sm capitalize border transition-colors ${
                    payMethod === m ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Payment note..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={collectOutstanding}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700"
          >
            Collect ₹{payAmount || "0"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
