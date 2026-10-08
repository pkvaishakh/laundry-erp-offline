import { db } from "@/db";
import {
  customers,
  orders,
  orderItems,
  payments,
  expenses,
  journalEntries,
  journalEntryLines,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveExpenseStatus } from "@/lib/ledger";

export type BulkDeleteType = "orders" | "customers" | "payments" | "expenses";

export interface BulkDeleteFilters {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  customerId?: number | null;
  method?: string | null;
  /** orders: filter on outstanding balance; customers: filter on total due */
  dueState?: "all" | "due" | "paid" | null;
  /** customers: name/phone search */
  q?: string | null;
  categoryAccountId?: number | null;
  vendorId?: number | null;
}

export interface BulkDeleteCounts {
  customers: number;
  orders: number;
  orderItems: number;
  payments: number;
  expenses: number;
  journalEntries: number;
}

export interface BulkDeleteSampleRow {
  id: number;
  label: string;
  sub: string;
  amount: string | null;
}

export interface BulkDeletePlan {
  type: BulkDeleteType;
  counts: BulkDeleteCounts;
  sample: BulkDeleteSampleRow[];
  totalMatched: number;
  /** Matched the filters but can't be deleted — see `blockedReason`. */
  blocked: number;
  blockedReason: string | null;
}

interface ResolvedPlan extends BulkDeletePlan {
  ids: {
    customers: number[];
    orders: number[];
    orderItems: number[];
    payments: number[];
    expenses: number[];
    journalEntries: number[];
    journalEntryLines: number[];
  };
  /** Rows that survive but whose denormalized totals must be recomputed. */
  affectedOrderIds: number[];
  affectedCustomerIds: number[];
}

type OrderRow = typeof orders.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;
type JournalEntryRow = typeof journalEntries.$inferSelect;
type JournalLineRow = typeof journalEntryLines.$inferSelect;

const SAMPLE_LIMIT = 20;

/** Journal entry sourceTypes that are owned by an expense record. */
const EXPENSE_ENTRY_SOURCES = ["expense", "expense_payment", "expense_void"];

const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;

/**
 * A timestamp column is stored as an ISO string; filters arrive as YYYY-MM-DD.
 * Comparing the date prefix keeps this predictable (and avoids the offline
 * store's date-coercion edge cases) at the cost of being UTC-based.
 */
const dayOf = (value: unknown) => String(value ?? "").slice(0, 10);

