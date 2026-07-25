import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50);
    return NextResponse.json({ notifications: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
