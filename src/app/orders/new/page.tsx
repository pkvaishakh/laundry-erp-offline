"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, ChevronDown, Calendar, Package, User, Phone } from "lucide-react";
import { getTomorrowDate, UNITS, formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { notifyOrdersChanged } from "@/lib/ordersSync";

interface ServiceOption {
  id: number;
  name: string;
  unit: string;
  price: string;
  active: boolean;
}
interface ItemOption {
  id: number;
  name: string;
  active: boolean;
}
interface ItemPriceOverride {
  serviceId: number;
  itemId: number;
  price: string;
}
interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  totalDue?: string;
}

const MIN_CUSTOMER_QUERY = 2;

// Phone-like input ("+91 98765-43210") is reduced to bare digits, minus a
// leading 91 country code, so it matches phones stored as "9876543210".
function normalizeCustomerQuery(raw: string): string {
  const q = raw.trim();
  if (/^[\d\s+\-()]+$/.test(q)) {
    const digits = q.replace(/\D/g, "");
    return digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
  }
  return q;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-100 text-inherit rounded-sm">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

interface BatchItemEntry {
  itemId: number | null;
  itemName: string;
  quantity: string; // raw input string so the field can be cleared/edited freely
}

interface LineItem {
  itemId: number | null;
  serviceId: number | null;
  itemName: string;
  serviceName: string;
  unit: string;
  quantity: string; // raw input string; for kg-unit lines this is the load's TOTAL WEIGHT in kg
  price: number;
  subtotal: number;
  batchItems: BatchItemEntry[]; // kg-unit lines only: items+counts in this load, for record-keeping
}

// Parse a raw quantity string to a number for math/validation (empty/invalid -> 0).
const qtyNum = (q: string) => {
  const n = parseFloat(q);
  return Number.isFinite(n) ? n : 0;
};

// Strip leading zeros a user can't otherwise delete ("03" -> "3", "0.5" kept, "" kept).
const sanitizeQty = (raw: string) => raw.replace(/^0+(?=\d)/, "");

function buildBatchName(batchItems: BatchItemEntry[]): string {
  const named = batchItems.filter((b) => b.itemName);
  if (named.length === 0) return "";
  return named.map((b) => `${b.itemName} ×${qtyNum(b.quantity)}`).join(", ");
}

export default function NewOrderPage() {
  const router = useRouter();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemPrices, setItemPrices] = useState<ItemPriceOverride[]>([]);
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(getTomorrowDate());
  const [shelfNumber, setShelfNumber] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [suggestionField, setSuggestionField] = useState<"phone" | "name">("phone");
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [serviceSearches, setServiceSearches] = useState<Record<number, string>>({});
  const [showItemOptions, setShowItemOptions] = useState<Record<number, boolean>>({});
  const [showServiceOptions, setShowServiceOptions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch("/api/services").then(r => r.json()).then((data: ServiceOption[]) =>
      setServices(data.filter((s) => s.active !== false))
    );
    fetch("/api/items").then(r => r.json()).then((data: ItemOption[]) =>
      setItems(data.filter((i) => i.active !== false))
    );
    fetch("/api/service-item-prices").then(r => r.json()).then(setItemPrices);
  }, []);

  // A service's own price is the base rate, and the only rate for kg-billed
  // services. For item/sqft-billed services, a per-item override (if set)
  // takes precedence over the base price.
  const resolvePrice = (serviceId: number | null, itemId: number | null): number => {
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return 0;
    if (svc.unit !== "kg" && itemId != null) {
      const override = itemPrices.find(p => p.serviceId === serviceId && p.itemId === itemId);
      if (override) return parseFloat(override.price);
    }
    return parseFloat(svc.price);
  };

  // Debounced customer lookup shared by the phone and name fields. Each new
  // keystroke cancels the pending timer and any in-flight request, so a slow
  // stale response can never overwrite the results for what's typed now.
  useEffect(() => {
    const q = normalizeCustomerQuery(customerQuery);
    if (q.length < MIN_CUSTOMER_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal });
        const data = await res.json();
        setCustomerSuggestions(data.rows ?? []);
        setHighlightedSuggestion(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setCustomerSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchingCustomers(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerQuery]);

  const searchCustomer = (field: "phone" | "name", q: string) => {
    setSelectedCustomerId(null);
    setSuggestionField(field);
    setCustomerQuery(q);
    setShowSuggestions(true);
    // Clear results immediately so the old list never shows against new text.
    setCustomerSuggestions([]);
    setSearchingCustomers(normalizeCustomerQuery(q).length >= MIN_CUSTOMER_QUERY);
  };

  const selectCustomer = (c: Customer) => {
    setPhone(c.phone);
    setCustomerName(c.name);
    setAddress(c.address ?? "");
    setSelectedCustomerId(c.id);
    setShowSuggestions(false);
    setCustomerQuery("");
    setCustomerSuggestions([]);
  };

  const clearSelectedCustomer = () => {
    setPhone("");
    setCustomerName("");
    setAddress("");
    setSelectedCustomerId(null);
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || customerSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedSuggestion((i) => (i + 1) % customerSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedSuggestion((i) => (i - 1 + customerSuggestions.length) % customerSuggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault(); // don't submit the order form
      const c = customerSuggestions[highlightedSuggestion];
      if (c) selectCustomer(c);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const renderCustomerSuggestions = (field: "phone" | "name") => {
    if (!showSuggestions || suggestionField !== field) return null;
    const q = normalizeCustomerQuery(customerQuery);
    if (q.length < MIN_CUSTOMER_QUERY) return null;
    return (
      <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-72 overflow-y-auto">
        {customerSuggestions.map((c, i) => (
          <button
            key={c.id}
            type="button"
            // onMouseDown fires before the input's blur, so the click always lands.
            onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
            onMouseEnter={() => setHighlightedSuggestion(i)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
              i === highlightedSuggestion ? "bg-blue-50" : "hover:bg-slate-50"
            }`}
          >
            <div className="min-w-0">
              <div className="font-medium truncate"><Highlight text={c.name} query={q} /></div>
              <div className="text-xs text-slate-500"><Highlight text={c.phone} query={q} /></div>
            </div>
            {parseFloat(String(c.totalDue ?? 0)) > 0 && (
              <span className="text-xs text-red-600 whitespace-nowrap">{formatCurrency(c.totalDue)} due</span>
            )}
          </button>
        ))}
        {customerSuggestions.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-500">
            {searchingCustomers ? "Searching…" : "No existing customer — a new one will be created"}
          </div>
        )}
      </div>
    );
  };

  const addLineItem = () => {
    // Start with empty/blank fields so dropdowns show blank initially
    const idx = lineItems.length;
    setLineItems([
      ...lineItems,
      {
        itemId: null,
        serviceId: null,
        itemName: "",
        serviceName: "",
        unit: "",
        quantity: "1",
        price: 0,
        subtotal: 0,
        batchItems: [],
      },
    ]);

    // Remove any stale search text or dropdown visibility for this new index
    setItemSearches((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    setServiceSearches((prev) => {
      const copy = { ...prev };
      delete copy[idx];
      return copy;
    });
    setShowItemOptions((prev) => ({ ...prev, [idx]: false }));
    setShowServiceOptions((prev) => ({ ...prev, [idx]: false }));
  };

  const removeLineItem = (idx: number) => {
    const newLineItems = lineItems.filter((_, i) => i !== idx);
    setLineItems(newLineItems);

    // Rebuild indexed state maps (shift keys down) to avoid stale values
    setItemSearches((prev) => {
      const next: Record<number, string> = {};
      newLineItems.forEach((_, newIdx) => {
        const oldIdx = newIdx >= idx ? newIdx + 1 : newIdx;
        if (prev[oldIdx] !== undefined) next[newIdx] = prev[oldIdx];
      });
      return next;
    });
    setServiceSearches((prev) => {
      const next: Record<number, string> = {};
      newLineItems.forEach((_, newIdx) => {
        const oldIdx = newIdx >= idx ? newIdx + 1 : newIdx;
        if (prev[oldIdx] !== undefined) next[newIdx] = prev[oldIdx];
      });
      return next;
    });
    setShowItemOptions((prev) => {
      const next: Record<number, boolean> = {};
      newLineItems.forEach((_, newIdx) => {
        const oldIdx = newIdx >= idx ? newIdx + 1 : newIdx;
        if (prev[oldIdx] !== undefined) next[newIdx] = prev[oldIdx];
      });
      return next;
    });
    setShowServiceOptions((prev) => {
      const next: Record<number, boolean> = {};
      newLineItems.forEach((_, newIdx) => {
        const oldIdx = newIdx >= idx ? newIdx + 1 : newIdx;
        if (prev[oldIdx] !== undefined) next[newIdx] = prev[oldIdx];
      });
      return next;
    });
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: string | number | null) => {
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    if (field === "serviceId") {
      const svc = services.find(s => s.id === Number(value));
      if (svc) {
        item.serviceId = svc.id;
        item.serviceName = svc.name;
        item.unit = svc.unit;
        if (svc.unit === "kg") {
          // Kg-billed: no single item — track the load's item breakdown
          // separately, and bill on total weight (`quantity`) instead.
          item.itemId = null;
          if (item.batchItems.length === 0) {
            item.batchItems = [{ itemId: null, itemName: "", quantity: "1" }];
          }
          item.itemName = buildBatchName(item.batchItems);
        }
        item.price = resolvePrice(svc.id, item.itemId);
        item.subtotal = item.price * qtyNum(item.quantity);
      }
    } else if (field === "itemId") {
      const itm = items.find(i => i.id === Number(value));
      if (itm) {
        item.itemId = itm.id;
        item.itemName = itm.name;
        if (item.serviceId != null) {
          item.price = resolvePrice(item.serviceId, itm.id);
          item.subtotal = item.price * qtyNum(item.quantity);
        }
      }
    } else if (field === "quantity") {
      item.quantity = sanitizeQty(String(value));
      item.subtotal = item.price * qtyNum(item.quantity);
    } else if (field === "price") {
      item.price = Number(value);
      item.subtotal = item.price * qtyNum(item.quantity);
    } else if (field === "itemName") {
      item.itemName = String(value);
    } else if (field === "serviceName") {
      item.serviceName = String(value);
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const addBatchItem = (lineIdx: number) => {
    const updated = [...lineItems];
    const li = { ...updated[lineIdx] };
    li.batchItems = [...li.batchItems, { itemId: null, itemName: "", quantity: "1" }];
    updated[lineIdx] = li;
    setLineItems(updated);
  };

  const removeBatchItem = (lineIdx: number, batchIdx: number) => {
    const updated = [...lineItems];
    const li = { ...updated[lineIdx] };
    li.batchItems = li.batchItems.filter((_, i) => i !== batchIdx);
    li.itemName = buildBatchName(li.batchItems);
    updated[lineIdx] = li;
    setLineItems(updated);
  };

  const updateBatchItem = (lineIdx: number, batchIdx: number, field: "itemId" | "quantity", value: string) => {
    const updated = [...lineItems];
    const li = { ...updated[lineIdx] };
    const batchItems = [...li.batchItems];
    const entry = { ...batchItems[batchIdx] };

    if (field === "itemId") {
      const itm = items.find(i => i.id === Number(value));
      entry.itemId = itm?.id ?? null;
      entry.itemName = itm?.name ?? "";
    } else {
      entry.quantity = sanitizeQty(value);
    }

    batchItems[batchIdx] = entry;
    li.batchItems = batchItems;
    li.itemName = buildBatchName(batchItems);
    updated[lineIdx] = li;
    setLineItems(updated);
  };

  const filteredItems = (query: string) =>
    items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  const filteredServices = (query: string) =>
    services.filter((service) => service.name.toLowerCase().includes(query.toLowerCase()));

  const handleItemSearch = (idx: number, query: string) => {
    setItemSearches((prev) => ({ ...prev, [idx]: query }));
    setShowItemOptions((prev) => ({ ...prev, [idx]: true }));
  };

  const handleServiceSearch = (idx: number, query: string) => {
    setServiceSearches((prev) => ({ ...prev, [idx]: query }));
    setShowServiceOptions((prev) => ({ ...prev, [idx]: true }));
  };

  const selectItem = (idx: number, item: ItemOption) => {
    updateLineItem(idx, "itemId", item.id);
    setItemSearches((prev) => ({ ...prev, [idx]: item.name }));
    setShowItemOptions((prev) => ({ ...prev, [idx]: false }));
  };

  const selectService = (idx: number, service: ServiceOption) => {
    updateLineItem(idx, "serviceId", service.id);
    setServiceSearches((prev) => ({ ...prev, [idx]: service.name }));
    setShowServiceOptions((prev) => ({ ...prev, [idx]: false }));
  };

  const total = lineItems.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !customerName) {
      toast.error("Phone and customer name are required");
      return;
    }
    if (lineItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    for (const li of lineItems) {
      if (!li.serviceId) {
        toast.error("Select a service for every line item");
        return;
      }
      if (li.unit === "kg") {
        if (qtyNum(li.quantity) <= 0) {
          toast.error(`Enter a total weight for the ${li.serviceName} load`);
          return;
        }
        if (!li.batchItems.some((b) => b.itemId && qtyNum(b.quantity) > 0)) {
          toast.error(`Add at least one item to the ${li.serviceName} load`);
          return;
        }
      } else if (!li.itemId) {
        toast.error("Select an item for every line item");
        return;
      } else if (qtyNum(li.quantity) <= 0) {
        toast.error(`Enter a quantity for ${li.itemName || "every line item"}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          name: customerName,
          address,
          notes,
          deliveryDate,
          shelfNumber,
          items: lineItems.map((li) => ({
            itemId: li.itemId,
            serviceId: li.serviceId,
            itemName: li.itemName,
            serviceName: li.serviceName,
            unit: li.unit,
            quantity: qtyNum(li.quantity),
            price: li.price,
            subtotal: li.subtotal,
            itemBreakdown: li.unit === "kg"
              ? JSON.stringify(
                  li.batchItems
                    .filter((b) => b.itemId && qtyNum(b.quantity) > 0)
                    .map((b) => ({ ...b, quantity: qtyNum(b.quantity) })),
                )
              : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create order");
        return;
      }
      notifyOrdersChanged();
      toast.success(`Order ${data.orderCode} created!`);
      router.push(`/orders/${data.id}`);
    } catch {
      toast.error("Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Package size={22} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-800">New Order</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Details */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <User size={16} /> Customer Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        searchCustomer("phone", e.target.value);
                      }}
                      onKeyDown={handleCustomerKeyDown}
                      onBlur={() => setShowSuggestions(false)}
                      placeholder="Search by phone, e.g. 98765 43210"
                      autoComplete="off"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  {renderCustomerSuggestions("phone")}
                  {selectedCustomerId !== null && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-green-700">
                      Existing customer selected
                      <button type="button" onClick={clearSelectedCustomer} className="text-slate-500 hover:text-red-600 underline">
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        searchCustomer("name", e.target.value);
                      }}
                      onKeyDown={handleCustomerKeyDown}
                      onBlur={() => setShowSuggestions(false)}
                      placeholder="Search by name or enter new"
                      autoComplete="off"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  {renderCustomerSuggestions("name")}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Address (optional)</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Customer address"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
                    <Calendar size={12} /> Delivery Date
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Shelf Number (optional)</label>
                  <input
                    type="text"
                    value={shelfNumber}
                    onChange={(e) => setShelfNumber(e.target.value)}
                    placeholder="e.g. A-12"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Order Items</h2>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={15} /> Add Item
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                  <p className="text-slate-400 text-sm mb-2">No items added yet</p>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-blue-600 text-sm font-medium hover:underline"
                  >
                    + Add first item
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-1">
                    <div className="col-span-3">Item</div>
                    <div className="col-span-3">Service</div>
                    <div className="col-span-1">Unit</div>
                    <div className="col-span-2">Qty</div>
                    <div className="col-span-2">Price</div>
                    <div className="col-span-1"></div>
                  </div>
                  {lineItems.map((li, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2">
                      {li.unit === "kg" ? (
                        <div className="col-span-3 text-xs text-slate-500 px-1">
                          {li.itemName || "Add items in the load below"}
                        </div>
                      ) : (
                      <div className="col-span-3 relative">
                        <div className="relative">
                          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={itemSearches[idx] ?? li.itemName}
                            onChange={(e) => handleItemSearch(idx, e.target.value)}
                            onFocus={() => setShowItemOptions((prev) => ({ ...prev, [idx]: true }))}
                            onBlur={() => setTimeout(() => setShowItemOptions((prev) => ({ ...prev, [idx]: false })), 150)}
                            placeholder="Search item"
                            className="w-full text-xs border border-slate-200 rounded pl-6 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        </div>
                        {showItemOptions[idx] && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                            {filteredItems(itemSearches[idx] ?? "").map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectItem(idx, item)}
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50"
                              >
                                {item.name}
                              </button>
                            ))}
                            {filteredItems(itemSearches[idx] ?? "").length === 0 && (
                              <div className="px-2 py-1.5 text-xs text-slate-400">No matching items</div>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                      <div className="col-span-3 relative">
                        <div className="relative">
                          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={serviceSearches[idx] ?? li.serviceName}
                            onChange={(e) => handleServiceSearch(idx, e.target.value)}
                            onFocus={() => setShowServiceOptions((prev) => ({ ...prev, [idx]: true }))}
                            onBlur={() => setTimeout(() => setShowServiceOptions((prev) => ({ ...prev, [idx]: false })), 150)}
                            placeholder="Search service"
                            className="w-full text-xs border border-slate-200 rounded pl-6 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          />
                        </div>
                        {showServiceOptions[idx] && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                            {filteredServices(serviceSearches[idx] ?? "").map((service) => (
                              <button
                                key={service.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectService(idx, service)}
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50"
                              >
                                {service.name}
                              </button>
                            ))}
                            {filteredServices(serviceSearches[idx] ?? "").length === 0 && (
                              <div className="px-2 py-1.5 text-xs text-slate-400">No matching services</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-slate-500 capitalize">{li.unit}</span>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={li.quantity}
                          onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                          placeholder={li.unit === "kg" ? "Total weight" : undefined}
                          className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {li.unit === "kg" && <div className="text-[10px] text-slate-400 mt-0.5">kg (whole load)</div>}
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={li.price}
                              onChange={(e) => updateLineItem(idx, "price", e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded pl-5 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">= ₹{li.subtotal.toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {li.unit === "kg" && (
                        <div className="col-span-12 bg-white border border-slate-200 rounded-lg p-2.5 mt-0.5">
                          <div className="text-xs font-medium text-slate-600 mb-1.5">Items in this load</div>
                          <div className="space-y-1.5">
                            {li.batchItems.map((b, bIdx) => (
                              <div key={bIdx} className="flex items-center gap-2">
                                <select
                                  value={b.itemId ?? ""}
                                  onChange={(e) => updateBatchItem(idx, bIdx, "itemId", e.target.value)}
                                  className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                >
                                  <option value="">Select item...</option>
                                  {items.map((it) => (
                                    <option key={it.id} value={it.id}>{it.name}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={b.quantity}
                                  onChange={(e) => updateBatchItem(idx, bIdx, "quantity", e.target.value)}
                                  placeholder="Qty"
                                  className="w-16 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeBatchItem(idx, bIdx)}
                                  className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => addBatchItem(idx)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1.5"
                          >
                            <Plus size={12} /> Add item to load
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Total */}
              {lineItems.length > 0 && (
                <div className="mt-4 pt-3 border-t flex justify-end">
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Total Amount</div>
                    <div className="text-2xl font-bold text-slate-800">₹{total.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {submitting ? "Creating Order..." : "Create Order"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
