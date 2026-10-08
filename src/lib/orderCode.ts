import { db } from "@/db";
import { orders, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ORDER_CODE_PREFIX_KEY, formatOrderCode, sanitizeOrderCodePrefix } from "@/lib/utils";

async function getOrderCodePrefix(): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, ORDER_CODE_PREFIX_KEY)).limit(1);
  return sanitizeOrderCodePrefix(row?.value);
}

/**
 * Next sequential code for the configured prefix, e.g. ORD00001, ORD00002.
 * Continues from the highest existing code with the same prefix, so changing
 * the prefix starts a fresh sequence and switching back resumes the old one.
 * Numbers past 99999 simply grow wider (ORD100000).
 */
async function nextOrderCode(): Promise<string> {
  const prefix = await getOrderCodePrefix();
  const pattern = new RegExp(`^${prefix.replace(/[-/]/g, "\\$&")}(\\d+)$`);
  const existing: { orderCode: string }[] = await db.select({ orderCode: orders.orderCode }).from(orders);
  let max = 0;
  for (const { orderCode } of existing) {
    const m = pattern.exec(orderCode);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return formatOrderCode(prefix, max + 1);
}

// Serializes "pick next code + insert order" within this process so two
// orders submitted at the same moment can't both get the same number. Kept on
// globalThis because `next dev` bundles each route with its own module copy.
const lockGlobal = globalThis as unknown as { __orderCodeLock?: Promise<unknown> };

export function withNextOrderCode<T>(fn: (orderCode: string) => Promise<T>): Promise<T> {
  const run = (lockGlobal.__orderCodeLock ?? Promise.resolve()).then(async () => fn(await nextOrderCode()));
  lockGlobal.__orderCodeLock = run.catch(() => {});
  return run;
}
