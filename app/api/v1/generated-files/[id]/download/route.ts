import { requireCurrentUser } from "@/lib/auth/current-user";
import { getGeneratedFileForDownload } from "@/lib/files/service";
import { handleApiError } from "@/lib/validation/http";

/** Same authenticated-proxy pattern as /api/v1/files/[id]/download (§17): every download
 * re-checks ownership and streams through this route rather than exposing a storage URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const { buffer, mimeType, title } = await getGeneratedFileForDownload(id, user.id);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.txt"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
