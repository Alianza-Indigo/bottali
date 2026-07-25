import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  lowStimulus: z.boolean().optional(),
  textScale: z.number().min(0.8).max(1.5).optional(),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const rows = await db.select({ accessibilityPreferences: userProfiles.accessibilityPreferences }).from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
    return NextResponse.json({ preferences: rows[0]?.accessibilityPreferences ?? {} });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request, preferencesSchema);
    const existing = await db.select({ accessibilityPreferences: userProfiles.accessibilityPreferences }).from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
    const merged = { ...(existing[0]?.accessibilityPreferences ?? {}), ...body };
    await db.update(userProfiles).set({ accessibilityPreferences: merged }).where(eq(userProfiles.userId, user.id));
    return NextResponse.json({ preferences: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
