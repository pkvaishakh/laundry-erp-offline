import { NextRequest, NextResponse } from "next/server";
import { withWriteTransaction } from "@/db/transaction";
import {
  executeBulkDelete,
  resolveBulkDelete,
  type BulkDeleteFilters,
  type BulkDeleteType,
} from "@/lib/bulkDelete";

const VALID_TYPES: BulkDeleteType[] = ["orders", "customers", "payments", "expenses"];

const asInt = (value: unknown): number | null => {
  if (value == null || value === "" || value === "all") return null;
  const n = parseInt(String(value));
  return Number.isInteger(n) ? n : null;
};

const asText = (value: unknown): string | null => {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
};

async function handlePOST(req: NextRequest) {
  const body = await req.json();
  const type = body.type as BulkDeleteType;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Unknown data type" }, { status: 400 });
  }

  const filters: BulkDeleteFilters = {
    from: asText(body.filters?.from),
    to: asText(body.filters?.to),
    status: asText(body.filters?.status),
    customerId: asInt(body.filters?.customerId),
    method: asText(body.filters?.method),
    dueState: (asText(body.filters?.dueState) as BulkDeleteFilters["dueState"]) ?? "all",
    q: asText(body.filters?.q),
    categoryAccountId: asInt(body.filters?.categoryAccountId),
    vendorId: asInt(body.filters?.vendorId),
  };

  // The preview and the delete both re-resolve from these filters — the
  // client never sends back a list of ids to trust.
  if (body.dryRun !== false) {
    const plan = await resolveBulkDelete(type, filters);
    return NextResponse.json({
      type: plan.type,
      counts: plan.counts,
      sample: plan.sample,
      totalMatched: plan.totalMatched,
      blocked: plan.blocked,
      blockedReason: plan.blockedReason,
    });
  }

  const result = await executeBulkDelete(type, filters);
  return NextResponse.json({ deleted: true, ...result });
}

export const POST = withWriteTransaction(handlePOST);
