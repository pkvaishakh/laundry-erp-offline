import { NextRequest, NextResponse } from "next/server";
import { db, getSqlite } from "@/db";
import { orders, customers, payments, orderItems, expenses, accounts, vendors, journalEntries, journalEntryLines } from "@/db/schema";
import { eq, and, gte, lte, desc, sql, ne } from "drizzle-orm";
import { computeBalance, deriveExpenseStatus, getAllAccountBalances } from "@/lib/ledger";

type ExpenseRow = typeof expenses.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;
type VendorRow = typeof vendors.$inferSelect;
type JournalEntryRow = typeof journalEntries.$inferSelect;
type JournalLineRow = typeof journalEntryLines.$inferSelect;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "orders";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const customerId = searchParams.get("customerId");

  const fromDate = from ? new Date(from) : new Date(new Date().setDate(1)); // First of month
  fromDate.setHours(0, 0, 0, 0);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  // Plain YYYY-MM-DD strings for comparing against `date`-typed columns
  // (expenses.date, expenses.dueDate, journalEntries.entryDate).
  const fromStr = from ?? fromDate.toISOString().split("T")[0];
  const toStr = to ?? new Date().toISOString().split("T")[0];

  if (type === "orders") {
    const conditions = [
      gte(orders.createdAt, fromDate),
      lte(orders.createdAt, toDate),
    ];
    if (customerId) conditions.push(eq(orders.customerId, parseInt(customerId)));

    const rows = await db
      .select({
        id: orders.id,
        orderCode: orders.orderCode,
        status: orders.status,
        deliveryDate: orders.deliveryDate,
        totalAmount: orders.totalAmount,
        paidAmount: orders.paidAmount,
        dueAmount: orders.dueAmount,
        createdAt: orders.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));

    const summary = {
      totalOrders: rows.length,
      totalRevenue: rows.reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.totalAmount ?? 0)), 0),
      totalCollected: rows.reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.paidAmount ?? 0)), 0),
      totalDue: rows.reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.dueAmount ?? 0)), 0),
    };

    return NextResponse.json({ rows, summary });
  }

  if (type === "payments") {
    const conditions = [
      gte(payments.createdAt, fromDate),
      lte(payments.createdAt, toDate),
    ];
    if (customerId) conditions.push(eq(payments.customerId, parseInt(customerId)));

    const rows = await db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        amount: payments.amount,
        method: payments.method,
        note: payments.note,
        paymentType: payments.paymentType,
        createdAt: payments.createdAt,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(payments)
      .innerJoin(customers, eq(payments.customerId, customers.id))
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt));

    const summary = {
      totalPayments: rows.length,
      totalAmount: rows.reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.amount ?? 0)), 0),
      byCash: rows.filter((r: Record<string, unknown>) => r.method === "cash").reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.amount ?? 0)), 0),
      byCard: rows.filter((r: Record<string, unknown>) => r.method === "card").reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.amount ?? 0)), 0),
      byUpi: rows.filter((r: Record<string, unknown>) => r.method === "upi").reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.amount ?? 0)), 0),
    };

    return NextResponse.json({ rows, summary });
  }

  if (type === "dues") {
    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        address: customers.address,
        totalDue: customers.totalDue,
        orderCount: sql<number>`count(${orders.id})`,
        lastOrder: sql<string>`max(${orders.createdAt})`,
      })
      .from(customers)
      .leftJoin(orders, and(eq(customers.id, orders.customerId), ne(orders.status, "cancelled")))
      .where(sql`${customers.totalDue} > 0`)
      .groupBy(customers.id, customers.name, customers.phone, customers.address, customers.totalDue)
      .orderBy(desc(customers.totalDue));

    const total = rows.reduce((s: number, r: Record<string, unknown>) => s + parseFloat(String(r.totalDue ?? 0)), 0);
    return NextResponse.json({ rows, total });
  }

  if (type === "sales") {
    // Sales by service
    const salesData = getSqlite()
      .prepare(
        `SELECT
          oi.service_name,
          oi.unit,
          SUM(oi.quantity) AS total_qty,
          SUM(oi.subtotal) AS total_revenue,
          COUNT(DISTINCT oi.order_id) AS order_count
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.created_at >= ? AND o.created_at <= ?
          AND o.status != 'cancelled'
        GROUP BY oi.service_name, oi.unit
        ORDER BY total_revenue DESC`
      )
      .all(fromDate.toISOString(), toDate.toISOString());

    return NextResponse.json({ rows: salesData });
  }

  if (type === "expenses") {
    const [allExpenses, allAccounts, allVendors] = await Promise.all([
      db.select().from(expenses) as Promise<ExpenseRow[]>,
      db.select().from(accounts) as Promise<AccountRow[]>,
      db.select().from(vendors) as Promise<VendorRow[]>,
    ]);
    const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
    const vendorsById = new Map(allVendors.map((v) => [v.id, v]));

    const rows = allExpenses
      .filter((e) => e.date >= fromStr && e.date <= toStr)
      .map((e) => ({
        ...e,
        derivedStatus: deriveExpenseStatus(e),
        categoryName: accountsById.get(e.categoryAccountId)?.name ?? "Unknown",
        vendorName: e.vendorId ? vendorsById.get(e.vendorId)?.name ?? null : null,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      byCategory[r.categoryName] = (byCategory[r.categoryName] ?? 0) + parseFloat(String(r.amount));
    }

    const summary = {
      totalExpenses: rows
        .filter((r) => r.derivedStatus !== "cancelled")
        .reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      totalPaid: rows.filter((r) => r.derivedStatus === "paid").reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      totalPending: rows
        .filter((r) => r.derivedStatus === "pending" || r.derivedStatus === "overdue")
        .reduce((s, r) => s + parseFloat(String(r.amount)), 0),
      byCategory,
    };

    return NextResponse.json({ rows, summary });
  }

  if (type === "trial-balance") {
    const [allAccounts, allLines] = await Promise.all([
      db.select().from(accounts) as Promise<AccountRow[]>,
      db.select().from(journalEntryLines) as Promise<JournalLineRow[]>,
    ]);

    const rows = allAccounts
      .filter((a) => a.active)
      .map((account) => {
        let debit = 0;
        let credit = 0;
        for (const line of allLines) {
          if (line.accountId !== account.id) continue;
          debit += parseFloat(String(line.debit ?? 0));
          credit += parseFloat(String(line.credit ?? 0));
        }
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          totalDebit: debit,
          totalCredit: credit,
          balance: computeBalance(account, allLines),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const sumDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
    const sumCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
    const balanced = Math.round(sumDebit * 100) === Math.round(sumCredit * 100);

    return NextResponse.json({ rows, summary: { sumDebit, sumCredit, balanced } });
  }

  if (type === "balance-sheet") {
    const balances = await getAllAccountBalances();
    const byCode = new Map(balances.map((b) => [b.code, b]));
    const cash = byCode.get("CASH")?.balance ?? 0;
    const bank = byCode.get("BANK")?.balance ?? 0;
    const ap = byCode.get("AP")?.balance ?? 0;
    const capital = byCode.get("CAPITAL")?.balance ?? 0;
    const assets = cash + bank;
    const liabilities = ap;
    const equity = capital;
    const balanced = Math.round(assets * 100) === Math.round((liabilities + equity) * 100);

    return NextResponse.json({
      rows: [
        { section: "Assets", name: "Cash", amount: cash },
        { section: "Assets", name: "Bank", amount: bank },
        { section: "Liabilities", name: "Accounts Payable", amount: ap },
        { section: "Equity", name: "Owner's Capital", amount: capital },
      ],
      summary: { assets, liabilities, equity, balanced },
    });
  }

  if (type === "general-ledger") {
    const accountIdParam = searchParams.get("accountId");
    const [allEntries, allLines, allAccounts] = await Promise.all([
      db.select().from(journalEntries) as Promise<JournalEntryRow[]>,
      db.select().from(journalEntryLines) as Promise<JournalLineRow[]>,
      db.select().from(accounts) as Promise<AccountRow[]>,
    ]);
    const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
    const entriesById = new Map(allEntries.map((e) => [e.id, e]));

    let lines = allLines
      .map((l) => {
        const entry = entriesById.get(l.journalEntryId);
        return {
          ...l,
          entryDate: entry?.entryDate ?? "",
          reference: entry?.reference ?? "",
          entryDescription: entry?.description ?? "",
          accountName: accountsById.get(l.accountId)?.name ?? "Unknown",
          accountCode: accountsById.get(l.accountId)?.code ?? "",
        };
      })
      .filter((l) => l.entryDate >= fromStr && l.entryDate <= toStr);

    if (accountIdParam) {
      lines = lines.filter((l) => l.accountId === parseInt(accountIdParam));
    }

    lines.sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.id - b.id));

    const runningByAccount = new Map<number, number>();
    const rows = lines.map((l) => {
      const account = accountsById.get(l.accountId);
      const normalDebit = account ? account.type === "asset" || account.type === "expense" : true;
      const delta = normalDebit
        ? parseFloat(String(l.debit)) - parseFloat(String(l.credit))
        : parseFloat(String(l.credit)) - parseFloat(String(l.debit));
      const next = (runningByAccount.get(l.accountId) ?? 0) + delta;
      runningByAccount.set(l.accountId, next);
      return { ...l, runningBalance: next };
    });

    return NextResponse.json({ rows });
  }

  if (type === "ap-aging") {
    const today = new Date().toISOString().split("T")[0];
    const [allExpenses, allVendors] = await Promise.all([
      db.select().from(expenses) as Promise<ExpenseRow[]>,
      db.select().from(vendors) as Promise<VendorRow[]>,
    ]);
    const vendorsById = new Map(allVendors.map((v) => [v.id, v]));

    const bucketFor = (dueDate: string | null): string => {
      if (!dueDate || dueDate >= today) return "Current";
      const days = Math.floor((new Date(today).getTime() - new Date(dueDate).getTime()) / 86400000);
      if (days <= 30) return "1-30";
      if (days <= 60) return "31-60";
      if (days <= 90) return "61-90";
      return "90+";
    };

    const rows = allExpenses
      .map((e) => ({ ...e, derivedStatus: deriveExpenseStatus(e) }))
      .filter((e) => e.paymentMethod === "credit" && (e.derivedStatus === "pending" || e.derivedStatus === "overdue"))
      .map((e) => ({
        id: e.id,
        expenseCode: e.expenseCode,
        description: e.description,
        vendorName: e.vendorId ? vendorsById.get(e.vendorId)?.name ?? null : null,
        amount: e.amount,
        dueDate: e.dueDate,
        bucket: bucketFor(e.dueDate),
      }))
      .sort((a, b) => ((a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : 1));

    const buckets = ["Current", "1-30", "31-60", "61-90", "90+"];
    const summary: Record<string, number> = {};
    for (const b of buckets) summary[b] = 0;
    for (const r of rows) summary[r.bucket] += parseFloat(String(r.amount));
    const total = rows.reduce((s, r) => s + parseFloat(String(r.amount)), 0);

    return NextResponse.json({ rows, summary: { ...summary, total } });
  }

  return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
}
