import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { assignGroup } from "@/lib/admin/users-service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({ userId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireUserWithPermission("groups.manage");
    const { id } = await params;
    const { userId } = await parseJsonBody(request, schema);
    await assignGroup(userId, id, admin.id);
    return NextResponse.json({ message: "Usuario agregado al grupo." });
  } catch (error) {
    return handleApiError(error);
  }
}
