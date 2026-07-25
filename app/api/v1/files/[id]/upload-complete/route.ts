import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { completeUpload } from "@/lib/files/service";
import { handleApiError } from "@/lib/validation/http";
import { ValidationError } from "@/lib/utils/errors";

/**
 * Receives the raw file bytes as the request body (§17: the client PUTs directly after
 * the metadata handshake in POST /files). Server-mediated rather than a true
 * browser-direct-to-Blob upload — see lib/storage/vercel-blob.ts for why.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength === 0) throw new ValidationError("El cuerpo de la solicitud no contiene datos de archivo.");

    await completeUpload(id, user.id, Buffer.from(arrayBuffer));
    return NextResponse.json({ message: "Carga completada." });
  } catch (error) {
    return handleApiError(error);
  }
}
