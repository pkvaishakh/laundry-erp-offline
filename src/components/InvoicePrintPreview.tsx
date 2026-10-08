"use client";
import { Printer } from "lucide-react";
import Modal from "@/components/Modal";
import InvoiceReceipt, { InvoiceOrder } from "@/components/InvoiceReceipt";

interface InvoicePrintPreviewProps {
  open: boolean;
  onClose: () => void;
  onPrint: () => void;
  order: InvoiceOrder;
  settings: Record<string, string>;
}

/**
 * In-app preview of the thermal receipt before printing. The desktop (Electron)
 * build has no Chromium print-preview screen — printing goes straight to the
 * Windows print dialog — so this is the only place the layout can be checked
 * there. Shown at 76mm (3" roll) width, matching what the printer receives.
 */
export default function InvoicePrintPreview({ open, onClose, onPrint, order, settings }: InvoicePrintPreviewProps) {
  return (
    <Modal open={open} onClose={onClose} title="Print Preview" size="md">
      <div className="bg-slate-100 rounded-lg py-4 flex justify-center">
        <div className="bg-white shadow-md" style={{ width: "76mm" }}>
          <InvoiceReceipt order={order} settings={settings} />
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => {
            onClose();
            onPrint();
          }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800"
        >
          <Printer size={15} /> Print
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-3 text-center">
        In the print dialog choose your 3&quot; / 80mm receipt printer, margins None, scale 100%.
      </p>
    </Modal>
  );
}
