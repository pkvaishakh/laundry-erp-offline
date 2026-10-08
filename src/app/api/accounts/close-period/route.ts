import { NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { accounts, journalEntries, journalEntryLines } from "@/db/schema";
import {
  LedgerError,
  computeBalance,
  generateJournalReference,
  getAccountByCode,
  postJournalEntry,
} from "@/lib/ledger";

// Owner's Capital is only touched here, via an explicit closing entry that
// sweeps each expense account's accumulated balance and each income account's
// accumulated balance into Capital (Debit Capital + Debit each income account,
// Credit each expense account + Credit Capital for net income) — the standard
// sole-proprietor closing-entry pattern, run since this app has no separate
// income-summary step.
type AccountRow = typeof accounts.$inferSelect;
type JournalEntryRow = typeof journalEntries.$inferSelect;
type JournalLineRow = typeof journalEntryLines.$inferSelect;

async function handlePOST() {
  try {
    const [allAccounts, allEntries, allLines] = await Promise.all([
      db.select().from(accounts) as Promise<AccountRow[]>,
      db.select().from(journalEntries) as Promise<JournalEntryRow[]>,
      db.select().from(journalEntryLines) as Promise<JournalLineRow[]>,
    ]);

    const closingEntries = allEntries.filter((e) => e.sourceType === "closing");
    // Identify "already closed" by journal entry id, not entryDate: entryDate
    // is a plain YYYY-MM-DD date, so a second close on the same calendar day
    // as the first would compare `entryDate > lastCloseDate` as false for any
    // activity recorded that same day — silently and permanently excluding it
    // from ever being swept to Capital. Entry ids are assigned in insertion
    // order, so "id greater than the closing entry's id" unambiguously means
    // "posted after the last close" regardless of what date it's dated for.
    const lastCloseEntryId = closingEntries.length
      ? closingEntries.reduce((max, e) => Math.max(max, e.id), 0)
      : null;

    const entriesById = new Map(allEntries.map((e) => [e.id, e]));
    const linesSinceClose = lastCloseEntryId
      ? allLines.filter((l) => {
          const entry = entriesById.get(l.journalEntryId);
          return entry && entry.id > lastCloseEntryId;
        })
      : allLines;

    const expenseBalances = allAccounts
      .filter((a) => a.type === "expense")
      .map((account) => ({ account, balance: computeBalance(account, linesSinceClose) }))
      .filter((b) => b.balance > 0.004);
    const incomeBalances = allAccounts
      .filter((a) => a.type === "income")
      .map((account) => ({ account, balance: computeBalance(account, linesSinceClose) }))
      .filter((b) => b.balance > 0.004);

    if (expenseBalances.length === 0 && incomeBalances.length === 0) {
      return NextResponse.json({ message: "Nothing to close — no income or expense activity since the last close.", closed: [] });
    }

    const capitalAccount = await getAccountByCode("CAPITAL");
    if (!capitalAccount) throw new LedgerError("Missing system account: CAPITAL");

    const totalExpense = expenseBalances.reduce((s, b) => s + b.balance, 0);
    const totalIncome = incomeBalances.reduce((s, b) => s + b.balance, 0);
    const netIncome = totalIncome - totalExpense;

    const lines = [
      ...expenseBalances.map((b) => ({ accountId: b.account.id, debit: 0, credit: b.balance })),
      ...incomeBalances.map((b) => ({ accountId: b.account.id, debit: b.balance, credit: 0 })),
    ];
    if (netIncome > 0.004) {
      lines.push({ accountId: capitalAccount.id, debit: 0, credit: netIncome });
    } else if (netIncome < -0.004) {
      lines.push({ accountId: capitalAccount.id, debit: -netIncome, credit: 0 });
    }

    const { entry } = await postJournalEntry({
      reference: generateJournalReference("CLOSE"),
      entryDate: new Date().toISOString().split("T")[0],
      description: "Period close: income and expenses swept to Capital",
      sourceType: "closing",
      sourceId: null,
      lines,
    });

    return NextResponse.json({
      entry,
      closed: [
        ...expenseBalances.map((b) => ({ accountId: b.account.id, name: b.account.name, amount: -b.balance })),
        ...incomeBalances.map((b) => ({ accountId: b.account.id, name: b.account.name, amount: b.balance })),
      ],
      totalExpense,
      totalIncome,
      netIncome,
    });
  } catch (err) {
    if (err instanceof LedgerError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withWriteTransaction(handlePOST);
