import { NextResponse } from "next/server";
import { db } from "@/db";
import { serviceItemPrices } from "@/db/schema";

// All per-item price overrides across every service, used by the New Order
// page to resolve the correct price once both a service and item are picked.
export async function GET() {
  const rows = await db.select().from(serviceItemPrices);
  return NextResponse.json(rows);
}
