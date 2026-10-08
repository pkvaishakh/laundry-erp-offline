import { db } from "@/db";
import { accounts, journalEntries, journalEntryLines } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MAX_EXPENSE_DUE_DAYS } from "@/lib/utils";

// Thrown for any double-entry / input-validation violation. Routes catch this
// and translate it into a 400 response — never a partial write.
export class LedgerError extends Error {}

// Looked up by hardcoded code throughout the app (payments, expenses,
// period close) — deactivating, renaming the code, or retyping one of these
// would silently break those lookups, so the accounts module must refuse to
// touch them beyond editing the display name.
export const CORE_ACCOUNT_CODES = ["CASH", "BANK", "AP", "CAPITAL", "SALES"] as const;

type Account = typeof accounts.$inferSelect;
type JournalLineRow = typeof journalEntryLines.$inferSelect;

interface JournalEntryLineInput {
  accountId: number;
  debit: number;
  credit: number;
}

export function generateJournalReference(tag: string): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `JE-${tag}-${y}${m}${d}${rand}`;
}

function toCents(n: number): number {
  return Math.round(n * 100);
}

/**
 * Validates and posts a balanced double-entry journal entry (header + lines).
 * Every debit must equal every credit, and every line must be exactly one
 * of debit-only or credit-only. Throws LedgerError before any write happens
 * if the entry is invalid.
 */
export async function postJournalEntry(input: {
  reference: string;
  entryDate: string;
  description?: string | null;
  sourceType: string;
  sourceId?: number | null;
  lines: JournalEntryLineInput[];
}) {
  const { reference, entryDate, description, sourceType, sourceId, lines } = input;

  if (!lines || lines.length < 2) {
    throw new LedgerError("A journal entry requires at least two lines");
  }

  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const line of lines) {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit < 0 || credit < 0) {
      throw new LedgerError("Journal entry line amounts cannot be negative");
    }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new LedgerError("Each journal entry line must have exactly one of debit or credit set");
    }
    totalDebitCents += toCents(debit);
    totalCreditCents += toCents(credit);
  }

  if (totalDebitCents === 0) {
    throw new LedgerError("Journal entry amount must be greater than zero");
  }
  if (totalDebitCents !== totalCreditCents) {
    throw new LedgerError(
      `Journal entry is not balanced: total debit ${(totalDebitCents / 100).toFixed(2)} != total credit ${(totalCreditCents / 100).toFixed(2)}`
    );
  }

  const [entry] = await db
    .insert(journalEntries)
    .values({
      reference,
      entryDate,
      description: description ?? null,
      sourceType,
      sourceId: sourceId ?? null,
    })
    .returning();

  const insertedLines = await db
    .insert(journalEntryLines)
    .values(
      lines.map((line) => ({
        journalEntryId: entry.id,
        accountId: line.accountId,
        debit: (Number(line.debit) || 0).toFixed(2),
        credit: (Number(line.credit) || 0).toFixed(2),
      }))
    )
    .returning();

  return { entry, lines: insertedLines };
}

export async function getAllAccounts(): Promise<Account[]> {
  return db.select().from(accounts);
}

export async function getAllJournalLines(): Promise<JournalLineRow[]> {
  return db.select().from(journalEntryLines);
}

export async function getAccountByCode(code: string): Promise<Account | undefined> {
  const [account] = await db.select().from(accounts).where(eq(accounts.code, code));
  return account;
}

/** Asset/expense accounts carry a normal debit balance; liability/equity carry a normal credit balance. */
export function computeBalance(account: Account, lines: JournalLineRow[]): number {
  let debitSum = 0;
  let creditSum = 0;
  for (const line of lines) {
    if (line.accountId !== account.id) continue;
    debitSum += parseFloat(String(line.debit ?? 0));
    creditSum += parseFloat(String(line.credit ?? 0));
  }
  const normalDebit = account.type === "asset" || account.type === "expense";
  return normalDebit ? debitSum - creditSum : creditSum - debitSum;
}

export async function getAllAccountBalances(): Promise<Array<Account & { balance: number }>> {
  const [allAccounts, allLines] = await Promise.all([getAllAccounts(), getAllJournalLines()]);
  return allAccounts.map((account) => ({
    ...account,
    balance: computeBalance(account, allLines),
  }));
}

/** "overdue" is never persisted — it's always derived from the stored status + due date. */
export function deriveExpenseStatus(
  expense: { status: string; dueDate: string | null },
  today: string = new Date().toISOString().split("T")[0]
): string {
  if (expense.status === "pending" && expense.dueDate && expense.dueDate < today) {
    return "overdue";
  }
  return expense.status;
}

export function validateExpenseAmount(amount: unknown): number {
  const n = parseFloat(String(amount));
  if (isNaN(n) || n <= 0) {
    throw new LedgerError("Amount must be a positive number");
  }
  return n;
}

export function validateExpenseDate(dateStr: unknown): string {
  if (!dateStr || typeof dateStr !== "string" || isNaN(new Date(dateStr).getTime())) {
    throw new LedgerError("A valid expense date is required");
  }
  const today = new Date().toISOString().split("T")[0];
  if (dateStr > today) {
    throw new LedgerError("Expense date cannot be in the future");
  }
  return dateStr;
}

export function validateDueDate(dueDateStr: unknown, expenseDate: string): string {
  if (!dueDateStr || typeof dueDateStr !== "string" || isNaN(new Date(dueDateStr).getTime())) {
    throw new LedgerError("A valid due date is required for a payable (credit) expense");
  }
  if (dueDateStr < expenseDate) {
    throw new LedgerError("Due date cannot be before the expense date");
  }
  const maxDate = new Date(expenseDate);
  maxDate.setDate(maxDate.getDate() + MAX_EXPENSE_DUE_DAYS);
  const maxDateStr = maxDate.toISOString().split("T")[0];
  if (dueDateStr > maxDateStr) {
    throw new LedgerError(`Due date cannot be more than ${MAX_EXPENSE_DUE_DAYS} days after the expense date`);
  }
  return dueDateStr;
}
