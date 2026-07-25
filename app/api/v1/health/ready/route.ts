import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

// Readiness: cheap, bounded checks on critical dependencies only (DB connectivity).
// Never exposes secrets or detailed provider information — that's /health/dependencies, admin-only.
export async function GET() {
  const checks: Record<string, boolean> = {};

  try {
    await db.execute(sql`select 1`);
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json({ status: ready ? "ready" : "not_ready", checks }, { status: ready ? 200 : 503 });
}
