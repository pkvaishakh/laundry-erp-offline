import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { orders, orderItems, customers, payments } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order] = await db
    .select({
      id: orders.id,
      orderCode: orders.orderCode,
      status: orders.status,
      deliveryDate: orders.deliveryDate,
      shelfNumber: orders.shelfNumber,
      notes: orders.notes,
      totalAmount: orders.totalAmount,
      paidAmount: orders.paidAmount,
      dueAmount: orders.dueAmount,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerAddress: customers.address,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(orders.id, parseInt(id)));

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, parseInt(id)));
  const orderPayments = await db.select().from(payments).where(eq(payments.orderId, parseInt(id)));

  return NextResponse.json({ ...order, items, payments: orderPayments });
}

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const orderId = parseInt(id);

  // Get current order
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If editing items, recalculate totals
  if (body.items) {
    const lineItems = body.items as { itemName: string; serviceName: string; itemId?: number; serviceId?: number; unit: string; quantity: number; price: number; subtotal: number }[];
    const newTotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
    const currentPaid = parseFloat(String(current.paidAmount ?? 0));
    const newDue = Math.max(0, newTotal - currentPaid);

    // Delete old items
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));

    // Insert new items
    if (lineItems.length > 0) {
      await db.insert(orderItems).values(
        lineItems.map((li) => ({
          orderId,
          itemId: li.itemId ?? null,
          serviceId: li.serviceId ?? null,
          itemName: li.itemName,
          serviceName: li.serviceName,
          unit: li.unit,
          quantity: String(li.quantity),
          price: String(li.price),
          subtotal: String(li.subtotal),
        }))
      );
    }

    // Update customer due difference
    const oldTotal = parseFloat(String(current.totalAmount ?? 0));
    const diff = newTotal - oldTotal;
    const [customer] = await db.select().from(customers).where(eq(customers.id, current.customerId));
    const newCustomerTotalDue = parseFloat(String(customer?.totalDue ?? 0)) + diff;
    await db
      .update(customers)
      .set({ totalDue: String(newCustomerTotalDue) })
      .where(eq(customers.id, current.customerId));

    const [updated] = await db
      .update(orders)
      .set({
        deliveryDate: body.deliveryDate ?? current.deliveryDate,
        shelfNumber: body.shelfNumber ?? current.shelfNumber,
        notes: body.notes ?? current.notes,
        totalAmount: String(newTotal),
        dueAmount: String(newDue),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return NextResponse.json(updated);
  }

  // Simple field updates (status, shelf, notes)
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status !== undefined) updateData.status = body.status;
  if (body.shelfNumber !== undefined) updateData.shelfNumber = body.shelfNumber;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.deliveryDate !== undefined) updateData.deliveryDate = body.deliveryDate;

  const [updated] = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, orderId))
    .returning();
  return NextResponse.json(updated);
}

async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id);

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Once money has changed hands, cancel the order (status) instead of
  // deleting it — deleting here would orphan the payment records and leave
  // the customer's total due out of sync with their payment history.
  const existingPayments = await db.select().from(payments).where(eq(payments.orderId, orderId));
  if (existingPayments.length > 0) {
    return NextResponse.json(
      { error: "This order has payments recorded against it. Cancel it instead of deleting." },
      { status: 400 }
    );
  }

  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));

  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId));
  const newCustomerTotalDue = Math.max(0, parseFloat(String(customer?.totalDue ?? 0)) - parseFloat(String(order.dueAmount ?? 0)));
  await db
    .update(customers)
    .set({ totalDue: String(newCustomerTotalDue) })
    .where(eq(customers.id, order.customerId));

  return NextResponse.json({ success: true });
}

export const PUT = withWriteTransaction(handlePUT);
export const DELETE = withWriteTransaction(handleDELETE);
