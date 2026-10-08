import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { payments, orders, customers } from "@/db/schema";
import { eq, desc, gte, lte, and, or, like } from "drizzle-orm";
import { LedgerError, generateJournalReference, getAccountByCode, postJournalEntry } from "@/lib/ledger";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const customerId = searchParams.get("customerId");
  const q = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const conditions = [];
  if (customerId) conditions.push(eq(payments.customerId, parseInt(customerId)));
  if (from) conditions.push(gte(payments.createdAt, new Date(from)));
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(payments.createdAt, toDate));
  }
  if (q) conditions.push(or(like(customers.name, `%${q}%`), like(customers.phone, `%${q}%`)));

  const matching = await db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      customerId: payments.customerId,
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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(payments.createdAt));

  type PaymentRow = (typeof matching)[number];
  const sumBy = (pred: (p: PaymentRow) => boolean) =>
    matching.filter(pred).reduce((s: number, p: PaymentRow) => s + parseFloat(String(p.amount)), 0);

  const total = matching.length;
  const summary = {
    total: sumBy(() => true),
    byCash: sumBy((p) => p.method === "cash"),
    byCard: sumBy((p) => p.method === "card"),
    byUpi: sumBy((p) => p.method === "upi"),
  };
  const rows = matching.slice(offset, offset + limit);

  return NextResponse.json({ rows, total, summary });
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();

  try {
    const amount = parseFloat(String(body.amount));
    if (isNaN(amount) || amount <= 0) {
      throw new LedgerError("Invalid amount");
    }

    const customerId = parseInt(String(body.customerId));
    if (isNaN(customerId)) throw new LedgerError("A customer is required");
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!customer) throw new LedgerError("Customer not found");

    const amountCents = Math.round(amount * 100);

    let order: typeof orders.$inferSelect | undefined;
    if (body.orderId) {
      [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
      if (!order) throw new LedgerError("Order not found");
      if (order.customerId !== customerId) throw new LedgerError("Order does not belong to this customer");
      const dueCents = Math.round(parseFloat(String(order.dueAmount ?? 0)) * 100);
      if (amountCents > dueCents) {
        throw new LedgerError(`Payment of ${amount.toFixed(2)} exceeds the order's due amount of ${(dueCents / 100).toFixed(2)}`);
      }
    } else {
      const dueCents = Math.round(parseFloat(String(customer.totalDue ?? 0)) * 100);
      if (amountCents > dueCents) {
        throw new LedgerError(`Payment of ${amount.toFixed(2)} exceeds the customer's outstanding balance of ${(dueCents / 100).toFixed(2)}`);
      }
    }

    const method = body.method ?? "cash";
    const depositAccountCode = method === "cash" ? "CASH" : "BANK";
    const depositAccount = await getAccountByCode(depositAccountCode);
    const salesAccount = await getAccountByCode("SALES");
    if (!depositAccount || !salesAccount) throw new LedgerError("Missing system account");

    const [payment] = await db
      .insert(payments)
      .values({
        orderId: body.orderId ?? null,
        customerId,
        amount: String(amount),
        method,
        note: body.note ?? null,
        paymentType: body.paymentType ?? "order",
      })
      .returning();

    try {
      await postJournalEntry({
        reference: generateJournalReference(`PMT-${payment.id}`),
        entryDate: new Date().toISOString().split("T")[0],
        description: `Payment received from ${customer.name}${order ? ` (${order.orderCode})` : ""}`,
        sourceType: "payment",
        sourceId: payment.id,
        lines: [
          { accountId: depositAccount.id, debit: amount, credit: 0 },
          { accountId: salesAccount.id, debit: 0, credit: amount },
        ],
      });
    } catch (ledgerErr) {
      // Compensating action: the offline store has no real transactions, so if
      // posting the journal entry fails after the payment row was inserted, we
      // undo the insert rather than leave a payment with no ledger entry.
      await db.delete(payments).where(eq(payments.id, payment.id));
      throw ledgerErr;
    }

    // Update order paid/due if linked to order
    if (order) {
      const newPaid = parseFloat(String(order.paidAmount ?? 0)) + amount;
      const newDue = Math.max(0, parseFloat(String(order.totalAmount ?? 0)) - newPaid);
      await db
        .update(orders)
        .set({
          paidAmount: String(newPaid),
          dueAmount: String(newDue),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    }

    // Update customer total due
    const newCustomerTotalDue = Math.max(0, parseFloat(String(customer.totalDue ?? 0)) - amount);
    await db
      .update(customers)
      .set({ totalDue: String(newCustomerTotalDue) })
      .where(eq(customers.id, customerId));

    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    if (err instanceof LedgerError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = withWriteTransaction(handlePOST);
