import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { serviceItemPrices } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type ServiceItemPriceRow = typeof serviceItemPrices.$inferSelect;

// Mirror of /api/services/[id]/item-prices, but keyed by item instead of
// service — lets you open one item and set/override its price across every
// service, instead of going service-by-service.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = (await db
    .select()
    .from(serviceItemPrices)
    .where(eq(serviceItemPrices.itemId, parseInt(id)))) as ServiceItemPriceRow[];
  return NextResponse.json(rows);
}

// Bulk upsert/delete: body { prices: { serviceId: number; price: number | null }[] }.
// A null/absent price deletes any existing override for that service (falls
// back to the service's base price); a numeric price creates or updates it.
async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = parseInt(id);
  const body = await req.json();
  const prices: Array<{ serviceId: number; price: number | string | null }> = body.prices ?? [];

  const existing = (await db
    .select()
    .from(serviceItemPrices)
    .where(eq(serviceItemPrices.itemId, itemId))) as ServiceItemPriceRow[];
  const existingByServiceId = new Map(existing.map((row) => [row.serviceId, row]));

  for (const entry of prices) {
    const serviceId = Number(entry.serviceId);
    if (isNaN(serviceId)) continue;
    const priceValue = entry.price === null || entry.price === "" ? null : parseFloat(String(entry.price));
    const current = existingByServiceId.get(serviceId);

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
    .where(eq(serviceItemPrices.itemId, itemId))) as ServiceItemPriceRow[];
  return NextResponse.json(rows);
}

export const PUT = withWriteTransaction(handlePUT);
