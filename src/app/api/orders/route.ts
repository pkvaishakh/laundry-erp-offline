import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { orders, orderItems, customers } from "@/db/schema";
import { eq, desc, like, or, and, gte, lte, gt } from "drizzle-orm";
import { withNextOrderCode } from "@/lib/orderCode";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const deliveryFrom = searchParams.get("deliveryFrom");
  const deliveryTo = searchParams.get("deliveryTo");
  const due = searchParams.get("due"); // "due" | "paid"
  const shelfNumber = searchParams.get("shelfNumber");
  const customerId = searchParams.get("customerId");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // Build join query
  const conditions = [];
  if (status && status !== "all") conditions.push(eq(orders.status, status));
  if (customerId) conditions.push(eq(orders.customerId, parseInt(customerId)));
  if (from) conditions.push(gte(orders.createdAt, new Date(from)));
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(orders.createdAt, toDate));
  }
  if (deliveryFrom) conditions.push(gte(orders.deliveryDate, deliveryFrom));
  if (deliveryTo) conditions.push(lte(orders.deliveryDate, deliveryTo));
  if (due === "due") conditions.push(gt(orders.dueAmount, "0"));
  if (due === "paid") conditions.push(lte(orders.dueAmount, "0"));
  if (shelfNumber) conditions.push(like(orders.shelfNumber, `%${shelfNumber}%`));

  const baseQuery = db
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
    .innerJoin(customers, eq(orders.customerId, customers.id));

  let matching;
  if (q) {
    const searchCondition = or(
      like(orders.orderCode, `%${q}%`),
      like(customers.name, `%${q}%`),
      like(customers.phone, `%${q}%`)
    );
    const allConditions = conditions.length > 0 ? and(...conditions, searchCondition) : searchCondition;
    matching = await baseQuery.where(allConditions).orderBy(desc(orders.createdAt));
  } else if (conditions.length > 0) {
    matching = await baseQuery.where(and(...conditions)).orderBy(desc(orders.createdAt));
  } else {
    matching = await baseQuery.orderBy(desc(orders.createdAt));
  }

  const total = matching.length;
  const rows = matching.slice(offset, offset + limit);

  return NextResponse.json({ rows, total });
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();

  // Find or create customer
  let customer;
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, body.phone))
    .limit(1);

  if (existing.length > 0) {
    customer = existing[0];
    if (body.name && body.name !== customer.name) {
      const [updated] = await db
        .update(customers)
        .set({ name: body.name, address: body.address ?? customer.address })
        .where(eq(customers.id, customer.id))
        .returning();
      customer = updated;
    }
  } else {
    const [newCustomer] = await db
      .insert(customers)
      .values({ name: body.name, phone: body.phone, address: body.address ?? null })
      .returning();
    customer = newCustomer;
  }

  // Calculate totals
  const lineItems: { itemName: string; serviceName: string; itemId?: number | null; serviceId?: number; unit: string; quantity: number; price: number; subtotal: number; itemBreakdown?: string | null }[] = body.items ?? [];
  const totalAmount = lineItems.reduce((sum, li) => sum + li.subtotal, 0);

  const insertOrder = async (orderCode: string) => {
    const [row] = await db
      .insert(orders)
      .values({
        orderCode,
        customerId: customer.id,
        status: "pending",
        deliveryDate: body.deliveryDate,
        shelfNumber: body.shelfNumber ?? null,
        notes: body.notes ?? null,
        totalAmount: String(totalAmount),
        paidAmount: "0",
        dueAmount: String(totalAmount),
      })
      .returning();
    return row;
  };

  const order = body.orderCode ? await insertOrder(body.orderCode) : await withNextOrderCode(insertOrder);

  // Insert line items
  if (lineItems.length > 0) {
    await db.insert(orderItems).values(
      lineItems.map((li) => ({
        orderId: order.id,
        itemId: li.itemId ?? null,
        serviceId: li.serviceId ?? null,
        itemName: li.itemName,
        serviceName: li.serviceName,
        unit: li.unit,
        quantity: String(li.quantity),
        price: String(li.price),
        subtotal: String(li.subtotal),
        itemBreakdown: li.itemBreakdown ?? null,
      }))
    );
  }

  // Update customer due
  const newCustomerTotalDue = parseFloat(String(customer.totalDue ?? 0)) + totalAmount;
  await db
    .update(customers)
    .set({ totalDue: String(newCustomerTotalDue) })
    .where(eq(customers.id, customer.id));

  return NextResponse.json({ ...order, customer }, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
