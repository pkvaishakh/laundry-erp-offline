import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CORE_ACCOUNT_CODES } from "@/lib/ledger";

async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const accountId = parseInt(id);

  const [current] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!current) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const isCore = CORE_ACCOUNT_CODES.includes(current.code as (typeof CORE_ACCOUNT_CODES)[number]);
  if (isCore && body.active === false) {
    return NextResponse.json(
      { error: `${current.code} is a core system account and can't be deactivated` },
      { status: 400 }
    );
  }

  const name = body.name !== undefined ? String(body.name).trim() : current.name;
  if (!name) {
    return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  }

  const [row] = await db
    .update(accounts)
    .set({ name, active: body.active ?? current.active })
    .where(eq(accounts.id, accountId))
    .returning();
  return NextResponse.json(row);
}

async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = parseInt(id);

  const [current] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!current) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  if (CORE_ACCOUNT_CODES.includes(current.code as (typeof CORE_ACCOUNT_CODES)[number])) {
    return NextResponse.json(
      { error: `${current.code} is a core system account and can't be deactivated` },
      { status: 400 }
    );
  }

  await db.update(accounts).set({ active: false }).where(eq(accounts.id, accountId));
  return NextResponse.json({ success: true });
}

export const PUT = withWriteTransaction(handlePUT);
export const DELETE = withWriteTransaction(handleDELETE);
