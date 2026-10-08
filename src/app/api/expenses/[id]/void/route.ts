import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  LedgerError,
  deriveExpenseStatus,
  generateJournalReference,
  getAccountByCode,
  postJournalEntry,
} from "@/lib/ledger";

async function handlePOST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expenseId = parseInt(id);

  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
  if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  try {
    const status = deriveExpenseStatus(expense);
    if (status !== "pending" && status !== "overdue") {
      throw new LedgerError(
        status === "paid"
          ? "Cannot void a paid expense — settle it with a manual adjusting entry instead"
          : `Expense is already ${status}`
      );
    }

    const creditAccountCode =
      expense.paymentMethod === "cash" ? "CASH" : expense.paymentMethod === "bank" ? "BANK" : "AP";
    const creditAccount = await getAccountByCode(creditAccountCode);
    if (!creditAccount) throw new LedgerError(`Missing system account: ${creditAccountCode}`);

    const amount = parseFloat(String(expense.amount));

    await postJournalEntry({
      reference: generateJournalReference(`VOID-${expense.expenseCode}`),
      entryDate: new Date().toISOString().split("T")[0],
      description: `Void ${expense.expenseCode}`,
      sourceType: "expense_void",
      sourceId: expense.id,
      lines: [
        { accountId: expense.categoryAccountId, debit: 0, credit: amount },
        { accountId: creditAccount.id, debit: amount, credit: 0 },
      ],
    });

    const [updated] = await db
      .update(expenses)
      .set({ status: "cancelled" })
      .where(eq(expenses.id, expenseId))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof LedgerError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withWriteTransaction(handlePOST);
