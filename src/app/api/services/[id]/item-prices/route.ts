import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { serviceItemPrices } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type ServiceItemPriceRow = typeof serviceItemPrices.$inferSelect;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = (await db
    .select()
    .from(serviceItemPrices)
    .where(eq(serviceItemPrices.serviceId, parseInt(id)))) as ServiceItemPriceRow[];
  return NextResponse.json(rows);
}

// Bulk upsert/delete: body { prices: { itemId: number; price: number | null }[] }.
// A null/absent price deletes any existing override for that item (falls back
// to the service's base price); a numeric price creates or updates the row.
async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const serviceId = parseInt(id);
  const body = await req.json();
  const prices: Array<{ itemId: number; price: number | string | null }> = body.prices ?? [];

  const existing = (await db
    .select()
    .from(serviceItemPrices)
    .where(eq(serviceItemPrices.serviceId, serviceId))) as ServiceItemPriceRow[];
  const existingByItemId = new Map(existing.map((row) => [row.itemId, row]));

  for (const entry of prices) {
    const itemId = Number(entry.itemId);
    if (isNaN(itemId)) continue;
    const priceValue = entry.price === null || entry.price === "" ? null : parseFloat(String(entry.price));
    const current = existingByItemId.get(itemId);

    if (priceValue === null || isNaN(priceValue)) {
      if (current) {
        await db
          .delete(serviceItemPrices)
          .where(and(eq(serviceItemPrices.serviceId, serviceId), eq(serviceItemPrices.itemId, itemId)));
      }
      continue;
    }

    if (current) {
      await db
        .update(serviceItemPrices)
        .set({ price: priceValue.toFixed(2) })
        .where(and(eq(serviceItemPrices.serviceId, serviceId), eq(serviceItemPrices.itemId, itemId)));
    } else {
      await db.insert(serviceItemPrices).values({ serviceId, itemId, price: priceValue.toFixed(2) });
    }
  }

  const rows = (await db
    .select()
    .from(serviceItemPrices)
    .where(eq(serviceItemPrices.serviceId, serviceId))) as ServiceItemPriceRow[];
  return NextResponse.json(rows);
}

export const PUT = withWriteTransaction(handlePUT);
