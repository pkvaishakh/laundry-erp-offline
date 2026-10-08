"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Settings, Save, Store, Phone, Lock, Unlock, Hash, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { DEFAULT_INVOICE_TERMS, DEFAULT_ORDER_CODE_PREFIX, formatOrderCode, sanitizeOrderCodePrefix } from "@/lib/utils";
import Modal from "@/components/Modal";

const SHOP_FIELDS_PIN = "9656650024";

interface SettingsForm {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  shop_gstin: string;
  currency_symbol: string;
  whatsapp_number: string;
  order_code_prefix: string;
  invoice_terms: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>({
    shop_name: "",
    shop_phone: "",
    shop_address: "",
    shop_gstin: "",
    currency_symbol: "₹",
    whatsapp_number: "",
    order_code_prefix: DEFAULT_ORDER_CODE_PREFIX,
    invoice_terms: DEFAULT_INVOICE_TERMS,
  });
  const [saving, setSaving] = useState(false);
  const [shopFieldsUnlocked, setShopFieldsUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Partial<SettingsForm>) => {
        setForm(prev => ({ ...prev, ...data }));
      });
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    toast.success("Settings saved!");
    setSaving(false);
  };

  const update = (key: keyof SettingsForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const openPinModal = () => {
    setPinInput("");
    setShowPinModal(true);
  };

  const submitPin = () => {
    if (pinInput === SHOP_FIELDS_PIN) {
      setShopFieldsUnlocked(true);
      setShowPinModal(false);
      toast.success("Shop Name & Address unlocked for editing");
    } else {
      toast.error("Incorrect PIN");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Settings size={22} className="text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
          </div>

          <div className="space-y-6">
            {/* Shop Information */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Store size={16} /> Shop Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-600">Shop Name</label>
                    {shopFieldsUnlocked ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                        <Unlock size={11} /> Unlocked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={openPinModal}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 font-medium"
                      >
                        <Lock size={11} /> Enter PIN to edit
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={form.shop_name}
                    onChange={(e) => update("shop_name", e.target.value)}
                    onFocus={(e) => { if (!shopFieldsUnlocked) { e.target.blur(); openPinModal(); } }}
                    readOnly={!shopFieldsUnlocked}
                    placeholder="Your Laundry Shop Name"
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !shopFieldsUnlocked ? "bg-slate-50 text-slate-500 cursor-pointer" : ""
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={form.shop_phone}
                    onChange={(e) => update("shop_phone", e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-600">Address</label>
                    {shopFieldsUnlocked ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                        <Unlock size={11} /> Unlocked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={openPinModal}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 font-medium"
                      >
                        <Lock size={11} /> Enter PIN to edit
                      </button>
                    )}
                  </div>
                  <textarea
                    value={form.shop_address}
                    onChange={(e) => update("shop_address", e.target.value)}
                    onFocus={(e) => { if (!shopFieldsUnlocked) { e.target.blur(); openPinModal(); } }}
                    readOnly={!shopFieldsUnlocked}
                    placeholder="Shop address (appears on invoices)"
                    rows={2}
                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !shopFieldsUnlocked ? "bg-slate-50 text-slate-500 cursor-pointer" : ""
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">GSTIN (optional)</label>
                  <input
                    type="text"
                    value={form.shop_gstin}
                    onChange={(e) => update("shop_gstin", e.target.value)}
                    placeholder="22AAAAA0000A1Z5"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    value={form.currency_symbol}
                    onChange={(e) => update("currency_symbol", e.target.value)}
                    placeholder="₹"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Order Numbering */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Hash size={16} /> Order Numbering
              </h2>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Order Code Prefix</label>
                  <input
                    type="text"
                    value={form.order_code_prefix}
                    onChange={(e) => update("order_code_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9\-/]/g, "").slice(0, 10))}
                    placeholder={DEFAULT_ORDER_CODE_PREFIX}
                    className="w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-sm text-slate-500 pb-2">
                  Next orders look like{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {formatOrderCode(sanitizeOrderCodePrefix(form.order_code_prefix), 1)}
                  </span>
                  ,{" "}
                  <span className="font-mono font-semibold text-slate-700">
                    {formatOrderCode(sanitizeOrderCodePrefix(form.order_code_prefix), 2)}
                  </span>
                  …
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Letters, numbers, &quot;-&quot; and &quot;/&quot; only (max 10). Numbering continues from the highest
                existing order with this prefix; a new prefix starts again at 00001. Existing order codes are not changed.
              </p>
            </div>

            {/* Invoice Terms */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                  <FileText size={16} /> Invoice Terms &amp; Conditions
                </h2>
                <button
                  type="button"
                  onClick={() => update("invoice_terms", DEFAULT_INVOICE_TERMS)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Reset to default
                </button>
              </div>
              <textarea
                value={form.invoice_terms}
                onChange={(e) => update("invoice_terms", e.target.value)}
                rows={9}
                placeholder="One term per line"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                One term per line — printed as a numbered list at the bottom of every invoice. Leave empty to print no terms.
              </p>
            </div>

            {/* WhatsApp Settings */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Phone size={16} /> WhatsApp Settings
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Business Number</label>
                <input
                  type="tel"
                  value={form.whatsapp_number}
                  onChange={(e) => update("whatsapp_number", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-sm"
                />
                <p className="text-xs text-slate-400 mt-1">Used for sending WhatsApp reminders to customers</p>
              </div>
            </div>

            {/* About */}
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border border-blue-100 p-6">
              <h2 className="font-semibold text-slate-700 mb-2">About LaundryPro</h2>
              <p className="text-sm text-slate-600 mb-3">
                Professional laundry billing and order management system.
                Supports offline operation, thermal printing, barcode tags, WhatsApp notifications,
                and comprehensive reporting.
              </p>
              <div className="text-xs text-slate-400 space-y-0.5">
                <div>Version: 1.0.0</div>
                <div>Database: PostgreSQL (local)</div>
                <div>Supports: 80mm Thermal Printers, Ribbon Printers for Tags</div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              <Save size={16} /> {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </main>

      <Modal open={showPinModal} onClose={() => setShowPinModal(false)} title="Enter PIN to Edit Shop Name & Address" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Shop Name and Address appear on every printed invoice and statement, so changing them requires a PIN.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
              placeholder="Enter PIN"
              autoFocus
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={submitPin}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700"
          >
            Unlock
          </button>
        </div>
      </Modal>
    </div>
  );
}
