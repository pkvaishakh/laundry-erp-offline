import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { orders, orderItems, customers } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

// Deliver specific items or full order
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json();
  const itemIds: number[] | undefined = body.itemIds; // if undefined = full delivery

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();

  if (!itemIds || itemIds.length === 0) {
    // Full delivery
    await db
      .update(orderItems)
      .set({ delivered: true, deliveredAt: now })
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.delivered, false)));

    await db
      .update(orders)
      .set({ status: "delivered", updatedAt: now })
      .where(eq(orders.id, orderId));
  } else {
    // Partial item delivery
    for (const itemId of itemIds) {
      await db
        .update(orderItems)
        .set({ delivered: true, deliveredAt: now })
        .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
    }

    // Check if all items delivered
    const remaining = await db
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.delivered, false)));

    if (remaining.length === 0) {
      await db
        .update(orders)
        .set({ status: "delivered", updatedAt: now })
        .where(eq(orders.id, orderId));
    }
  }

  const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
  return NextResponse.json(updated);
}

export const POST = withWriteTransaction(handlePOST);
