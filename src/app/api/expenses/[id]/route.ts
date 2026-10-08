import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { expenses, accounts, vendors, journalEntries, journalEntryLines } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deriveExpenseStatus } from "@/lib/ledger";

type AccountRow = typeof accounts.$inferSelect;
type VendorRow = typeof vendors.$inferSelect;
type JournalEntryRow = typeof journalEntries.$inferSelect;
type JournalLineRow = typeof journalEntryLines.$inferSelect;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expenseId = parseInt(id);

  const [expense] = (await db.select().from(expenses).where(eq(expenses.id, expenseId))) as (typeof expenses.$inferSelect)[];
  if (!expense) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  const [category] = (await db.select().from(accounts).where(eq(accounts.id, expense.categoryAccountId))) as AccountRow[];
  const vendor = expense.vendorId
    ? ((await db.select().from(vendors).where(eq(vendors.id, expense.vendorId))) as VendorRow[])[0]
    : null;

  const [relatedEntries, allLines, allAccounts] = await Promise.all([
    db.select().from(journalEntries).where(eq(journalEntries.sourceId, expenseId)) as Promise<JournalEntryRow[]>,
    db.select().from(journalEntryLines) as Promise<JournalLineRow[]>,
    db.select().from(accounts) as Promise<AccountRow[]>,
  ]);

  const accountsById = new Map(allAccounts.map((a) => [a.id, a]));

  const entriesWithLines = relatedEntries
    .sort((a, b) => a.id - b.id)
    .map((entry) => ({
      ...entry,
      lines: allLines
        .filter((l) => l.journalEntryId === entry.id)
        .map((l) => ({
          ...l,
          accountName: accountsById.get(l.accountId)?.name ?? "Unknown",
          accountCode: accountsById.get(l.accountId)?.code ?? "",
        })),
    }));

  return NextResponse.json({
    ...expense,
    derivedStatus: deriveExpenseStatus(expense),
    categoryName: category?.name ?? "Unknown",
    vendorName: vendor?.name ?? null,
    journalEntries: entriesWithLines,
  });
}
