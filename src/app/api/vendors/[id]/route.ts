import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { eq } from "drizzle-orm";

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db
    .update(vendors)
    .set({
      name: body.name,
      phone: body.phone || null,
      address: body.address || null,
      active: body.active ?? true,
    })
    .where(eq(vendors.id, parseInt(id)))
    .returning();
  return NextResponse.json(row);
}

async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.update(vendors).set({ active: false }).where(eq(vendors.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export const PUT = withWriteTransaction(handlePUT);
export const DELETE = withWriteTransaction(handleDELETE);