function inDateRange(value: unknown, from?: string | null, to?: string | null): boolean {
  const day = dayOf(value);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Deletes rows one primary key at a time. (Originally a workaround for the old
 * JSON mock store, which mis-evaluated `inArray`; kept as-is — it runs inside
 * the request's write transaction, so it is still all-or-nothing.)
 */
async function deleteByIds(
  table: typeof customers | typeof orders | typeof orderItems | typeof payments | typeof expenses | typeof journalEntries | typeof journalEntryLines,
  ids: number[]
): Promise<number> {
  let deleted = 0;
  for (const id of ids) {
    if (!Number.isInteger(id)) continue;
    await db.delete(table).where(eq(table.id, id));
    deleted++;
  }
  return deleted;
}

async function loadAll() {
  const [allCustomers, allOrders, allOrderItems, allPayments, allExpenses, allEntries, allLines] =
    await Promise.all([
      db.select().from(customers) as Promise<CustomerRow[]>,
      db.select().from(orders) as Promise<OrderRow[]>,
      db.select().from(orderItems) as Promise<OrderItemRow[]>,
      db.select().from(payments) as Promise<PaymentRow[]>,
      db.select().from(expenses) as Promise<ExpenseRow[]>,
      db.select().from(journalEntries) as Promise<JournalEntryRow[]>,
      db.select().from(journalEntryLines) as Promise<JournalLineRow[]>,
    ]);
  return { allCustomers, allOrders, allOrderItems, allPayments, allExpenses, allEntries, allLines };
}

/**
 * Works out exactly what a bulk delete would remove, without writing anything.
 * Filtering happens in JS rather than in `where` clauses because the offline
 * store only implements a handful of comparison operators.
 */
export async function resolveBulkDelete(
  type: BulkDeleteType,
  filters: BulkDeleteFilters
): Promise<ResolvedPlan> {
  const { allCustomers, allOrders, allOrderItems, allPayments, allExpenses, allEntries, allLines } =
    await loadAll();

  const customersById = new Map(allCustomers.map((c) => [c.id, c]));

  // A period close sweeps income/expense balances into Capital and records
  // what it covered by journal entry id (see api/accounts/close-period).
  // Deleting a transaction posted before that close strips its effect out of
  // Cash/AP but leaves it baked into Capital, so the Balance Sheet stops
  // balancing — and re-closing can't repair it, because the close only ever
  // looks at entries newer than the last one. Those records are off limits.
  const lastCloseEntryId = allEntries
    .filter((e) => e.sourceType === "closing")
    .reduce((max, e) => Math.max(max, e.id), 0);

  const lockedPaymentIds = new Set<number>();
  const lockedExpenseIds = new Set<number>();
  if (lastCloseEntryId > 0) {
    for (const entry of allEntries) {
      if (entry.sourceId == null || entry.id > lastCloseEntryId) continue;
      if (entry.sourceType === "payment") lockedPaymentIds.add(entry.sourceId);
      else if (EXPENSE_ENTRY_SOURCES.includes(entry.sourceType)) lockedExpenseIds.add(entry.sourceId);
    }
  }
  // An order/customer can't go without its payments going too, so a locked
  // payment locks whatever it hangs off as well.
  const lockedOrderIds = new Set(
    allPayments.filter((p) => p.orderId != null && lockedPaymentIds.has(p.id)).map((p) => p.orderId as number)
  );
  const lockedCustomerIds = new Set(
    allPayments.filter((p) => lockedPaymentIds.has(p.id)).map((p) => p.customerId)
  );

  let blocked = 0;
  const blockedReason =
    "already closed into an accounting period — deleting them would unbalance the Balance Sheet";

  let targetCustomers: CustomerRow[] = [];
  let targetOrders: OrderRow[] = [];
  let targetPayments: PaymentRow[] = [];
  let targetExpenses: ExpenseRow[] = [];
  let sample: BulkDeleteSampleRow[] = [];
  let totalMatched = 0;

  if (type === "orders") {
    const matched = allOrders.filter((o) => {
      if (!inDateRange(o.createdAt, filters.from, filters.to)) return false;
      if (filters.status && filters.status !== "all" && o.status !== filters.status) return false;
      if (filters.customerId && o.customerId !== filters.customerId) return false;
      if (filters.dueState === "due" && num(o.dueAmount) <= 0) return false;
      if (filters.dueState === "paid" && num(o.dueAmount) > 0) return false;
      return true;
    });
    targetOrders = matched.filter((o) => !lockedOrderIds.has(o.id));
    blocked = matched.length - targetOrders.length;
    const orderIdSet = new Set(targetOrders.map((o) => o.id));
    targetPayments = allPayments.filter((p) => p.orderId != null && orderIdSet.has(p.orderId));
    totalMatched = targetOrders.length;
    sample = targetOrders.slice(0, SAMPLE_LIMIT).map((o) => ({
      id: o.id,
      label: o.orderCode,
      sub: `${customersById.get(o.customerId)?.name ?? "Unknown"} · ${dayOf(o.createdAt)} · ${o.status}`,
      amount: String(o.totalAmount),
    }));
  } else if (type === "customers") {
    const q = (filters.q ?? "").trim().toLowerCase();
    const matched = allCustomers.filter((c) => {
      if (!inDateRange(c.createdAt, filters.from, filters.to)) return false;
      if (q && !(c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))) return false;
      if (filters.dueState === "due" && num(c.totalDue) <= 0) return false;
      if (filters.dueState === "paid" && num(c.totalDue) > 0) return false;
      return true;
    });
    targetCustomers = matched.filter((c) => !lockedCustomerIds.has(c.id));
    blocked = matched.length - targetCustomers.length;
    const customerIdSet = new Set(targetCustomers.map((c) => c.id));
    targetOrders = allOrders.filter((o) => customerIdSet.has(o.customerId));
    targetPayments = allPayments.filter((p) => customerIdSet.has(p.customerId));
    totalMatched = targetCustomers.length;
    sample = targetCustomers.slice(0, SAMPLE_LIMIT).map((c) => ({
      id: c.id,
      label: c.name,
      sub: `${c.phone} · joined ${dayOf(c.createdAt)}`,
      amount: String(c.totalDue),
    }));
  } else if (type === "payments") {
    const matched = allPayments.filter((p) => {
      if (!inDateRange(p.createdAt, filters.from, filters.to)) return false;
      if (filters.customerId && p.customerId !== filters.customerId) return false;
      if (filters.method && filters.method !== "all" && p.method !== filters.method) return false;
      return true;
    });
    targetPayments = matched.filter((p) => !lockedPaymentIds.has(p.id));
    blocked = matched.length - targetPayments.length;
    totalMatched = targetPayments.length;
    sample = targetPayments.slice(0, SAMPLE_LIMIT).map((p) => ({
      id: p.id,
      label: `${p.method.toUpperCase()} payment`,
      sub: `${customersById.get(p.customerId)?.name ?? "Unknown"} · ${dayOf(p.createdAt)}`,
      amount: String(p.amount),
    }));
  } else {
    const today = new Date().toISOString().split("T")[0];
    const matched = allExpenses.filter((e) => {
      if (filters.from && e.date < filters.from) return false;
      if (filters.to && e.date > filters.to) return false;
      if (filters.status && filters.status !== "all" && deriveExpenseStatus(e, today) !== filters.status) return false;
      if (filters.categoryAccountId && e.categoryAccountId !== filters.categoryAccountId) return false;
      if (filters.vendorId && e.vendorId !== filters.vendorId) return false;
      return true;
    });
    targetExpenses = matched.filter((e) => !lockedExpenseIds.has(e.id));
    blocked = matched.length - targetExpenses.length;
    totalMatched = targetExpenses.length;
    sample = targetExpenses.slice(0, SAMPLE_LIMIT).map((e) => ({
      id: e.id,
      label: e.expenseCode,
      sub: `${e.description} · ${e.date} · ${deriveExpenseStatus(e, today)}`,
      amount: String(e.amount),
    }));
  }

  const orderIds = targetOrders.map((o) => o.id);
  const orderIdSet = new Set(orderIds);
  const paymentIds = targetPayments.map((p) => p.id);
  const paymentIdSet = new Set(paymentIds);
  const expenseIds = targetExpenses.map((e) => e.id);
  const expenseIdSet = new Set(expenseIds);
  const customerIds = targetCustomers.map((c) => c.id);

  const orderItemIds = allOrderItems.filter((oi) => orderIdSet.has(oi.orderId)).map((oi) => oi.id);

  // Every deleted payment/expense takes its journal entry with it, so the
  // ledger stays balanced (debits still equal credits) after the delete.
  const targetEntries = allEntries.filter((entry) => {
    if (entry.sourceId == null) return false;
    if (entry.sourceType === "payment") return paymentIdSet.has(entry.sourceId);
    if (EXPENSE_ENTRY_SOURCES.includes(entry.sourceType)) return expenseIdSet.has(entry.sourceId);
    return false;
  });
  const entryIds = targetEntries.map((e) => e.id);
  const entryIdSet = new Set(entryIds);
  const entryLineIds = allLines.filter((l) => entryIdSet.has(l.journalEntryId)).map((l) => l.id);

  // Orders/customers that survive but lose payments underneath them need
  // their denormalized paid/due totals recomputed.
  const deletedCustomerIdSet = new Set(customerIds);
  const affectedOrderIds = [
    ...new Set(targetPayments.map((p) => p.orderId).filter((id): id is number => id != null)),
  ].filter((id) => !orderIdSet.has(id));
  const affectedCustomerIds = [
    ...new Set([...targetOrders.map((o) => o.customerId), ...targetPayments.map((p) => p.customerId)]),
  ].filter((id) => !deletedCustomerIdSet.has(id));

  return {
    type,
    totalMatched,
    blocked,
    blockedReason: blocked > 0 ? blockedReason : null,
    sample,
    counts: {
      customers: customerIds.length,
      orders: orderIds.length,
      orderItems: orderItemIds.length,
      payments: paymentIds.length,
      expenses: expenseIds.length,
      journalEntries: entryIds.length,
    },
    ids: {
      customers: customerIds,
      orders: orderIds,
      orderItems: orderItemIds,
      payments: paymentIds,
      expenses: expenseIds,
      journalEntries: entryIds,
      journalEntryLines: entryLineIds,
    },
    affectedOrderIds,
    affectedCustomerIds,
  };
}

/**
 * Rebuilds `orders.paidAmount/dueAmount` and `customers.totalDue` from the
 * rows that are left. These columns are denormalized and maintained by hand
 * (see CLAUDE.md), so after a bulk delete they're recomputed from surviving
 * data rather than adjusted incrementally — that way the totals are correct
 * even if they had already drifted.
 */
async function recomputeTotals(orderIds: number[], customerIds: number[]) {
  if (orderIds.length === 0 && customerIds.length === 0) return;

  const [survivingOrders, survivingPayments] = await Promise.all([
    db.select().from(orders) as Promise<OrderRow[]>,
    db.select().from(payments) as Promise<PaymentRow[]>,
  ]);

  const paidByOrder = new Map<number, number>();
  const paidByCustomer = new Map<number, number>();
  for (const p of survivingPayments) {
    if (p.orderId != null) paidByOrder.set(p.orderId, (paidByOrder.get(p.orderId) ?? 0) + num(p.amount));
    paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) ?? 0) + num(p.amount));
  }

  const orderIdSet = new Set(orderIds);
  for (const order of survivingOrders) {
    if (!orderIdSet.has(order.id)) continue;
    const paid = paidByOrder.get(order.id) ?? 0;
    const due = Math.max(0, num(order.totalAmount) - paid);
    await db
      .update(orders)
      .set({ paidAmount: paid.toFixed(2), dueAmount: due.toFixed(2), updatedAt: new Date() })
      .where(eq(orders.id, order.id));
  }

  // Customer due mirrors how it's maintained elsewhere: orders add their
  // total, payments subtract theirs. Cancelled orders never counted toward it.
  const billedByCustomer = new Map<number, number>();
  const refreshedOrders = (await db.select().from(orders)) as OrderRow[];
  for (const o of refreshedOrders) {
    if (o.status === "cancelled") continue;
    billedByCustomer.set(o.customerId, (billedByCustomer.get(o.customerId) ?? 0) + num(o.totalAmount));
  }

  for (const customerId of customerIds) {
    const billed = billedByCustomer.get(customerId) ?? 0;
    const paid = paidByCustomer.get(customerId) ?? 0;
    await db
      .update(customers)
      .set({ totalDue: Math.max(0, billed - paid).toFixed(2) })
      .where(eq(customers.id, customerId));
  }
}

/**
 * Runs the delete. The offline store has no transactions, so the full plan is
 * resolved up front and rows are removed children-first (ledger lines before
 * entries, items/payments before orders, orders before customers) — an
 * interruption can leave data removed, but never leaves a child row pointing
 * at a parent that's already gone.
 */
export async function executeBulkDelete(
  type: BulkDeleteType,
  filters: BulkDeleteFilters
): Promise<BulkDeletePlan> {
  const plan = await resolveBulkDelete(type, filters);

  await deleteByIds(journalEntryLines, plan.ids.journalEntryLines);
  await deleteByIds(journalEntries, plan.ids.journalEntries);
  await deleteByIds(orderItems, plan.ids.orderItems);
  await deleteByIds(payments, plan.ids.payments);
  await deleteByIds(orders, plan.ids.orders);
  await deleteByIds(customers, plan.ids.customers);
  await deleteByIds(expenses, plan.ids.expenses);

  await recomputeTotals(plan.affectedOrderIds, plan.affectedCustomerIds);

  return {
    type: plan.type,
    counts: plan.counts,
    sample: plan.sample,
    totalMatched: plan.totalMatched,
    blocked: plan.blocked,
    blockedReason: plan.blockedReason,
  };
}
