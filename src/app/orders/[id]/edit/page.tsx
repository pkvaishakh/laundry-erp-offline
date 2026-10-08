"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, Save, Search } from "lucide-react";
import toast from "react-hot-toast";
import { notifyOrdersChanged } from "@/lib/ordersSync";

interface ServiceOption { id: number; name: string; unit: string; price: string; active: boolean; }
interface ItemOption { id: number; name: string; active: boolean; }
interface LineItem {
  itemId: number | null;
  serviceId: number | null;
  itemName: string;
  serviceName: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [shelfNumber, setShelfNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [itemSearches, setItemSearches] = useState<Record<number, string>>({});
  const [serviceSearches, setServiceSearches] = useState<Record<number, string>>({});
  const [showItemOptions, setShowItemOptions] = useState<Record<number, boolean>>({});
  const [showServiceOptions, setShowServiceOptions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/items").then(r => r.json()),
      fetch(`/api/orders/${id}`).then(r => r.json()),
    ]).then(([svcs, itms, order]) => {
      setServices(svcs.filter((s: ServiceOption) => s.active !== false));
      setItems(itms.filter((i: ItemOption) => i.active !== false));
      setDeliveryDate(order.deliveryDate?.split("T")[0] ?? "");
      setShelfNumber(order.shelfNumber ?? "");
      setNotes(order.notes ?? "");
      setLineItems(
        order.items.map((i: { itemId: number | null; serviceId: number | null; itemName: string; serviceName: string; unit: string; quantity: string; price: string; subtotal: string }) => ({
          itemId: i.itemId,
          serviceId: i.serviceId,
          itemName: i.itemName,
          serviceName: i.serviceName,
          unit: i.unit,
          quantity: parseFloat(i.quantity),
          price: parseFloat(i.price),
          subtotal: parseFloat(i.subtotal),
        }))
      );
      setLoading(false);
    });
  }, [id]);

  const addLineItem = () => {
    const defaultService = services[0];
    setLineItems([
      ...lineItems,
      {
        itemId: items[0]?.id ?? null,
        serviceId: defaultService?.id ?? null,
        itemName: items[0]?.name ?? "",
        serviceName: defaultService?.name ?? "",
        unit: defaultService?.unit ?? "item",
        quantity: 1,
        price: parseFloat(defaultService?.price ?? "0"),
        subtotal: parseFloat(defaultService?.price ?? "0"),
      },
    ]);
  };

  const removeLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx: number, field: string, value: string | number | null) => {
    const updated = [...lineItems];
    const item = { ...updated[idx] };
    if (field === "serviceId") {
      const svc = services.find(s => s.id === Number(value));
      if (svc) { item.serviceId = svc.id; item.serviceName = svc.name; item.unit = svc.unit; item.price = parseFloat(svc.price); item.subtotal = item.price * item.quantity; }
    } else if (field === "itemId") {
      const itm = items.find(i => i.id === Number(value));
      if (itm) { item.itemId = itm.id; item.itemName = itm.name; }
    } else if (field === "quantity") {
      item.quantity = Number(value); item.subtotal = item.price * item.quantity;
    } else if (field === "price") {
      item.price = Number(value); item.subtotal = item.price * item.quantity;
    } else if (field === "itemName") {
      item.itemName = String(value);
    }
    updated[idx] = item;
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
    if (lineItems.length === 0) { toast.error("Add at least one item"); return; }
    setSubmitting(true);
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryDate, shelfNumber, notes, items: lineItems }),
    });
    toast.success("Order updated!");
    notifyOrdersChanged();
    router.push(`/orders/${id}`);
  };

  if (loading) return (
    <div className="flex h-screen"><Sidebar />
      <main className="flex-1 flex items-center justify-center text-slate-400">Loading...</main>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-700"><ArrowLeft size={20} /></button>
            <h1 className="text-2xl font-bold text-slate-800">Edit Order</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-700 mb-4">Order Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Date</label>
                  <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Shelf Number</label>
                  <input type="text" value={shelfNumber} onChange={(e) => setShelfNumber(e.target.value)}
                    placeholder="e.g. A-12"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700">Items</h2>
                <button type="button" onClick={addLineItem}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  <Plus size={15} /> Add Item
                </button>
              </div>
              <div className="space-y-3">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-2">
                    <div className="col-span-3 relative">
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={(itemSearches[idx] ?? items.find(i => i.id === li.itemId)?.name) || li.itemName || ""}
                          onChange={(e) => handleItemSearch(idx, e.target.value)}
                          onFocus={() => setShowItemOptions((prev) => ({ ...prev, [idx]: true }))}
                          onBlur={() => setTimeout(() => setShowItemOptions((prev) => ({ ...prev, [idx]: false })), 150)}
                          placeholder="Search item"
                          className="w-full text-xs border border-slate-200 rounded pl-6 pr-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    <div className="col-span-3 relative">
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={(serviceSearches[idx] ?? services.find(s => s.id === li.serviceId)?.name) || li.serviceName || ""}
                          onChange={(e) => handleServiceSearch(idx, e.target.value)}
                          onFocus={() => setShowServiceOptions((prev) => ({ ...prev, [idx]: true }))}
                          onBlur={() => setTimeout(() => setShowServiceOptions((prev) => ({ ...prev, [idx]: false })), 150)}
                          placeholder="Search service"
                          className="w-full text-xs border border-slate-200 rounded pl-6 pr-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      <input type="number" min="0.1" step="0.1" value={li.quantity}
                        onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
                        <input type="number" min="0" step="0.01" value={li.price}
                          onChange={(e) => updateLineItem(idx, "price", e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded pl-5 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      <div className="text-xs text-slate-500 text-right mt-0.5">= ₹{li.subtotal.toFixed(2)}</div>
                    </div>
                    <div className="col-span-1">
                      <button type="button" onClick={() => removeLineItem(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {lineItems.length > 0 && (
                <div className="mt-4 pt-3 border-t flex justify-end">
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Total Amount</div>
                    <div className="text-2xl font-bold text-slate-800">₹{total.toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60">
                <Save size={16} /> {submitting ? "Saving..." : "Save Changes"}
              </button>
              <button type="button" onClick={() => router.back()}
                className="px-6 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
