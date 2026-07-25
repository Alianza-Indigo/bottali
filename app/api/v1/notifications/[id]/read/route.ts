import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
    return NextResponse.json({ message: "Notificación marcada como leída." });
  } catch (error) {
    return handleApiError(error);
  }
}
