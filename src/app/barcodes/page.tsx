"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useSearchParams } from "next/navigation";
import { Printer, Tag, RefreshCw, Minus, Plus, RotateCcw, EyeOff, Eye } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { Suspense } from "react";

interface OrderItem {
  id: number;
  itemName: string;
  serviceName: string;
  unit: string;
  quantity: string;
  price: string;
  subtotal: string;
  delivered: boolean;
  itemBreakdown: string | null;
}
interface Order {
  id: number;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

interface LabelGroup {
  key: string;
  itemName: string;
  serviceName: string;
  baseQty: number;
}
interface Piece {
  groupKey: string;
  itemName: string;
  serviceName: string;
  globalIndex: number;
}
interface PrintLabel {
  itemName: string;
  serviceName: string;
  pieceLabel: string;
}

const LABEL_SIZES = {
  compact: { name: "Compact", w: 40, h: 25 },
  standard: { name: "Standard", w: 50, h: 30 },
  wide: { name: "Wide", w: 60, h: 40 },
} as const;
type LabelSizeKey = keyof typeof LABEL_SIZES;

// Every order line item becomes its own label group; kg-billed loads expand
// into one group per garment recorded in the load's item breakdown, so a
// mixed-item wash/dry-clean load still gets one tag per physical piece.
function buildLabelGroups(order: Order): LabelGroup[] {
  const groups: LabelGroup[] = [];
  for (const item of order.items) {
    if (item.unit === "kg" && item.itemBreakdown) {
      try {
        const batch: { itemName: string; quantity: number }[] = JSON.parse(item.itemBreakdown);
        if (batch.length > 0) {
          batch.forEach((b, idx) => {
            groups.push({
              key: `${item.id}-${idx}`,
              itemName: b.itemName || item.itemName || "Item",
              serviceName: item.serviceName,
              baseQty: Math.max(1, Math.round(b.quantity)),
            });
          });
          continue;
        }
      } catch {
        // fall through to the single-group default below
      }
    }
    groups.push({
      key: String(item.id),
      itemName: item.itemName,
      serviceName: item.serviceName,
      baseQty: item.unit === "kg" ? 1 : Math.max(1, Math.round(parseFloat(item.quantity) || 1)),
    });
  }
  return groups;
}

// Piece numbering (e.g. "7/14") is fixed once from the order's original
// quantities and never changes when the print-run counts below are edited.
function buildPieces(groups: LabelGroup[]): Piece[] {
  const pieces: Piece[] = [];
  let g = 0;
  for (const grp of groups) {
    for (let i = 0; i < grp.baseQty; i++) {
      g++;
      pieces.push({ groupKey: grp.key, itemName: grp.itemName, serviceName: grp.serviceName, globalIndex: g });
    }
  }
  return pieces;
}

function formatLabelTimestamp(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function BarcodeContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [labelCounts, setLabelCounts] = useState<Record<string, number>>({});
  const [showCounts, setShowCounts] = useState(true);
  const [labelSize, setLabelSize] = useState<LabelSizeKey>("standard");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(setSettings);
    try {
      const saved = localStorage.getItem("laundrypro_label_size");
      if (saved && saved in LABEL_SIZES) setLabelSize(saved as LabelSizeKey);
    } catch { /* ignore unavailable storage */ }
  }, []);

  const changeLabelSize = (size: LabelSizeKey) => {
    setLabelSize(size);
    try { localStorage.setItem("laundrypro_label_size", size); } catch { /* ignore */ }
  };

  const loadOrder = async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/orders/${id}`);
    const data = await res.json();
    setOrder(data);
    const groups = buildLabelGroups(data);
    setLabelCounts(Object.fromEntries(groups.map(g => [g.key, g.baseQty])));
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) loadOrder(orderId);
  }, [orderId]);

  const groups = useMemo(() => (order ? buildLabelGroups(order) : []), [order]);
  const pieces = useMemo(() => buildPieces(groups), [groups]);
  const globalTotal = pieces.length;

  const setCount = (key: string, value: number) => {
    setLabelCounts(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const resetCounts = () => {
    setLabelCounts(Object.fromEntries(groups.map(g => [g.key, g.baseQty])));
  };

  const printLabels = useMemo<PrintLabel[]>(() => {
    const list: PrintLabel[] = [];
    for (const grp of groups) {
      const count = labelCounts[grp.key] ?? grp.baseQty;
      const groupPieces = pieces.filter(p => p.groupKey === grp.key);
      for (let i = 0; i < count; i++) {
        const p = groupPieces[i] ?? groupPieces[groupPieces.length - 1];
        list.push({
          itemName: grp.itemName,
          serviceName: grp.serviceName,
          pieceLabel: p ? `${p.globalIndex}/${globalTotal}` : `?/${globalTotal}`,
        });
      }
    }
    return list;
  }, [groups, pieces, labelCounts, globalTotal]);

  const totalToPrint = printLabels.length;
  const { w, h } = LABEL_SIZES[labelSize];

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Tags-${order?.orderCode ?? ""}`,
    pageStyle: `
      @page { size: ${w}mm ${h}mm; margin: 0; }
      body { margin: 0; }
      .barcode-tag { page-break-after: always; }
      .barcode-tag:last-child { page-break-after: auto; }
    `,
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Tag size={22} className="text-purple-600" />
              <h1 className="text-2xl font-bold text-slate-800">Item Tags & Barcodes</h1>
            </div>
          </div>

          {/* Order Search */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6">
            <h2 className="font-semibold text-slate-700 mb-3">Load Order</h2>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter Order ID or Order Code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && search) loadOrder(search); }}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={() => search && loadOrder(search)}
                disabled={!search || loading}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
              >
                {loading ? <RefreshCw size={14} className="animate-spin" /> : <Tag size={14} />}
                Load
              </button>
            </div>
            {orderId && <p className="text-xs text-slate-400 mt-2">Loaded from order #{orderId}</p>}
          </div>

          {order && (
            <>
              {/* Label counts */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <h2 className="font-semibold text-slate-700">Label counts</h2>
                    <p className="text-xs text-slate-400">{order.orderCode} &middot; All bags</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">
                      <strong>{totalToPrint}</strong> label(s) to print
                    </span>
                    <button
                      onClick={() => setShowCounts(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                    >
                      {showCounts ? <EyeOff size={14} /> : <Eye size={14} />} {showCounts ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={resetCounts}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                    >
                      <RotateCcw size={14} /> Reset
                    </button>
                    <button
                      onClick={() => handlePrint()}
                      disabled={totalToPrint === 0}
                      className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-60"
                    >
                      <Printer size={14} /> Print
                    </button>
                  </div>
                </div>

                {showCounts && (
                  <div className="p-4 space-y-1">
                    {groups.map((g) => (
                      <div key={g.key} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{g.itemName}</div>
                          <div className="text-xs text-slate-400">{g.serviceName}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-400">Qty {g.baseQty}</span>
                          <button
                            onClick={() => setCount(g.key, (labelCounts[g.key] ?? g.baseQty) - 1)}
                            className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={labelCounts[g.key] ?? g.baseQty}
                            onChange={(e) => setCount(g.key, parseInt(e.target.value) || 0)}
                            className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <button
                            onClick={() => setCount(g.key, (labelCounts[g.key] ?? g.baseQty) + 1)}
                            className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100">
                      <p className="text-xs text-slate-400 max-w-md">
                        Changing these numbers only changes how many stickers come out of the printer.
                        The details on each label (garment, piece number and total) stay exactly the same.
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Tag size:</span>
                        {(Object.keys(LABEL_SIZES) as LabelSizeKey[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => changeLabelSize(key)}
                            className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                              labelSize === key ? "bg-purple-600 text-white border-purple-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {LABEL_SIZES[key].name} ({LABEL_SIZES[key].w}&times;{LABEL_SIZES[key].h}mm)
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Label preview grid */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {printLabels.map((label, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-300 rounded-lg p-2.5 text-xs bg-white"
                    style={{ fontFamily: "monospace" }}
                  >
                    <div className="font-bold text-center">{order.orderCode}</div>
                    <div className="text-center">{settings.shop_name ?? order.customerName}</div>
                    <div className="text-center">{order.customerPhone}</div>
                    <div className="text-center text-[10px] text-slate-500 mb-1">{formatLabelTimestamp(order.createdAt)}</div>
                    <div className="text-center font-semibold">{label.itemName} ({label.pieceLabel})</div>
                    <div className="text-center border border-slate-800 rounded px-1.5 py-0.5 mt-1.5 text-[10px] font-bold uppercase">
                      {label.serviceName}
                    </div>
                  </div>
                ))}
                {printLabels.length === 0 && (
                  <div className="col-span-full text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                    All label counts are set to 0 — nothing to print
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Printable tags, sized for the ribbon/thermal label printer */}
        <div className="hidden">
          <div ref={printRef}>
            {order && printLabels.map((label, idx) => (
              <div
                key={idx}
                className="barcode-tag"
                style={{
                  width: `${w}mm`,
                  height: `${h}mm`,
                  fontFamily: "monospace",
                  fontSize: "8px",
                  padding: "1.5mm",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "10px" }}>{order.orderCode}</div>
                <div style={{ textAlign: "center" }}>{settings.shop_name ?? order.customerName}</div>
                <div style={{ textAlign: "center" }}>{order.customerPhone}</div>
                <div style={{ textAlign: "center", fontSize: "7px" }}>{formatLabelTimestamp(order.createdAt)}</div>
                <div style={{ textAlign: "center", fontWeight: "bold", marginTop: "1mm" }}>
                  {label.itemName} ({label.pieceLabel})
                </div>
                <div style={{ textAlign: "center", border: "1px solid #000", borderRadius: "2px", marginTop: "1mm", padding: "0.5mm", fontSize: "7px", fontWeight: "bold", textTransform: "uppercase" }}>
                  {label.serviceName}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BarcodesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center text-slate-400">Loading...</main>
      </div>
    }>
      <BarcodeContent />
    </Suspense>
  );
}
