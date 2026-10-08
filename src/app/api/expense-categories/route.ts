import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

// Expense categories ARE chart-of-accounts entries with type "expense" —
// this keeps "category" and "GL account" as a single concept, matching how
// a real chart of accounts works, instead of a duplicate lookup table.

export async function GET() {
  const rows = (await db.select().from(accounts).where(eq(accounts.type, "expense"))) as (typeof accounts.$inferSelect)[];
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(rows);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);
  const code = `EXP-${slug}-${Math.floor(Math.random() * 900) + 100}`;

  const [row] = await db
    .insert(accounts)
    .values({ code, name, type: "expense" })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
