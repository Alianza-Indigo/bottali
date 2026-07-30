import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uploadedFiles } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deleteUploadedFile } from "@/lib/files/service";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const rows = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id)).limit(1);
    const file = rows[0];
    if (!file || file.organizationId !== user.organizationId || file.deletedAt) {
      throw new NotFoundError("Archivo no encontrado.");
    }
    if (file.userId !== user.id) throw new ForbiddenError("No puedes ver este archivo.");
    return NextResponse.json({
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        status: file.status,
        createdAt: file.createdAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await deleteUploadedFile(id, user.id, user.organizationId);
    return NextResponse.json({ message: "Archivo eliminado." });
  } catch (error) {
    return handleApiError(error);
  }
}
