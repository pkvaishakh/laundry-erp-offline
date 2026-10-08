import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, customers, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "ready";

  const settingsRows = await db.select().from(settings);
  const config: Record<string, string> = {};
  for (const s of settingsRows) config[s.key] = s.value;

  const shopName = config.shop_name ?? "LaundryPro";

  const pendingOrders = await db
    .select({
      orderCode: orders.orderCode,
      status: orders.status,
      totalAmount: orders.totalAmount,
      dueAmount: orders.dueAmount,
      deliveryDate: orders.deliveryDate,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(orders.status, status));

  const messages = pendingOrders.map((o: Record<string, unknown>) => {
    const phone = String(o.customerPhone ?? "").replace(/[^0-9+]/g, "");
    let msg = "";
    if (status === "ready") {
      msg = `Hello ${o.customerName}! Your laundry order *${o.orderCode}* is ready for pickup. Amount: ₹${parseFloat(String(o.totalAmount)).toFixed(2)}. Please collect from ${shopName}. Thank you! 🙏`;
    } else if (status === "pending") {
      msg = `Hello ${o.customerName}! Your laundry order *${o.orderCode}* is being processed. Expected delivery: ${o.deliveryDate}. - ${shopName}`;
    } else {
      msg = `Hello ${o.customerName}! Regarding your laundry order *${o.orderCode}* at ${shopName}. Please contact us for any queries.`;
    }
    return {
      phone,
      customerName: o.customerName,
      orderCode: o.orderCode,
      message: msg,
      whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,
    };
  });

  return NextResponse.json({ messages, count: messages.length, shopName });
}
