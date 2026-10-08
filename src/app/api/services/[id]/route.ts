import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const [row] = await db
    .update(services)
    .set({
      name: body.name,
      unit: body.unit,
      price: String(body.price),
      active: body.active ?? true,
    })
    .where(eq(services.id, parseInt(id)))
    .returning();
  return NextResponse.json(row);
}

async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db
    .update(services)
    .set({ active: false })
    .where(eq(services.id, parseInt(id)));
  return NextResponse.json({ success: true });
}

export const PUT = withWriteTransaction(handlePUT);
export const DELETE = withWriteTransaction(handleDELETE);
