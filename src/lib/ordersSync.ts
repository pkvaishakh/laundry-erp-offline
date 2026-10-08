"use client";
import { useEffect, useRef } from "react";

// Keeps list views of orders in sync with edits made elsewhere — another tab
// (e.g. /orders/2 opened separately), or a page the browser restored from its
// back/forward cache, where no mount effect re-runs and the list stays stale.
const CHANNEL_NAME = "laundrypro-orders";

/** Call after any mutation to an order (status, shelf, payment, delivery, edit). */
export function notifyOrdersChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage("changed");
  channel.close();
}

/**
 * Runs `onChange` when an order is changed in another tab/window, when this
 * window becomes visible or regains focus (restored from minimise, or brought
 * back in front of another window — Electron only reports "hidden" when
 * minimised, so visibilitychange alone misses the latter), or when the page is
 * restored from the bfcache.
 */
export function useOrdersChanged(onChange: () => void) {
  const callbackRef = useRef(onChange);
  useEffect(() => { callbackRef.current = onChange; }, [onChange]);

  useEffect(() => {
    // Restoring a window fires both visibilitychange and focus; refetch once.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { pending = null; callbackRef.current(); }, 50);
    };
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) run(); };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    channel?.addEventListener("message", run);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (pending) clearTimeout(pending);
      channel?.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
