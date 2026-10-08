"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import { Plus, Edit3, Trash2, Layers, Package, Tag, Truck, IndianRupee } from "lucide-react";
import toast from "react-hot-toast";

interface Service {
  id: number;
  name: string;
  unit: string;
  price: string;
  active: boolean;
}
interface Item {
  id: number;
  name: string;
  active: boolean;
}
interface ExpenseCategory {
  id: number;
  name: string;
  active: boolean;
}
interface Vendor {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  active: boolean;
}

const UNITS = ["item", "kg", "sqft"];

export default function CatalogPage() {
  const confirm = useConfirm();
  const [services, setServices] = useState<Service[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPricesModal, setShowPricesModal] = useState(false);
  const [pricesForService, setPricesForService] = useState<Service | null>(null);
  const [itemPricesForm, setItemPricesForm] = useState<Record<number, string>>({});
  const [showItemServicePricesModal, setShowItemServicePricesModal] = useState(false);
  const [pricesForItem, setPricesForItem] = useState<Item | null>(null);
  const [servicePricesForm, setServicePricesForm] = useState<Record<number, string>>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editCategory, setEditCategory] = useState<ExpenseCategory | null>(null);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [svcForm, setSvcForm] = useState({ name: "", unit: "item", price: "" });
  const [itemForm, setItemForm] = useState({ name: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [vendorForm, setVendorForm] = useState({ name: "", phone: "", address: "" });
  const [tab, setTab] = useState<"services" | "items" | "categories" | "vendors">("services");

  const fetchAll = async () => {
    const [svcs, itms, cats, vnds] = await Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/items").then(r => r.json()),
      fetch("/api/expense-categories").then(r => r.json()),
      fetch("/api/vendors").then(r => r.json()),
    ]);
    setServices(svcs);
    setItems(itms);
    setCategories(cats);
    setVendorsList(vnds);
  };

  useEffect(() => { fetchAll(); }, []);

  const openAddService = () => {
    setEditService(null);
    setSvcForm({ name: "", unit: "item", price: "" });
    setShowServiceModal(true);
  };

  const openEditService = (s: Service) => {
    setEditService(s);
    setSvcForm({ name: s.name, unit: s.unit, price: s.price });
    setShowServiceModal(true);
  };

  const saveService = async () => {
    if (!svcForm.name || !svcForm.price) { toast.error("Name and price required"); return; }
    if (editService) {
      await fetch(`/api/services/${editService.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(svcForm),
      });
      toast.success("Service updated!");
    } else {
      await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(svcForm),
      });
      toast.success("Service added!");
    }
    setShowServiceModal(false);
    fetchAll();
  };

  const deleteService = async (id: number) => {
    const ok = await confirm({
      title: "Deactivate service?",
      message: "This service will be hidden from new orders. Existing orders keep their pricing.",
      confirmLabel: "Deactivate",
    });
    if (!ok) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    toast.success("Service deactivated");
    fetchAll();
  };

  const openItemPrices = async (svc: Service) => {
    setPricesForService(svc);
    const overrides: Array<{ itemId: number; price: string }> = await fetch(`/api/services/${svc.id}/item-prices`).then(r => r.json());
    const form: Record<number, string> = {};
    for (const o of overrides) form[o.itemId] = o.price;
    setItemPricesForm(form);
    setShowPricesModal(true);
  };

  const saveItemPrices = async () => {
    if (!pricesForService) return;
    const prices = items.map((item) => {
      const raw = (itemPricesForm[item.id] ?? "").trim();
      return { itemId: item.id, price: raw === "" ? null : parseFloat(raw) };
    });
    await fetch(`/api/services/${pricesForService.id}/item-prices`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices }),
    });
    toast.success("Item prices saved!");
    setShowPricesModal(false);
  };

  const openItemServicePrices = async (item: Item) => {
    setPricesForItem(item);
    const overrides: Array<{ serviceId: number; price: string }> = await fetch(`/api/items/${item.id}/prices`).then(r => r.json());
    const form: Record<number, string> = {};
    for (const o of overrides) form[o.serviceId] = o.price;
    setServicePricesForm(form);
    setShowItemServicePricesModal(true);
  };

  const saveItemServicePrices = async () => {
    if (!pricesForItem) return;
    const eligibleServices = services.filter((s) => s.unit !== "kg" && s.active);
    const prices = eligibleServices.map((svc) => {
      const raw = (servicePricesForm[svc.id] ?? "").trim();
      return { serviceId: svc.id, price: raw === "" ? null : parseFloat(raw) };
    });
    await fetch(`/api/items/${pricesForItem.id}/prices`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices }),
    });
    toast.success("Service prices saved!");
    setShowItemServicePricesModal(false);
  };

  const openAddItem = () => {
    setEditItem(null);
    setItemForm({ name: "" });
    setShowItemModal(true);
  };

  const openEditItem = (i: Item) => {
    setEditItem(i);
    setItemForm({ name: i.name });
    setShowItemModal(true);
  };

  const saveItem = async () => {
    if (!itemForm.name) { toast.error("Item name required"); return; }
    if (editItem) {
      await fetch(`/api/items/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      toast.success("Item updated!");
    } else {
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      toast.success("Item added!");
    }
    setShowItemModal(false);
    fetchAll();
  };

  const deleteItem = async (id: number) => {
    const ok = await confirm({
      title: "Deactivate item?",
      message: "This item will be hidden from new orders. Existing orders are unaffected.",
      confirmLabel: "Deactivate",
    });
    if (!ok) return;
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    toast.success("Item deactivated");
    fetchAll();
  };

  const openAddCategory = () => {
    setEditCategory(null);
    setCategoryForm({ name: "" });
    setShowCategoryModal(true);
  };

  const openEditCategory = (c: ExpenseCategory) => {
    setEditCategory(c);
    setCategoryForm({ name: c.name });
    setShowCategoryModal(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.name) { toast.error("Category name required"); return; }
    if (editCategory) {
      await fetch(`/api/expense-categories/${editCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      toast.success("Category updated!");
    } else {
      await fetch("/api/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      toast.success("Category added!");
    }
    setShowCategoryModal(false);
    fetchAll();
  };

  const deleteCategory = async (id: number) => {
    const ok = await confirm({
      title: "Deactivate expense category?",
      message: "This category will be hidden when recording new expenses. Past expenses keep it.",
      confirmLabel: "Deactivate",
    });
    if (!ok) return;
    await fetch(`/api/expense-categories/${id}`, { method: "DELETE" });
    toast.success("Category deactivated");
    fetchAll();
  };

  const openAddVendor = () => {
    setEditVendor(null);
    setVendorForm({ name: "", phone: "", address: "" });
    setShowVendorModal(true);
  };

  const openEditVendor = (v: Vendor) => {
    setEditVendor(v);
    setVendorForm({ name: v.name, phone: v.phone ?? "", address: v.address ?? "" });
    setShowVendorModal(true);
  };

  const saveVendor = async () => {
    if (!vendorForm.name) { toast.error("Vendor name required"); return; }
    if (editVendor) {
      await fetch(`/api/vendors/${editVendor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      toast.success("Vendor updated!");
    } else {
      await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      toast.success("Vendor added!");
    }
    setShowVendorModal(false);
    fetchAll();
  };

  const deleteVendor = async (id: number) => {
    const ok = await confirm({
      title: "Deactivate vendor?",
      message: "This vendor will be hidden when recording new expenses. Past expenses keep it.",
      confirmLabel: "Deactivate",
    });
    if (!ok) return;
    await fetch(`/api/vendors/${id}`, { method: "DELETE" });
    toast.success("Vendor deactivated");
    fetchAll();
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Layers size={22} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-800">Catalog Management</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
            <button
              onClick={() => setTab("services")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "services" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Services ({services.length})
            </button>
            <button
              onClick={() => setTab("items")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "items" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Items ({items.length})
            </button>
            <button
              onClick={() => setTab("categories")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "categories" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Expense Categories ({categories.length})
            </button>
            <button
              onClick={() => setTab("vendors")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "vendors" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Vendors ({vendorsList.length})
            </button>
          </div>

          {/* Services Tab */}
          {tab === "services" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-500 text-sm">Manage laundry services and their pricing</p>
                <button
                  onClick={openAddService}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus size={15} /> Add Service
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {services.map((s) => (
                      <tr key={s.id} className={`hover:bg-slate-50 ${!s.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                        <td className="px-4 py-3">
                          <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            per {s.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold">₹{parseFloat(s.price).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          }`}>
                            {s.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {s.unit !== "kg" && (
                              <button onClick={() => openItemPrices(s)} className="text-slate-400 hover:text-green-600" title="Set per-item prices">
                                <IndianRupee size={15} />
                              </button>
                            )}
                            <button onClick={() => openEditService(s)} className="text-slate-400 hover:text-blue-600">
                              <Edit3 size={15} />
                            </button>
                            {s.active && (
                              <button onClick={() => deleteService(s.id)} className="text-slate-400 hover:text-red-600">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Items Tab */}
          {tab === "items" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-500 text-sm">Manage laundry item names</p>
                <button
                  onClick={openAddItem}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus size={15} /> Add Item
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-y">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 hover:bg-slate-50 ${!item.active ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openItemServicePrices(item)} className="text-slate-300 hover:text-green-600 p-1" title="Set prices across services">
                          <IndianRupee size={13} />
                        </button>
                        <button onClick={() => openEditItem(item)} className="text-slate-300 hover:text-blue-600 p-1">
                          <Edit3 size={13} />
                        </button>
                        {item.active && (
                          <button onClick={() => deleteItem(item.id)} className="text-slate-300 hover:text-red-500 p-1">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="col-span-4 p-8 text-center text-slate-400 text-sm">No items found</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Expense Categories Tab */}
          {tab === "categories" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-500 text-sm">Manage the chart-of-accounts expense categories used when recording expenses</p>
                <button
                  onClick={openAddCategory}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus size={15} /> Add Category
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-y">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between p-3 hover:bg-slate-50 ${!c.active ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <Tag size={14} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditCategory(c)} className="text-slate-300 hover:text-blue-600 p-1">
                          <Edit3 size={13} />
                        </button>
                        {c.active && (
                          <button onClick={() => deleteCategory(c.id)} className="text-slate-300 hover:text-red-500 p-1">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && (
                    <div className="col-span-4 p-8 text-center text-slate-400 text-sm">No categories found</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Vendors Tab */}
          {tab === "vendors" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-500 text-sm">Manage suppliers and vendors used on expense records</p>
                <button
                  onClick={openAddVendor}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus size={15} /> Add Vendor
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vendor Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendorsList.map((v) => (
                      <tr key={v.id} className={`hover:bg-slate-50 ${!v.active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">
                          <Truck size={14} className="text-slate-400" /> {v.name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{v.phone || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{v.address || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            v.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          }`}>
                            {v.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditVendor(v)} className="text-slate-400 hover:text-blue-600">
                              <Edit3 size={15} />
                            </button>
                            {v.active && (
                              <button onClick={() => deleteVendor(v.id)} className="text-slate-400 hover:text-red-600">
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {vendorsList.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-sm">No vendors found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Service Modal */}
      <Modal
        open={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        title={editService ? "Edit Service" : "Add Service"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service Name *</label>
            <input
              type="text"
              value={svcForm.name}
              onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
              placeholder="e.g. Wash & Fold"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
            <div className="grid grid-cols-3 gap-2">
              {UNITS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setSvcForm({ ...svcForm, unit: u })}
                  className={`py-2 rounded-lg text-sm capitalize border transition-colors ${
                    svcForm.unit === u ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  per {u}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Price (₹) per {svcForm.unit} *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={svcForm.price}
                onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })}
                placeholder="0.00"
                className="w-full pl-7 pr-3 border border-slate-200 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={saveService}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editService ? "Update Service" : "Add Service"}
          </button>
        </div>
      </Modal>

      {/* Item Prices Modal */}
      <Modal
        open={showPricesModal}
        onClose={() => setShowPricesModal(false)}
        title={pricesForService ? `Item Prices — ${pricesForService.name}` : "Item Prices"}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Leave an item blank to charge the base price (₹{pricesForService ? parseFloat(pricesForService.price).toFixed(2) : "0.00"} per {pricesForService?.unit}). Set a value to override it for that item only.
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {items.filter((i) => i.active).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemPricesForm[item.id] ?? ""}
                    onChange={(e) => setItemPricesForm({ ...itemPricesForm, [item.id]: e.target.value })}
                    placeholder={pricesForService ? parseFloat(pricesForService.price).toFixed(2) : "0.00"}
                    className="w-full pl-7 pr-2 border border-slate-200 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
            {items.filter((i) => i.active).length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm">No active items — add items first</div>
            )}
          </div>
          <button
            onClick={saveItemPrices}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            Save Prices
          </button>
        </div>
      </Modal>

      {/* Item-across-Services Prices Modal */}
      <Modal
        open={showItemServicePricesModal}
        onClose={() => setShowItemServicePricesModal(false)}
        title={pricesForItem ? `Service Prices — ${pricesForItem.name}` : "Service Prices"}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Leave a service blank to charge its base price for this item. Set a value to override it for this item only. (Kg-billed services always charge their flat rate and aren&apos;t shown here.)
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {services.filter((s) => s.unit !== "kg" && s.active).map((svc) => (
              <div key={svc.id} className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-medium text-slate-700">{svc.name}</span>
                  <span className="text-xs text-slate-400 ml-2">base ₹{parseFloat(svc.price).toFixed(2)} / {svc.unit}</span>
                </div>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={servicePricesForm[svc.id] ?? ""}
                    onChange={(e) => setServicePricesForm({ ...servicePricesForm, [svc.id]: e.target.value })}
                    placeholder={parseFloat(svc.price).toFixed(2)}
                    className="w-full pl-7 pr-2 border border-slate-200 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
            {services.filter((s) => s.unit !== "kg" && s.active).length === 0 && (
              <div className="text-center py-6 text-slate-400 text-sm">No item/sqft services yet — add one first</div>
            )}
          </div>
          <button
            onClick={saveItemServicePrices}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            Save Prices
          </button>
        </div>
      </Modal>

      {/* Item Modal */}
      <Modal
        open={showItemModal}
        onClose={() => setShowItemModal(false)}
        title={editItem ? "Edit Item" : "Add Item"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Item Name *</label>
            <input
              type="text"
              value={itemForm.name}
              onChange={(e) => setItemForm({ name: e.target.value })}
              placeholder="e.g. Shirt, Saree, Blanket..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter") saveItem(); }}
            />
          </div>
          <button
            onClick={saveItem}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editItem ? "Update Item" : "Add Item"}
          </button>
        </div>
      </Modal>

      {/* Expense Category Modal */}
      <Modal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title={editCategory ? "Edit Expense Category" : "Add Expense Category"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category Name *</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ name: e.target.value })}
              placeholder="e.g. Rent, Utilities, Supplies..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter") saveCategory(); }}
            />
          </div>
          <button
            onClick={saveCategory}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editCategory ? "Update Category" : "Add Category"}
          </button>
        </div>
      </Modal>

      {/* Vendor Modal */}
      <Modal
        open={showVendorModal}
        onClose={() => setShowVendorModal(false)}
        title={editVendor ? "Edit Vendor" : "Add Vendor"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name *</label>
            <input
              type="text"
              value={vendorForm.name}
              onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
              placeholder="e.g. ABC Detergent Supplies"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={vendorForm.phone}
              onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input
              type="text"
              value={vendorForm.address}
              onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={saveVendor}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            {editVendor ? "Update Vendor" : "Add Vendor"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
