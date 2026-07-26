import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { generatedFiles } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const rows = await db.select().from(generatedFiles).where(eq(generatedFiles.id, id)).limit(1);
    const file = rows[0];
    if (!file || file.deletedAt) throw new NotFoundError("Documento no encontrado.");
    if (file.userId !== user.id) throw new ForbiddenError("No puedes ver este documento.");
    return NextResponse.json({
      file: {
        id: file.id,
        title: file.title,
        kind: file.kind,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
