import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { deleteDocument } from "@/lib/knowledge/service";
import { handleApiError } from "@/lib/validation/http";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    await deleteDocument(id, user.id);
    return NextResponse.json({ message: "Documento eliminado." });
  } catch (error) {
    return handleApiError(error);
  }
}
