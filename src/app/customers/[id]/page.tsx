"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StatusBadge from "@/components/StatusBadge";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CreditCard, ShoppingBag, MessageCircle, Calendar, Download, Printer } from "lucide-react";
import { formatCurrency, formatDate, openWhatsAppChat, getTodayDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import toast from "react-hot-toast";
import { notifyOrdersChanged } from "@/lib/ordersSync";
import { useReactToPrint } from "react-to-print";

interface CustomerDetail {
  customer: {
    id: number;
    name: string;
    phone: string;
    address: string | null;
    totalDue: string;
    createdAt: string;
  };
  orders: {
    id: number;
    orderCode: string;
    status: string;
    totalAmount: string;
    paidAmount: string;
    dueAmount: string;
    createdAt: string;
    deliveryDate: string;
  }[];
  payments: {
    id: number;
    amount: string;
    method: string;
    note: string | null;
    paymentType: string;
    createdAt: string;
  }[];
}

interface OrderRow {
  id: number;
  orderCode: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  createdAt: string;
}
interface PaymentRow {
  id: number;
  orderId: number | null;
  amount: string;
  method: string;
  note: string | null;
  paymentType: string;
  createdAt: string;
}
interface OrdersSummary {
  totalOrders: number;
  totalRevenue: number;
  totalCollected: number;
  totalDue: number;
}
interface PaymentsSummary {
  totalPayments: number;
  totalAmount: number;
}

const exportCsv = (rows: Array<Record<string, unknown>>, filename: string) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          const stringValue = value == null ? "" : String(value).replace(/\n/g, " ").replace(/"/g, '""');
          return `"${stringValue}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});

  // Statement date range — defaults to the customer's full history once loaded.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ordersPeriod, setOrdersPeriod] = useState<OrderRow[]>([]);
  const [ordersSummary, setOrdersSummary] = useState<OrdersSummary | null>(null);
  const [paymentsPeriod, setPaymentsPeriod] = useState<PaymentRow[]>([]);
  const [paymentsSummary, setPaymentsSummary] = useState<PaymentsSummary | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const [res, s] = await Promise.all([
      fetch(`/api/customers/${id}`),
      fetch("/api/settings"),
    ]);
    const json = res.ok ? await res.json() : null;
    setData(json);
    setSettings(await s.json());
    setLoading(false);
    if (json && !fromDate) {
      setFromDate(json.customer.createdAt.split("T")[0]);
      setToDate(getTodayDate());
    }
  }, [id, fromDate]);

  useEffect(() => { fetchData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReport = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setReportLoading(true);
    const params = new URLSearchParams({ customerId: String(id), from: fromDate, to: toDate });
    const [ordersRes, paymentsRes] = await Promise.all([
      fetch(`/api/reports?type=orders&${params}`).then((r) => r.json()),
      fetch(`/api/reports?type=payments&${params}`).then((r) => r.json()),
    ]);
    setOrdersPeriod(ordersRes.rows ?? []);
    setOrdersSummary(ordersRes.summary ?? null);
    setPaymentsPeriod(paymentsRes.rows ?? []);
    setPaymentsSummary(paymentsRes.summary ?? null);
    setReportLoading(false);
  }, [id, fromDate, toDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Statement-${data?.customer.name ?? id}-${fromDate}-to-${toDate}`,
  });

  const handleExport = () => {
    const rows = ordersPeriod.map((o) => ({
      date: formatDate(o.createdAt),
      orderCode: o.orderCode,
      status: o.status,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      dueAmount: o.dueAmount,
    }));
    exportCsv(rows, `${data?.customer.name ?? "customer"}-orders-${fromDate}-to-${toDate}.csv`);
  };

  const collectPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error("Enter valid amount"); return; }
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: parseInt(id),
        amount,
        method: payMethod,
        note: payNote || "Outstanding payment",
        paymentType: "outstanding",
      }),
    });
    notifyOrdersChanged();
    toast.success("Payment collected!");
    setShowPayModal(false);
    fetchData();
    fetchReport();
  };

  if (loading) return (
    <div className="flex h-screen"><Sidebar />
      <main className="flex-1 flex items-center justify-center text-slate-400">Loading...</main>
    </div>
  );

  if (!data) return null;
  const { customer, orders, payments } = data;
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.totalAmount), 0);
  const dueAmount = parseFloat(customer.totalDue);
  const whatsappMsg = `Hello ${customer.name}! You have an outstanding balance of ${formatCurrency(dueAmount)} at ${settings.shop_name ?? "LaundryPro"}. Please clear your dues at the earliest. Thank you!`;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
              <p className="text-slate-500 text-sm">{customer.phone}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                onClick={() => handlePrint()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800"
              >
                <Printer size={14} /> Print Statement
              </button>
              {dueAmount > 0 && (
                <button
                  onClick={() => openWhatsAppChat(customer.phone, whatsappMsg)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                >
                  <MessageCircle size={14} /> WhatsApp Reminder
                </button>
              )}
              {dueAmount > 0 && (
                <button
                  onClick={() => { setPayAmount(String(dueAmount.toFixed(2))); setShowPayModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  <CreditCard size={14} /> Collect Outstanding
                </button>
              )}
            </div>
          </div>

          {/* Customer Stats (all-time) */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-blue-600">{orders.length}</div>
              <div className="text-xs text-slate-500 mt-1">Total Orders</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
              <div className="text-xs text-slate-500 mt-1">Total Revenue</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <div className={`text-2xl font-bold ${dueAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(dueAmount)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Outstanding Due</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <div className="text-2xl font-bold text-purple-600">{payments.length}</div>
              <div className="text-xs text-slate-500 mt-1">Payments Made</div>
            </div>
          </div>

          {/* Statement date range */}
          <div className="flex items-center gap-3 mb-4">
            <Calendar size={15} className="text-slate-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Period summary cards */}
          {ordersSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Orders in Period", value: ordersSummary.totalOrders, isNum: true },
                { label: "Total Billed", value: formatCurrency(ordersSummary.totalRevenue) },
                { label: "Total Collected", value: formatCurrency(ordersSummary.totalCollected) },
                { label: "Due (Period Orders)", value: formatCurrency(ordersSummary.totalDue) },
              ].map((c) => (
                <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                  <div className="text-xl font-bold text-slate-800">{c.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Orders */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 p-4 border-b">
                <ShoppingBag size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700">Order History</h3>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {reportLoading ? (
                  <div className="p-6 text-center text-slate-400 text-sm">Loading...</div>
                ) : ordersPeriod.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">No orders in this period</div>
                ) : ordersPeriod.map(order => (
                  <Link key={order.id} href={`/orders/${order.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                    <div>
                      <div className="font-medium text-sm text-blue-600">{order.orderCode}</div>
                      <div className="text-xs text-slate-500">{formatDate(order.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={order.status} />
                      <div className="text-sm font-medium mt-0.5">{formatCurrency(order.totalAmount)}</div>
                      {parseFloat(order.dueAmount) > 0 && (
                        <div className="text-xs text-red-500">Due: {formatCurrency(order.dueAmount)}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Payments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 p-4 border-b">
                <CreditCard size={16} className="text-green-600" />
                <h3 className="font-semibold text-slate-700">Payment History</h3>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {reportLoading ? (
                  <div className="p-6 text-center text-slate-400 text-sm">Loading...</div>
                ) : paymentsPeriod.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">No payments in this period</div>
                ) : paymentsPeriod.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium capitalize text-slate-700">{p.method}</div>
                      <div className="text-xs text-slate-500">{formatDate(p.createdAt)}</div>
                      {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
                      <div className="text-xs text-slate-400 capitalize">{p.paymentType === "outstanding" ? "Outstanding" : "Order Payment"}</div>
                    </div>
                    <div className="font-semibold text-green-600">{formatCurrency(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Collect Outstanding Payment">
        <div className="space-y-4">
          <div className="bg-red-50 rounded-lg p-3 text-sm">
            <span className="text-slate-600">Total Outstanding: </span>
            <span className="font-bold text-red-600">{formatCurrency(customer.totalDue)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
            <input type="number" step="0.01" min="0" value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
            <div className="grid grid-cols-4 gap-2">
              {["cash", "card", "upi", "other"].map(m => (
                <button key={m} type="button" onClick={() => setPayMethod(m)}
                  className={`py-2 rounded-lg text-sm capitalize border transition-colors ${
                    payMethod === m ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)}
              placeholder="Payment note..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={collectPayment}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700">
            Collect ₹{payAmount || "0"}
          </button>
        </div>
      </Modal>

      {/* Print area */}
      <div className="hidden">
        <div ref={printRef} style={{ padding: "24px", fontFamily: "monospace", fontSize: "12px" }}>
          <h1 style={{ textAlign: "center", marginBottom: "2px" }}>{settings.shop_name ?? "LaundryPro"}</h1>
          {settings.address && <p style={{ textAlign: "center", margin: 0 }}>{settings.address}</p>}
          {settings.phone && <p style={{ textAlign: "center", margin: 0 }}>Ph: {settings.phone}</p>}
          <h2 style={{ textAlign: "center", marginTop: "16px", marginBottom: "4px" }}>Customer Statement</h2>
          <p style={{ textAlign: "center", marginBottom: "16px" }}>
            Period: {formatDate(fromDate)} to {formatDate(toDate)}
          </p>

          <table style={{ width: "100%", marginBottom: "16px" }}>
            <tbody>
              <tr>
                <td><strong>Customer:</strong> {customer.name}</td>
                <td style={{ textAlign: "right" }}><strong>Phone:</strong> {customer.phone}</td>
              </tr>
              {customer.address && (
                <tr>
                  <td colSpan={2}><strong>Address:</strong> {customer.address}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2}><strong>Current Outstanding Due:</strong> {formatCurrency(customer.totalDue)}</td>
              </tr>
            </tbody>
          </table>

          <h3>Orders</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Date</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Order</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Status</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Total</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Paid</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Due</th>
              </tr>
            </thead>
            <tbody>
              {ordersPeriod.map((o) => (
                <tr key={o.id}>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{formatDate(o.createdAt)}</td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{o.orderCode}</td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{o.status}</td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{formatCurrency(o.totalAmount)}</td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{formatCurrency(o.paidAmount)}</td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{formatCurrency(o.dueAmount)}</td>
                </tr>
              ))}
              {ordersPeriod.length === 0 && (
                <tr><td colSpan={6} style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>No orders</td></tr>
              )}
            </tbody>
            {ordersPeriod.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ border: "1px solid #000", padding: "4px" }}><strong>Total</strong></td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}><strong>{formatCurrency(ordersSummary?.totalRevenue ?? 0)}</strong></td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}><strong>{formatCurrency(ordersSummary?.totalCollected ?? 0)}</strong></td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}><strong>{formatCurrency(ordersSummary?.totalDue ?? 0)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>

          <h3>Payments Received</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Date</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Method</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Type</th>
                <th style={{ border: "1px solid #000", padding: "4px" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {paymentsPeriod.map((p) => (
                <tr key={p.id}>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{formatDate(p.createdAt)}</td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{p.method}</td>
                  <td style={{ border: "1px solid #000", padding: "4px" }}>{p.paymentType === "outstanding" ? "Outstanding" : "Order Payment"}</td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{formatCurrency(p.amount)}</td>
                </tr>
              ))}
              {paymentsPeriod.length === 0 && (
                <tr><td colSpan={4} style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>No payments</td></tr>
              )}
            </tbody>
            {paymentsPeriod.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ border: "1px solid #000", padding: "4px" }}><strong>Total</strong></td>
                  <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}><strong>{formatCurrency(paymentsSummary?.totalAmount ?? 0)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
