import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllAccountBalances } from "@/lib/ledger";
import { ACCOUNT_TYPES } from "@/lib/utils";

export async function GET() {
  const rows = await getAllAccountBalances();
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return NextResponse.json(rows);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  }
  const type = String(body.type ?? "");
  if (!ACCOUNT_TYPES.includes(type as (typeof ACCOUNT_TYPES)[number])) {
    return NextResponse.json({ error: "A valid account type is required" }, { status: 400 });
  }

  const prefix = type === "expense" ? "EXP" : type === "income" ? "INC" : type.slice(0, 3).toUpperCase();
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);

  // Codes are looked up by exact string elsewhere (CASH/BANK/AP/...), so a
  // collision would silently make two accounts share a ledger identity —
  // retry with a fresh random suffix rather than risk that.
  let code = "";
  let existing = true;
  for (let attempt = 0; attempt < 5 && existing; attempt++) {
    code = `${prefix}-${slug}-${Math.floor(Math.random() * 900) + 100}`;
    const [row] = await db.select().from(accounts).where(eq(accounts.code, code));
    existing = !!row;
  }

  const [row] = await db
    .insert(accounts)
    .values({ code, name, type })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

export const POST = withWriteTransaction(handlePOST);
