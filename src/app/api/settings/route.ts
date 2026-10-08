import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ORDER_CODE_PREFIX_KEY, sanitizeOrderCodePrefix } from "@/lib/utils";

export async function GET() {
  const rows = await db.select().from(settings);
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return NextResponse.json(result);
}

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  for (const [key, raw] of Object.entries(body)) {
    const value = key === ORDER_CODE_PREFIX_KEY ? sanitizeOrderCodePrefix(raw) : String(raw);
    // Explicit update-or-insert rather than onConflictDoUpdate, which the
    // offline mock DB ignores (it would append a duplicate row per save).
    const [existing] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (existing) {
      await db.update(settings).set({ value }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }
  }
  return NextResponse.json({ success: true });
}

export const POST = withWriteTransaction(handlePOST);
