import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { destroyCurrentSession } from "@/lib/auth/session";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";
import { dataRequests } from "@/db/schema";

const patchSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(64).optional(),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rows = await db
      .select({ email: users.email, displayName: userProfiles.displayName, locale: userProfiles.locale, timezone: userProfiles.timezone })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, user.id))
      .limit(1);
    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request, patchSchema);
    await db.update(userProfiles).set(body).where(eq(userProfiles.userId, user.id));
    await recordAuditEvent({ actorId: user.id, action: "profile.update", resourceType: "user", resourceId: user.id });
    return NextResponse.json({ message: "Perfil actualizado." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireCurrentUser();
    await db.insert(dataRequests).values({ userId: user.id, kind: "deletion" });
    await recordAuditEvent({ actorId: user.id, action: "account.request_deletion", resourceType: "user", resourceId: user.id });
    await destroyCurrentSession();
    return NextResponse.json({ message: "Solicitud de eliminación de cuenta registrada." });
  } catch (error) {
    return handleApiError(error);
  }
}
