"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { useParams, useRouter } from "next/navigation";
import {
  Printer, MessageCircle, Edit3, Package, Save, X,
  CreditCard, CheckSquare, Square, Truck, ArrowLeft, Tag, RefreshCw, Share2
} from "lucide-react";
import {
  formatCurrency, formatDate, ORDER_STATUSES, openWhatsAppChat,
  PAYMENT_METHODS, getTomorrowDate
} from "@/lib/utils";
import Modal from "@/components/Modal";
import InvoicePrintPreview from "@/components/InvoicePrintPreview";
import InvoiceReceipt, { buildInvoiceWhatsAppText, RECEIPT_PAGE_STYLE } from "@/components/InvoiceReceipt";
import toast from "react-hot-toast";
import { useReactToPrint } from "react-to-print";
import { notifyOrdersChanged } from "@/lib/ordersSync";

interface OrderDetail {
  id: number;
  orderCode: string;
  status: string;
  deliveryDate: string;
  shelfNumber: string | null;
  notes: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  createdAt: string;
  updatedAt: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  items: OrderItem[];
  payments: Payment[];
}
interface OrderItem {
  id: number;
  itemName: string;
  serviceName: string;
  unit: string;
  quantity: string;
  price: string;
  subtotal: string;
  delivered: boolean;
  deliveredAt: string | null;
}
interface Payment {
  id: number;
  amount: string;
  method: string;
  note: string | null;
  createdAt: string;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [showPayModal, setShowPayModal] = useState(false);
  const [showEditShelf, setShowEditShelf] = useState(false);
  const [shelfInput, setShelfInput] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: order?.orderCode ?? "Invoice",
    pageStyle: RECEIPT_PAGE_STYLE,
  });

  const fetchOrder = async () => {
    const res = await fetch(`/api/orders/${id}`);
    if (!res.ok) {
      setOrder(null);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setOrder(data);
    setShelfInput(data.shelfNumber ?? "");
    setLoading(false);
  };

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(setSettings);
    fetchOrder();
  }, [id]);

  const updateStatus = async (status: string) => {
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    toast.success(`Status updated to ${status}`);
    fetchOrder();
    notifyOrdersChanged();
  };

  const updateShelf = async () => {
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shelfNumber: shelfInput }),
    });
    toast.success("Shelf number updated");
    setShowEditShelf(false);
    fetchOrder();
    notifyOrdersChanged();
  };

  const collectPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter valid amount"); return; }
    setSubmitting(true);
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order!.id,
        customerId: order!.customerId,
        amount,
        method: payMethod,
        note: payNote || null,
        paymentType: "order",
      }),
    });
    toast.success(`Payment of ${formatCurrency(amount)} collected`);
    setShowPayModal(false);
    setPayAmount("");
    setPayNote("");
    setSubmitting(false);
    fetchOrder();
    notifyOrdersChanged();
  };

  const deliverItems = async (full: boolean) => {
    const body = full ? {} : { itemIds: selectedItems };
    await fetch(`/api/orders/${id}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    toast.success(full ? "Order fully delivered!" : `${selectedItems.length} item(s) delivered`);
    setSelectedItems([]);
    fetchOrder();
    notifyOrdersChanged();
  };

  const toggleItem = (itemId: number) => {
    setSelectedItems(prev =>
      prev.includes(itemId) ? prev.filter(i => i !== itemId) : [...prev, itemId]
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-slate-400">Loading...</main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-slate-400">Order not found</main>
      </div>
    );
  }

  const due = parseFloat(order.dueAmount);
  const whatsappMsg = `Hello ${order.customerName}! Your laundry order *${order.orderCode}* is ${order.status === "ready" ? "ready for pickup" : order.status}. Total: ${formatCurrency(order.totalAmount)}${due > 0 ? `, Due: ${formatCurrency(due)}` : " (Paid)"}. Thank you! - ${settings.shop_name ?? "LaundryPro"}`;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-700">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{order.orderCode}</h1>
              <p className="text-slate-500 text-sm">{order.customerName} · {order.customerPhone}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button
                onClick={() => fetchOrder()}
                className="text-slate-500 hover:text-slate-700 p-2"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={() => openWhatsAppChat(order.customerPhone, whatsappMsg)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
              <button
                onClick={() => openWhatsAppChat(order.customerPhone, buildInvoiceWhatsAppText(order, settings))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
              >
                <Share2 size={14} /> Share Invoice
              </button>
              <button
                onClick={() => setShowPrintPreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800"
              >
                <Printer size={14} /> Print Invoice
              </button>
              <a
                href={`/barcodes?orderId=${order.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
              >
                <Tag size={14} /> Print Tags
              </a>
              <a
                href={`/orders/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Edit3 size={14} /> Edit
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Details */}
            <div className="lg:col-span-2 space-y-4">
              {/* Status & Info */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-700">Order Details</h3>
                  <StatusBadge status={order.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Delivery Date</span>
                    <div className="font-medium">{formatDate(order.deliveryDate)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Shelf Number</span>
                    <div className="flex items-center gap-2">
                      {showEditShelf ? (
                        <>
                          <input
                            type="text"
                            value={shelfInput}
                            onChange={(e) => setShelfInput(e.target.value)}
                            className="border border-slate-200 rounded px-2 py-0.5 text-sm w-20"
                            placeholder="e.g. A-12"
                          />
                          <button onClick={updateShelf} className="text-green-600 hover:text-green-700"><Save size={14} /></button>
                          <button onClick={() => setShowEditShelf(false)} className="text-red-400 hover:text-red-500"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <span className="font-medium font-mono">{order.shelfNumber ?? "—"}</span>
                          <button onClick={() => setShowEditShelf(true)} className="text-slate-400 hover:text-blue-600"><Edit3 size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Created</span>
                    <div className="font-medium">{formatDate(order.createdAt)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Address</span>
                    <div className="font-medium text-xs">{order.customerAddress ?? "—"}</div>
                  </div>
                  {order.notes && (
                    <div className="col-span-2">
                      <span className="text-slate-500">Notes</span>
                      <div className="font-medium">{order.notes}</div>
                    </div>
                  )}
                </div>

                {/* Status Update */}
                <div className="mt-3 pt-3 border-t flex items-center gap-2">
                  <span className="text-xs text-slate-500">Update Status:</span>
                  <div className="flex gap-1 flex-wrap">
                    {ORDER_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(s)}
                        disabled={order.status === s}
                        className={`px-2 py-0.5 text-xs rounded capitalize border transition-colors ${
                          order.status === s
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-700">Items</h3>
                  {order.status !== "delivered" && (
                    <div className="flex gap-2">
                      {selectedItems.length > 0 && (
                        <button
                          onClick={() => deliverItems(false)}
                          className="flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                        >
                          <Truck size={12} /> Deliver Selected ({selectedItems.length})
                        </button>
                      )}
                      <button
                        onClick={() => deliverItems(true)}
                        className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      >
                        <Truck size={12} /> Deliver All
                      </button>
                    </div>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-slate-500">
                      <th className="text-left pb-2 w-6"></th>
                      <th className="text-left pb-2">Item</th>
                      <th className="text-left pb-2">Service</th>
                      <th className="text-left pb-2">Unit</th>
                      <th className="text-right pb-2">Qty</th>
                      <th className="text-right pb-2">Price</th>
                      <th className="text-right pb-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {order.items.map(item => (
                      <tr key={item.id} className={item.delivered ? "opacity-50" : ""}>
                        <td className="py-2 pr-2">
                          {order.status !== "delivered" && (
                            <button
                              onClick={() => toggleItem(item.id)}
                              className={selectedItems.includes(item.id) ? "text-blue-600" : "text-slate-300"}
                            >
                              {selectedItems.includes(item.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                            </button>
                          )}
                          {item.delivered && <span className="text-green-500 text-xs">✓</span>}
                        </td>
                        <td className="py-2 font-medium">{item.itemName}</td>
                        <td className="py-2 text-slate-500">{item.serviceName}</td>
                        <td className="py-2 text-slate-500 capitalize text-xs">{item.unit}</td>
                        <td className="py-2 text-right">{parseFloat(item.quantity).toFixed(item.unit === "item" ? 0 : 2)}</td>
                        <td className="py-2 text-right">{formatCurrency(item.price)}</td>
                        <td className="py-2 text-right font-semibold">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td colSpan={6} className="pt-2 text-right text-slate-600">Total</td>
                      <td className="pt-2 text-right text-lg">{formatCurrency(order.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Sidebar - Payments */}
            <div className="space-y-4">
              {/* Payment Summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h3 className="font-semibold text-slate-700 mb-3">Payment</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total</span>
                    <span className="font-semibold">{formatCurrency(order.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Paid</span>
                    <span className="font-semibold text-green-600">{formatCurrency(order.paidAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-slate-600 font-medium">Due</span>
                    <span className={`font-bold text-base ${due > 0 ? "text-red-600" : "text-green-600"}`}>
                      {due > 0 ? formatCurrency(due) : "Paid ✓"}
                    </span>
                  </div>
                </div>
                {due > 0 && (
                  <button
                    onClick={() => { setPayAmount(String(due)); setShowPayModal(true); }}
                    className="mt-3 w-full bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <CreditCard size={14} /> Collect Payment
                  </button>
                )}
              </div>

              {/* Payment History */}
              {order.payments.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-slate-700 mb-3">Payment History</h3>
                  <div className="space-y-2">
                    {order.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div>
                          <div className="capitalize text-slate-600">{p.method}</div>
                          <div className="text-xs text-slate-400">{formatDate(p.createdAt)}</div>
                          {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
                        </div>
                        <div className="font-semibold text-green-600">{formatCurrency(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Printable Invoice (hidden) */}
        <div className="hidden">
          <InvoiceReceipt ref={printRef} order={order} settings={settings} />
        </div>
      <InvoicePrintPreview
        open={showPrintPreview}
        onClose={() => setShowPrintPreview(false)}
        onPrint={() => handlePrint()}
        order={order}
        settings={settings}
      />
      </main>

      {/* Payment Modal */}
      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Collect Payment">
        <div className="space-y-4">
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
            <div className="text-xs text-slate-400 mt-1">Due: {formatCurrency(order.dueAmount)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => (
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Payment note..."
            />
          </div>
          <button
            onClick={collectPayment}
            disabled={submitting}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {submitting ? "Processing..." : `Collect ₹${payAmount || "0"}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
