import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return NextResponse.json({ message: "Todas las notificaciones marcadas como leídas." });
  } catch (error) {
    return handleApiError(error);
  }
}
