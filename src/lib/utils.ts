/** Default invoice terms (one per line); editable in Settings as `invoice_terms`. */
export const DEFAULT_INVOICE_TERMS = [
  "Garments are handled with care, but we are not responsible for damage due to weak fabric or color bleeding.",
  "Stain removal is not guaranteed.",
  "Please collect items within 7 days; unclaimed items after 30 days may be disposed of.",
  "Full payment is due at delivery, and prices may change.",
  "Compensation for loss or damage is limited to 5 times the service charge; claims must be made within 24 hours.",
  "Please check and empty all pockets; we are not responsible for items left inside.",
  "Special care instructions must be informed at the time of order.",
  "Delivery time may vary due to season or workload.",
].join("\n");

export const ORDER_CODE_PREFIX_KEY = "order_code_prefix";
export const DEFAULT_ORDER_CODE_PREFIX = "ORD";

/** Uppercase letters, digits, "-" and "/" only, max 10 chars; empty -> default. */
export function sanitizeOrderCodePrefix(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-/]/g, "")
    .slice(0, 10);
  return cleaned || DEFAULT_ORDER_CODE_PREFIX;
}

/** e.g. ("ORD", 1) -> "ORD00001" */
export function formatOrderCode(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(5, "0")}`;
}

export function formatCurrency(amount: string | number | null | undefined, symbol = "₹"): string {
  const n = parseFloat(String(amount ?? 0));
  return `${symbol}${n.toFixed(2)}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function buildWhatsAppLink(phone: string | null | undefined, message: string): string {
  const cleanPhone = (phone ?? "").replace(/[^0-9+]/g, "");
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

declare global {
  interface Window {
    /** Native bridge from electron/preload.js; absent in a plain browser. */
    laundryDesktop?: {
      openWhatsApp(appUrl: string, webUrl: string): Promise<"app" | "web">;
    };
  }
}

/**
 * Opens a WhatsApp chat with prefilled text — the installed WhatsApp app if
 * there is one, otherwise WhatsApp Web. Never both.
 *
 * Desktop build: the Electron main process asks Windows whether an app is
 * registered for whatsapp:// links and opens exactly one (see electron/main.js).
 *
 * Browser: a page can't query that, so it fires the app link from a hidden
 * iframe (the page itself stays put) and watches for the window losing focus,
 * which is what happens when the app (or the browser's "Open WhatsApp?"
 * prompt) takes over. Only if focus never leaves within ~1.2s does it open
 * wa.me — still inside the click's ~5s user-activation window, so the popup
 * isn't blocked.
 */
export function openWhatsAppChat(phone: string | null | undefined, message: string): void {
  if (typeof window === "undefined") return;
  const cleanPhone = (phone ?? "").replace(/[^0-9+]/g, "");
  const encoded = encodeURIComponent(message);
  const appUrl = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
  const webUrl = buildWhatsAppLink(phone, message);

  if (window.laundryDesktop) {
    window.laundryDesktop.openWhatsApp(appUrl, webUrl).catch(() => window.open(webUrl, "_blank"));
    return;
  }

  let appTookFocus = false;
  const onBlur = () => { appTookFocus = true; };
  const onVisibility = () => { if (document.hidden) appTookFocus = true; };
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVisibility);

  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = appUrl;
  document.body.appendChild(frame);

  setTimeout(() => {
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVisibility);
    frame.remove();
    if (appTookFocus) return;
    if (!window.open(webUrl, "_blank")) window.location.href = webUrl;
  }, 1200);
}

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  ready: "bg-green-100 text-green-800 border-green-200",
  delivered: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_METHODS = ["cash", "card", "upi", "other"] as const;
export const ORDER_STATUSES = ["pending", "processing", "ready", "delivered", "cancelled"] as const;
export const UNITS = ["item", "kg", "sqft"] as const;

export function generateExpenseCode(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `EXP${y}${m}${d}${rand}`;
}

export const MAX_EXPENSE_DUE_DAYS = 90;
export const EXPENSE_PAYMENT_METHODS = ["cash", "bank", "credit"] as const;
export const EXPENSE_STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;

export const EXPENSE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};
