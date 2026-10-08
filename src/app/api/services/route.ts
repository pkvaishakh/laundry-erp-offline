import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(services).orderBy(services.name);
  return NextResponse.json(rows);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(services)
    .values({
      name: body.name,
      unit: body.unit ?? "item",
      price: String(body.price ?? 0),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
