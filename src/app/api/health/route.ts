import { getSqlite } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getSqlite().prepare("select 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
