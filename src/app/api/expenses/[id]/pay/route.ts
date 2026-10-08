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

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expenseId = parseInt(id);
  const body = await req.json();

  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
  if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  try {
    const method = String(body.method ?? "");
    if (!["cash", "bank"].includes(method)) {
      throw new LedgerError("Payment method must be cash or bank");
    }
    if (expense.paymentMethod !== "credit") {
      throw new LedgerError("Only payable (credit) expenses can be marked as paid");
    }
    const status = deriveExpenseStatus(expense);
    if (status !== "pending" && status !== "overdue") {
      throw new LedgerError(`Expense is already ${status}`);
    }

    const apAccount = await getAccountByCode("AP");
    const payAccount = await getAccountByCode(method === "cash" ? "CASH" : "BANK");
    if (!apAccount || !payAccount) throw new LedgerError("Missing system account");

    const amount = parseFloat(String(expense.amount));

    await postJournalEntry({
      reference: generateJournalReference(`PAY-${expense.expenseCode}`),
      entryDate: new Date().toISOString().split("T")[0],
      description: `Payment for ${expense.expenseCode}`,
      sourceType: "expense_payment",
      sourceId: expense.id,
      lines: [
        { accountId: apAccount.id, debit: amount, credit: 0 },
        { accountId: payAccount.id, debit: 0, credit: amount },
      ],
    });

    const [updated] = await db
      .update(expenses)
      .set({ status: "paid", paidDate: new Date(), paidMethod: method })
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
