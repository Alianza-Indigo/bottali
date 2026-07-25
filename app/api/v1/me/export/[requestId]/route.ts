import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dataRequests } from "@/db/schema";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getStorageAdapter } from "@/lib/storage";
import { handleApiError } from "@/lib/validation/http";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/utils/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { requestId } = await params;

    const rows = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId)).limit(1);
    const dataRequest = rows[0];
    if (!dataRequest) throw new NotFoundError("Solicitud de exportación no encontrada.");
    if (dataRequest.userId !== user.id) throw new ForbiddenError("No puedes acceder a esta exportación.");
    if (dataRequest.status !== "COMPLETED" || !dataRequest.resultBlobKey) {
      throw new ValidationError("La exportación todavía se está procesando.");
    }

    const buffer = await getStorageAdapter().get(dataRequest.resultBlobKey);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="export-${requestId}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
