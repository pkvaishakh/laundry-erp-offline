import { forwardRef } from "react";
import { DEFAULT_INVOICE_TERMS, formatCurrency, formatDate } from "@/lib/utils";

/**
 * Print page setup for the receipt (pass as react-to-print's `pageStyle`).
 * Zero page margins and a fluid receipt width let it fill whatever roll the
 * printer driver reports (3" / 80mm) edge to edge. A fixed 80mm width used to
 * overflow 3" (76mm) paper, so the browser shrank the whole page to fit,
 * which printed as blank margins on both sides.
 */
export const RECEIPT_PAGE_STYLE = `
  @page { size: auto; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; width: 100%; background: #fff; }
  .thermal-receipt, .thermal-receipt * { box-sizing: border-box; }
  .thermal-receipt, .thermal-receipt > div { width: 100% !important; max-width: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Invoice terms from settings, one per line. Unset -> defaults; saved blank -> none. */
export function getInvoiceTerms(settings: Record<string, string>): string[] {
  const raw = settings.invoice_terms ?? DEFAULT_INVOICE_TERMS;
  return raw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
}

export interface InvoiceItem {
  id: number;
  itemName: string;
  serviceName: string;
  unit: string;
  quantity: string;
  price: string;
  subtotal: string;
}

export interface InvoiceOrder {
  orderCode: string;
  createdAt: string;
  deliveryDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  items: InvoiceItem[];
}

interface InvoiceReceiptProps {
  order: InvoiceOrder;
  settings: Record<string, string>;
}

/** 3-inch/80mm thermal-printer invoice, shared by the order detail page and drawer so print styling only needs to change in one place. */
const InvoiceReceipt = forwardRef<HTMLDivElement, InvoiceReceiptProps>(function InvoiceReceipt(
  { order, settings },
  ref
) {
  const terms = getInvoiceTerms(settings);
  return (
    <div ref={ref} className="thermal-receipt">
      <div
        style={{
          width: "100%",
          maxWidth: "80mm",
          boxSizing: "border-box", // padding inside the 100% width, or the right edge gets clipped
          fontFamily:
            "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Cascadia Code', 'Roboto Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          fontSize: "13px",
          lineHeight: 1.45,
          color: "#000",
          padding: "2mm 1.5mm",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: "6px", marginBottom: "8px" }}>
          <div style={{ fontWeight: "bold", fontSize: "20px", letterSpacing: "0.5px" }}>
            {settings.shop_name ?? "LaundryPro"}
          </div>
          {settings.shop_address && <div style={{ fontSize: "12px", marginTop: "2px" }}>{settings.shop_address}</div>}
          {settings.shop_phone && <div style={{ fontSize: "12px" }}>Ph: {settings.shop_phone}</div>}
          {settings.shop_gstin && <div style={{ fontSize: "12px" }}>GSTIN: {settings.shop_gstin}</div>}
        </div>

        <div style={{ fontSize: "12.5px", marginBottom: "8px" }}>
          <div><strong>Order:</strong> {order.orderCode}</div>
          <div><strong>Date:</strong> {formatDate(order.createdAt)}</div>
          <div><strong>Customer:</strong> {order.customerName}</div>
          <div><strong>Phone:</strong> {order.customerPhone}</div>
          {order.customerAddress && <div><strong>Address:</strong> {order.customerAddress}</div>}
          <div><strong>Delivery:</strong> {formatDate(order.deliveryDate)}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", marginBottom: "8px" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid #000" }}>
              <th style={{ textAlign: "left", paddingBottom: "4px" }}>Item/Service</th>
              <th style={{ textAlign: "right", paddingBottom: "4px", paddingLeft: "8px" }}>Qty</th>
              <th style={{ textAlign: "right", paddingBottom: "4px", paddingLeft: "8px" }}>Rate</th>
              <th style={{ textAlign: "right", paddingBottom: "4px", paddingLeft: "8px" }}>Amt</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={item.id} style={{ borderBottom: i < order.items.length - 1 ? "1px dashed #999" : undefined }}>
                <td style={{ paddingTop: "4px", paddingBottom: "4px" }}>
                  <div style={{ fontWeight: "bold" }}>{item.itemName}</div>
                  <div style={{ fontSize: "11px", color: "#333" }}>{item.serviceName}</div>
                </td>
                <td style={{ textAlign: "right", paddingTop: "4px", paddingBottom: "4px", paddingLeft: "8px", whiteSpace: "nowrap" }}>
                  {parseFloat(item.quantity).toFixed(item.unit === "item" ? 0 : 2)}
                </td>
                <td style={{ textAlign: "right", paddingTop: "4px", paddingBottom: "4px", paddingLeft: "8px", whiteSpace: "nowrap" }}>
                  ₹{parseFloat(item.price).toFixed(2)}
                </td>
                <td style={{ textAlign: "right", paddingTop: "4px", paddingBottom: "4px", paddingLeft: "8px", fontWeight: "bold", whiteSpace: "nowrap" }}>
                  ₹{parseFloat(item.subtotal).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "2px solid #000", paddingTop: "6px", fontSize: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
            <span>Total:</span><span style={{ fontWeight: "bold" }}>₹{parseFloat(order.totalAmount).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
            <span>Paid:</span><span>₹{parseFloat(order.paidAmount).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px", marginTop: "4px" }}>
            <span style={{ fontWeight: "bold" }}>Due:</span>
            <span style={{ fontWeight: "bold" }}>₹{parseFloat(order.dueAmount).toFixed(2)}</span>
          </div>
        </div>

        {order.notes && (
          <div style={{ marginTop: "6px", fontSize: "12px", borderTop: "1px dashed #999", paddingTop: "6px" }}>
            Note: {order.notes}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "10px", fontSize: "12px", borderTop: "1px dashed #999", paddingTop: "6px" }}>
          Thank you for your business!<br />Visit again.
        </div>

        {terms.length > 0 && (
          <div style={{ marginTop: "6px", fontSize: "10.5px", lineHeight: 1.35, borderTop: "1px dashed #999", paddingTop: "6px" }}>
            <div style={{ fontWeight: "bold", textAlign: "center", marginBottom: "3px" }}>Terms &amp; Conditions</div>
            <ol style={{ margin: 0, paddingLeft: "14px" }}>
              {terms.map((t, i) => (
                <li key={i} style={{ marginBottom: "1px" }}>{t}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
});

export default InvoiceReceipt;

/** Formats the invoice as a WhatsApp message (using WhatsApp's own *bold* markdown) for the "Share Invoice" action. */
export function buildInvoiceWhatsAppText(order: InvoiceOrder, settings: Record<string, string>): string {
  const shopName = settings.shop_name ?? "LaundryPro";
  const due = parseFloat(order.dueAmount);

  const lines = order.items.map((item) => {
    const qty = parseFloat(item.quantity).toFixed(item.unit === "item" ? 0 : 2);
    return `• ${item.itemName} (${item.serviceName}) x${qty} — ${formatCurrency(item.subtotal)}`;
  });

  return [
    `*${shopName}* — Invoice`,
    "",
    `Order: *${order.orderCode}*`,
    `Date: ${formatDate(order.createdAt)}`,
    `Delivery: ${formatDate(order.deliveryDate)}`,
    "",
    "*Items:*",
    ...lines,
    "",
    `Total: ${formatCurrency(order.totalAmount)}`,
    `Paid: ${formatCurrency(order.paidAmount)}`,
    due > 0 ? `*Due: ${formatCurrency(due)}*` : "*Paid in full ✅*",
    "",
    `Thank you for choosing ${shopName}! 🙏`,
  ].join("\n");
}
