import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
    return NextResponse.json({ notifications: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
