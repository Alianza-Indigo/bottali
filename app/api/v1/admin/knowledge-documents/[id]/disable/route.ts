import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { disableDocument } from "@/lib/knowledge/service";
import { handleApiError } from "@/lib/validation/http";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    await disableDocument(id, user.id, user.organizationId);
    return NextResponse.json({ message: "Documento deshabilitado." });
  } catch (error) {
    return handleApiError(error);
  }
}
