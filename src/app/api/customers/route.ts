import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { like, or } from "drizzle-orm";

type CustomerRow = typeof customers.$inferSelect;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const matching: CustomerRow[] = q
    ? await db
        .select()
        .from(customers)
        .where(or(like(customers.name, `%${q}%`), like(customers.phone, `%${q}%`)))
        .orderBy(customers.name)
    : await db.select().from(customers).orderBy(customers.name);

  const total = matching.length;
  const totalOutstanding = matching.reduce((s: number, c: CustomerRow) => s + parseFloat(String(c.totalDue ?? 0)), 0);
  const rows = matching.slice(offset, offset + limit);

  return NextResponse.json({ rows, total, summary: { totalOutstanding } });
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  // Upsert by phone
  const existing = await db
    .select()
    .from(customers)
    .where(like(customers.phone, body.phone))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }
  const [row] = await db
    .insert(customers)
    .values({
      name: body.name,
      phone: body.phone,
      address: body.address ?? null,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
