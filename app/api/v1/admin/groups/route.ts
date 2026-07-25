import { NextResponse } from "next/server";
import { z } from "zod";
import { isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { recordAuditEvent } from "@/lib/audit/log";

const createSchema = z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() });

export async function GET() {
  try {
    await requireUserWithPermission("groups.read");
    const rows = await db.select().from(groups).where(isNull(groups.deletedAt));
    return NextResponse.json({ groups: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireUserWithPermission("groups.manage");
    const body = await parseJsonBody(request, createSchema);
    const [group] = await db.insert(groups).values({ ...body, createdBy: admin.id }).returning();
    await recordAuditEvent({ actorId: admin.id, action: "group.create", resourceType: "group", resourceId: group?.id });
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
