import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { reindexDocument } from "@/lib/knowledge/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    const result = await reindexDocument(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
