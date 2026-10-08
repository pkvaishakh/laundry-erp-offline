import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, customers, payments, expenses } from "@/db/schema";
import { deriveExpenseStatus, getAllAccountBalances } from "@/lib/ledger";

type OrderRow = typeof orders.$inferSelect;
type CustomerRow = typeof customers.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;

// Local-time YYYY-MM-DD. toISOString() is UTC, which shifts "today" by a day
// for part of every day in non-UTC timezones (e.g. before 05:30 in IST).
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const toNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  // All aggregates are computed in JS from plain row selects rather than SQL
  // count()/sum()/groupBy/execute(), which the offline mock DB can't evaluate
  // (it returns 0/empty for them). This works identically against Postgres.
  const [allOrders, allCustomers, allPayments, allExpenses, accountBalances] = await Promise.all([
    db.select().from(orders) as Promise<OrderRow[]>,
    db.select().from(customers) as Promise<CustomerRow[]>,
    db.select().from(payments) as Promise<PaymentRow[]>,
    db.select().from(expenses) as Promise<ExpenseRow[]>,
    getAllAccountBalances(),
  ]);

  const now = new Date();
  const todayStr = localDateKey(now);
  const monthStartStr = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  const createdKey = (row: { createdAt: Date | string }) => localDateKey(new Date(row.createdAt));

  const activeOrders = allOrders.filter((o) => o.status !== "cancelled");

  // Order counts by status
  const statusTally = new Map<string, number>();
  for (const o of allOrders) statusTally.set(o.status, (statusTally.get(o.status) ?? 0) + 1);
  const statusCounts = [...statusTally].map(([status, count]) => ({ status, count }));

  // Today's orders / collection
  const todayOrders = allOrders.filter((o) => createdKey(o) === todayStr).length;
  const todayPaymentRows = allPayments.filter((p) => createdKey(p) === todayStr);
  const todayCollection = round2(todayPaymentRows.reduce((s, p) => s + toNum(p.amount), 0));

  // Total dues across all customers
  const totalDues = round2(allCustomers.reduce((s, c) => s + toNum(c.totalDue), 0));

  // Total revenue (all time, excluding cancelled)
  const totalRevenue = round2(activeOrders.reduce((s, o) => s + toNum(o.totalAmount), 0));

  // Weekly revenue (last 7 days, one bucket per day including empty days)
  const weeklyBuckets = new Map<string, { date: string; revenue: number; order_count: number }>();
  for (let i = 6; i >= 0; i--) {
    const key = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    weeklyBuckets.set(key, { date: key, revenue: 0, order_count: 0 });
  }
  for (const o of activeOrders) {
    const bucket = weeklyBuckets.get(createdKey(o));
    if (bucket) {
      bucket.revenue = round2(bucket.revenue + toNum(o.totalAmount));
      bucket.order_count++;
    }
  }
  const weeklyData = [...weeklyBuckets.values()];

  // Monthly revenue (last 6 months, including current)
  const monthlyBuckets = new Map<string, { month: string; revenue: number; order_count: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthlyBuckets.set(`${d.getFullYear()}-${d.getMonth()}`, { month, revenue: 0, order_count: 0 });
  }
  for (const o of activeOrders) {
    const d = new Date(o.createdAt);
    const bucket = monthlyBuckets.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) {
      bucket.revenue = round2(bucket.revenue + toNum(o.totalAmount));
      bucket.order_count++;
    }
  }
  const monthlyData = [...monthlyBuckets.values()];

  // Payment method breakdown today. `total` is a number so the pie chart can
  // size slices from it.
  const methodTally = new Map<string, { total: number; count: number }>();
  for (const p of todayPaymentRows) {
    const entry = methodTally.get(p.method) ?? { total: 0, count: 0 };
    entry.total += toNum(p.amount);
    entry.count++;
    methodTally.set(p.method, entry);
  }
  const paymentMethods = [...methodTally].map(([method, e]) => ({ method, total: round2(e.total), count: e.count }));

  // Top customers: largest dues first, then by order count
  const orderCountByCustomer = new Map<number, number>();
  for (const o of allOrders) orderCountByCustomer.set(o.customerId, (orderCountByCustomer.get(o.customerId) ?? 0) + 1);
  const topCustomers = allCustomers
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      totalDue: c.totalDue,
      orderCount: orderCountByCustomer.get(c.id) ?? 0,
    }))
    .sort((a, b) => toNum(b.totalDue) - toNum(a.totalDue) || b.orderCount - a.orderCount)
    .slice(0, 10);

  // Recent orders
  const customerById = new Map(allCustomers.map((c) => [c.id, c]));
  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      status: o.status,
      totalAmount: o.totalAmount,
      dueAmount: o.dueAmount,
      createdAt: o.createdAt,
      customerName: customerById.get(o.customerId)?.name ?? "",
      customerPhone: customerById.get(o.customerId)?.phone ?? "",
    }));

  // Orders due for delivery today or overdue and not yet delivered
  const overdueOrders = allOrders.filter(
    (o) => o.deliveryDate <= todayStr && ["pending", "processing", "ready"].includes(o.status)
  ).length;

  // Expense stats
  const expensesWithStatus = allExpenses.map((e) => ({ ...e, derivedStatus: deriveExpenseStatus(e, todayStr) }));

  const todayExpenses = expensesWithStatus
    .filter((e) => e.date === todayStr && e.derivedStatus !== "cancelled")
    .reduce((s, e) => s + toNum(e.amount), 0);

  const totalExpensesThisMonth = expensesWithStatus
    .filter((e) => e.date >= monthStartStr && e.date <= todayStr && e.derivedStatus !== "cancelled")
    .reduce((s, e) => s + toNum(e.amount), 0);

  const balancesByCode = new Map(accountBalances.map((a) => [a.code, a.balance]));

  const recentExpenses = [...expensesWithStatus]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      expenseCode: e.expenseCode,
      description: e.description,
      amount: e.amount,
      date: e.date,
      status: e.derivedStatus,
    }));

  return NextResponse.json({
    statusCounts,
    todayOrders,
    todayCollection,
    totalDues,
    totalRevenue,
    weeklyData,
    monthlyData,
    paymentMethods,
    topCustomers,
    recentOrders,
    overdueOrders,
    todayExpenses: round2(todayExpenses),
    totalExpensesThisMonth: round2(totalExpensesThisMonth),
    totalPayables: balancesByCode.get("AP") ?? 0,
    cashBalance: balancesByCode.get("CASH") ?? 0,
    bankBalance: balancesByCode.get("BANK") ?? 0,
    pendingExpensesCount: expensesWithStatus.filter((e) => e.derivedStatus === "pending").length,
    overdueExpensesCount: expensesWithStatus.filter((e) => e.derivedStatus === "overdue").length,
    recentExpenses,
  });
}
