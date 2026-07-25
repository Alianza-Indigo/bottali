import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { providers } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    await requireUserWithPermission("providers.read");
    const rows = await db.select().from(providers);
    return NextResponse.json({ providers: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
