import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolVersions } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { ensureEditableDraftVersion } from "@/lib/tools/service";
import { handleApiError } from "@/lib/validation/http";
import { getToolForOrganization } from "@/lib/tools/repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.read");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    const versions = await db.select().from(toolVersions).where(eq(toolVersions.toolId, id)).orderBy(desc(toolVersions.versionNumber));
    return NextResponse.json({ versions });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates (or returns the existing) editable draft version for this tool. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.update");
    const { id } = await params;
    await getToolForOrganization(id, user.organizationId);
    const versionId = await ensureEditableDraftVersion(id, user.id);
    return NextResponse.json({ versionId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
