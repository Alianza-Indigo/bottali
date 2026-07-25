import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditEvents } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    await requireUserWithPermission("audit.read");
    const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200);
    return NextResponse.json({ events: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
