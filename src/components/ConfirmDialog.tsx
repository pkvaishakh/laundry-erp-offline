"use client";
import { AlertTriangle, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" uses a red confirm button (default), "primary" uses blue. */
  tone?: "danger" | "primary";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setPending((cur) => {
        cur?.resolve(result);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!pending) return;
    document.body.style.overflow = "hidden";
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [pending, close]);

  const tone = pending?.tone ?? "danger";
  const confirmClasses =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
      : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";
  const iconWrapClasses =
    tone === "danger" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{
            background: "rgba(15,23,42,0.55)",
            animation: "confirm-fade 120ms ease-out",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
            style={{ animation: "confirm-pop 140ms cubic-bezier(0.16,1,0.3,1)" }}
          >
            <div className="flex items-start gap-4 p-5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconWrapClasses}`}
              >
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="text-base font-semibold text-slate-800">
                  {pending.title ?? "Are you sure?"}
                </h2>
                <div className="mt-1 text-sm leading-relaxed text-slate-500">
                  {pending.message}
                </div>
              </div>
              <button
                onClick={() => close(false)}
                className="text-slate-400 transition-colors hover:text-slate-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3.5">
              <button
                onClick={() => close(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${confirmClasses}`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes confirm-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes confirm-pop {
              from { opacity: 0; transform: translateY(8px) scale(0.97) }
              to { opacity: 1; transform: translateY(0) scale(1) }
            }
          `}</style>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Returns an async `confirm(options)` that resolves to true/false — a styled,
 * in-app replacement for the browser's `window.confirm`.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a <ConfirmProvider>");
  }
  return ctx;
}
