import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { backgroundJobs } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    await requireUserWithPermission("settings.manage");
    const rows = await db.select().from(backgroundJobs).orderBy(desc(backgroundJobs.createdAt)).limit(100);
    return NextResponse.json({ jobs: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
