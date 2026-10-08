import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { expenses, accounts, vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  LedgerError,
  deriveExpenseStatus,
  generateJournalReference,
  getAccountByCode,
  postJournalEntry,
  validateDueDate,
  validateExpenseAmount,
  validateExpenseDate,
} from "@/lib/ledger";
import { generateExpenseCode } from "@/lib/utils";

type ExpenseRow = typeof expenses.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;
type VendorRow = typeof vendors.$inferSelect;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const categoryAccountId = searchParams.get("categoryAccountId");
  const vendorId = searchParams.get("vendorId");
  const paymentMethod = searchParams.get("paymentMethod");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search")?.toLowerCase().trim();
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const [allExpenses, allAccounts, allVendors] = await Promise.all([
    db.select().from(expenses) as Promise<ExpenseRow[]>,
    db.select().from(accounts) as Promise<AccountRow[]>,
    db.select().from(vendors) as Promise<VendorRow[]>,
  ]);

  const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
  const vendorsById = new Map(allVendors.map((v) => [v.id, v]));

  let rows = allExpenses.map((expense) => ({
    ...expense,
    derivedStatus: deriveExpenseStatus(expense),
    categoryName: accountsById.get(expense.categoryAccountId)?.name ?? "Unknown",
    vendorName: expense.vendorId ? vendorsById.get(expense.vendorId)?.name ?? null : null,
  }));

  if (status) rows = rows.filter((r) => r.derivedStatus === status);
  if (categoryAccountId) rows = rows.filter((r) => r.categoryAccountId === parseInt(categoryAccountId));
  if (vendorId) rows = rows.filter((r) => r.vendorId === parseInt(vendorId));
  if (paymentMethod) rows = rows.filter((r) => r.paymentMethod === paymentMethod);
  if (from) rows = rows.filter((r) => r.date >= from);
  if (to) rows = rows.filter((r) => r.date <= to);
  if (search) {
    rows = rows.filter(
      (r) =>
        r.expenseCode.toLowerCase().includes(search) ||
        r.description.toLowerCase().includes(search) ||
        (r.vendorName ?? "").toLowerCase().includes(search)
    );
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const total = rows.length;
  const summary = {
    total: rows.filter((r) => r.derivedStatus !== "cancelled").reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    paid: rows.filter((r) => r.derivedStatus === "paid").reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    pending: rows
      .filter((r) => r.derivedStatus === "pending" || r.derivedStatus === "overdue")
      .reduce((s, r) => s + parseFloat(String(r.amount)), 0),
    overdueCount: rows.filter((r) => r.derivedStatus === "overdue").length,
  };
  const page = rows.slice(offset, offset + limit);

  return NextResponse.json({ rows: page, total, summary });
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();

  try {
    const amount = validateExpenseAmount(body.amount);
    const date = validateExpenseDate(body.date);
    const description = String(body.description ?? "").trim();
    if (!description) throw new LedgerError("Description is required");

    const paymentMethod = String(body.paymentMethod ?? "");
    if (!["cash", "bank", "credit"].includes(paymentMethod)) {
      throw new LedgerError("Payment method must be cash, bank, or credit");
    }

    const categoryAccountId = parseInt(String(body.categoryAccountId));
    if (isNaN(categoryAccountId)) throw new LedgerError("A category is required");
    const [category] = await db.select().from(accounts).where(eq(accounts.id, categoryAccountId));
    if (!category || category.type !== "expense" || !category.active) {
      throw new LedgerError("Invalid or inactive expense category");
    }

    let vendorId: number | null = null;
    if (body.vendorId) {
      vendorId = parseInt(String(body.vendorId));
      const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
      if (!vendor) throw new LedgerError("Vendor not found");
    }

    const isImmediatelyPaid = paymentMethod !== "credit";
    const dueDate = isImmediatelyPaid ? null : validateDueDate(body.dueDate, date);

    const creditAccountCode = paymentMethod === "cash" ? "CASH" : paymentMethod === "bank" ? "BANK" : "AP";
    const creditAccount = await getAccountByCode(creditAccountCode);
    if (!creditAccount) throw new LedgerError(`Missing system account: ${creditAccountCode}`);

    const expenseCode = generateExpenseCode();

    const [expense] = await db
      .insert(expenses)
      .values({
        expenseCode,
        date,
        amount: amount.toFixed(2),
        description,
        categoryAccountId,
        vendorId,
        paymentMethod,
        status: isImmediatelyPaid ? "paid" : "pending",
        dueDate,
        paidDate: isImmediatelyPaid ? new Date() : null,
        paidMethod: isImmediatelyPaid ? paymentMethod : null,
      })
      .returning();

    try {
      const { entry, lines } = await postJournalEntry({
        reference: generateJournalReference(expenseCode),
        entryDate: date,
        description: `${expenseCode}: ${description}`,
        sourceType: "expense",
        sourceId: expense.id,
        lines: [
          { accountId: categoryAccountId, debit: amount, credit: 0 },
          { accountId: creditAccount.id, debit: 0, credit: amount },
        ],
      });

      return NextResponse.json({ ...expense, journalEntry: entry, journalLines: lines }, { status: 201 });
    } catch (ledgerErr) {
      // Compensating action: the offline store has no real transactions, so if
      // posting the journal entry fails after the expense row was inserted, we
      // undo the insert rather than leave an expense with no ledger entry.
      await db.delete(expenses).where(eq(expenses.id, expense.id));
      throw ledgerErr;
    }
  } catch (err) {
    if (err instanceof LedgerError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withWriteTransaction(handlePOST);
