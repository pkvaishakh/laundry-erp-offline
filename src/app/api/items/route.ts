import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { items } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(items).orderBy(items.name);
  return NextResponse.json(rows);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(items)
    .values({ name: body.name })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
