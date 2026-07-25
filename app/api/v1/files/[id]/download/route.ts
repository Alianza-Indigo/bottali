import { requireCurrentUser } from "@/lib/auth/current-user";
import { getFileForDownload } from "@/lib/files/service";
import { handleApiError } from "@/lib/validation/http";

/**
 * §17: "descarga mediante URLs temporales" — implemented as an authenticated proxy rather
 * than handing back the underlying storage URL: every download re-checks ownership and is
 * streamed through this route, so there is no separate signed URL to leak, cache, or log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const { buffer, mimeType, originalName } = await getFileForDownload(id, user.id);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
