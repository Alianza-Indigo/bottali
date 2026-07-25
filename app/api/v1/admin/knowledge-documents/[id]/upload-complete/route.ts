import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { completeDocumentUpload } from "@/lib/knowledge/service";
import { handleApiError } from "@/lib/validation/http";
import { ValidationError } from "@/lib/utils/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("knowledge.manage");
    const { id } = await params;
    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) throw new ValidationError("El cuerpo de la solicitud no contiene datos de archivo.");
    await completeDocumentUpload(id, user.id, Buffer.from(arrayBuffer));
    return NextResponse.json({ message: "Documento cargado; procesamiento en curso." });
  } catch (error) {
    return handleApiError(error);
  }
}
