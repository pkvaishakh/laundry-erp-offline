"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { Search, Plus, MessageCircle, Package, Send, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate, ORDER_STATUSES, openWhatsAppChat } from "@/lib/utils";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import OrderDetailDrawer from "@/components/OrderDetailDrawer";
import Pagination from "@/components/Pagination";
import toast from "react-hot-toast";
import { useOrdersChanged, notifyOrdersChanged } from "@/lib/ordersSync";

interface Order {
  id: number;
  orderCode: string;
  status: string;
  deliveryDate: string;
  shelfNumber: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerId: number;
  notes: string | null;
}

const STATUS_OPTIONS = ["all", ...ORDER_STATUSES];
const PAGE_SIZE = 20;

export default function OrdersPage() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [dueFilter, setDueFilter] = useState<"all" | "due" | "paid">("all");
  const [shelfFilter, setShelfFilter] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showBulkWA, setShowBulkWA] = useState(false);
  const [bulkWAStatus, setBulkWAStatus] = useState("ready");
  const [bulkMessages, setBulkMessages] = useState<{ phone: string; customerName: string; orderCode: string; message: string; whatsappUrl: string }[]>([]);
  const [drawerOrderId, setDrawerOrderId] = useState<number | null>(null);

  // Refetches can overlap (filter debounce + focus/visibility + cross-window
  // notifications); only the latest request may update the list, so a slower,
  // older response can't overwrite a newer one with stale rows.
  const requestSeq = useRef(0);

  const fetchOrders = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("q", search);
    if (orderDateFrom) params.set("from", orderDateFrom);
    if (orderDateTo) params.set("to", orderDateTo);
    if (deliveryDateFrom) params.set("deliveryFrom", deliveryDateFrom);
    if (deliveryDateTo) params.set("deliveryTo", deliveryDateTo);
    if (dueFilter !== "all") params.set("due", dueFilter);
    if (shelfFilter) params.set("shelfNumber", shelfFilter);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    try {
      const res = await fetch(`/api/orders?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      setOrders(data.rows);
      setTotal(data.total);
    } catch {
      if (seq === requestSeq.current) toast.error("Couldn't load orders");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [statusFilter, search, orderDateFrom, orderDateTo, deliveryDateFrom, deliveryDateTo, dueFilter, shelfFilter, page]);

  const hasExtraFilters = !!(orderDateFrom || orderDateTo || deliveryDateFrom || deliveryDateTo || dueFilter !== "all" || shelfFilter);
  const clearExtraFilters = () => {
    setOrderDateFrom(""); setOrderDateTo("");
    setDeliveryDateFrom(""); setDeliveryDateTo("");
    setDueFilter("all"); setShelfFilter("");
    setPage(1);
  };

  // Any filter/search change should snap back to page 1 rather than leaving
  // the user stranded on a now out-of-range page — set alongside each filter
  // setter (below) instead of in an effect, since this is UI state derived
  // from the action that changed it, not a sync with an external system.

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(setSettings);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchOrders(), 300);
    return () => clearTimeout(t);
  }, [fetchOrders]);

  // Refresh when an order is edited in another tab (e.g. /orders/2), or when
  // returning to this tab / a back-forward-cached copy of this page.
  useOrdersChanged(useCallback(() => fetchOrders(true), [fetchOrders]));

  const updateStatus = async (orderId: number, status: string) => {
    await fetch(`/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    notifyOrdersChanged();
    toast.success(`Order status updated to ${status}`);
    fetchOrders();
  };

  const deleteOrder = async (order: Order) => {
    const ok = await confirm({
      title: "Delete order?",
      message: `Order ${order.orderCode} will be permanently deleted. This cannot be undone.`,
      confirmLabel: "Delete order",
    });
    if (!ok) return;
    const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete order");
      return;
    }
    notifyOrdersChanged();
    toast.success("Order deleted");
    fetchOrders();
  };

  const loadBulkWA = async (status: string) => {
    const res = await fetch(`/api/whatsapp?status=${status}`);
    const data = await res.json();
    setBulkMessages(data.messages);
  };

  const getWhatsAppMsg = (order: Order) => {
    const shopName = settings.shop_name ?? "LaundryPro";
    const msgs: Record<string, string> = {
      ready: `Hello ${order.customerName}! Your laundry order *${order.orderCode}* is ready for pickup. Amount: ${formatCurrency(order.totalAmount)}. Please collect from ${shopName}. Thank you! 🙏`,
      pending: `Hello ${order.customerName}! Your laundry order *${order.orderCode}* has been received and is being processed. Delivery by ${formatDate(order.deliveryDate)}. - ${shopName}`,
      delivered: `Hello ${order.customerName}! Your laundry order *${order.orderCode}* has been delivered. Thank you for choosing ${shopName}! 🙏`,
    };
    return msgs[order.status] ?? `Hello ${order.customerName}! Regarding your order *${order.orderCode}* - ${shopName}`;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBulkWAStatus("ready"); loadBulkWA("ready"); setShowBulkWA(true); }}
                className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <Send size={14} /> WhatsApp Reminders
              </button>
              <Link
                href="/orders/new"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} /> New Order
              </Link>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search orders, customers..."
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
                    statusFilter === s
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Extra filters */}
          <div className="flex items-end gap-3 mb-4 flex-wrap bg-white border border-slate-200 rounded-lg p-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Order Date</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={orderDateFrom}
                  onChange={(e) => { setOrderDateFrom(e.target.value); setPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={orderDateTo}
                  onChange={(e) => { setOrderDateTo(e.target.value); setPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Delivery Date</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={deliveryDateFrom}
                  onChange={(e) => { setDeliveryDateFrom(e.target.value); setPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input
                  type="date"
                  value={deliveryDateTo}
                  onChange={(e) => { setDeliveryDateTo(e.target.value); setPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Due</label>
              <select
                value={dueFilter}
                onChange={(e) => { setDueFilter(e.target.value as "all" | "due" | "paid"); setPage(1); }}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="due">Due</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Shelf Number</label>
              <input
                type="text"
                placeholder="e.g. A-12"
                value={shelfFilter}
                onChange={(e) => { setShelfFilter(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {hasExtraFilters && (
              <button
                onClick={clearExtraFilters}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-2 py-1.5"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivery</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Shelf</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">Loading...</td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">No orders found</td></tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setDrawerOrderId(order.id)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDrawerOrderId(order.id); }}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {order.orderCode}
                        </button>
                        <div className="text-xs text-slate-400">{formatDate(order.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{order.customerName}</div>
                        <div className="text-xs text-slate-500">{order.customerPhone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(order.deliveryDate)}</td>
                      <td className="px-4 py-3">
                        {order.shelfNumber ? (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-mono">{order.shelfNumber}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{formatCurrency(order.totalAmount)}</div>
                      </td>
                      <td className="px-4 py-3">
                        {parseFloat(order.dueAmount) > 0 ? (
                          <span className="font-medium text-red-600">{formatCurrency(order.dueAmount)}</span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">Paid</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {ORDER_STATUSES.map(s => (
                            <option key={s} value={s} className="capitalize">{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDrawerOrderId(order.id)}
                            className="text-slate-500 hover:text-blue-600 transition-colors"
                            title="View Order"
                          >
                            <Package size={15} />
                          </button>
                          <button
                            onClick={() => openWhatsAppChat(order.customerPhone, getWhatsAppMsg(order))}
                            className="text-slate-500 hover:text-green-600 transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </button>
                          <button
                            onClick={() => deleteOrder(order)}
                            className="text-slate-500 hover:text-red-600 transition-colors"
                            title="Delete Order"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="order(s)" />
        </div>
      </main>

      {/* Bulk WhatsApp Modal */}
      <Modal open={showBulkWA} onClose={() => setShowBulkWA(false)} title="WhatsApp Bulk Reminders" size="xl">
        <div className="space-y-4">
          <div className="flex gap-2">
            {ORDER_STATUSES.filter(s => s !== "delivered" && s !== "cancelled").map(s => (
              <button
                key={s}
                onClick={() => { setBulkWAStatus(s); loadBulkWA(s); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                  bulkWAStatus === s ? "bg-green-600 text-white border-green-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="text-sm text-slate-500">
            {bulkMessages.length} orders with status &apos;{bulkWAStatus}&apos; — click to open WhatsApp
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {bulkMessages.length === 0 && (
              <div className="text-center py-8 text-slate-400">No orders with this status</div>
            )}
            {bulkMessages.map((m, i) => (
              <div key={i} className="flex items-start justify-between bg-green-50 border border-green-100 rounded-lg p-3">
                <div>
                  <div className="font-medium text-sm text-slate-800">{m.customerName} · {m.orderCode}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.phone}</div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">{m.message.slice(0, 100)}...</div>
                </div>
                <button
                  onClick={() => openWhatsAppChat(m.phone, m.message)}
                  className="shrink-0 ml-3 flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"
                >
                  <MessageCircle size={12} /> Send
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <OrderDetailDrawer
        orderId={drawerOrderId}
        onClose={() => setDrawerOrderId(null)}
        // No onChanged needed: the drawer broadcasts every mutation, and
        // useOrdersChanged above already refreshes the list on that.
      />
    </div>
  );
}
