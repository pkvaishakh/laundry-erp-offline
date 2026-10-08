import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { vendors } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(vendors).orderBy(vendors.name);
  return NextResponse.json(rows);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(vendors)
    .values({
      name: String(body.name).trim(),
      phone: body.phone || null,
      address: body.address || null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
