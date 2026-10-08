import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { customers, orders, payments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [customer] = await db.select().from(customers).where(eq(customers.id, parseInt(id)));
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customerOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, parseInt(id)))
    .orderBy(desc(orders.createdAt));

  const customerPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.customerId, parseInt(id)))
    .orderBy(desc(payments.createdAt));

  return NextResponse.json({ customer, orders: customerOrders, payments: customerPayments });
}

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db
    .update(customers)
    .set({ name: body.name, phone: body.phone, address: body.address })
    .where(eq(customers.id, parseInt(id)))
    .returning();
  return NextResponse.json(row);
}

export const PUT = withWriteTransaction(handlePUT);
