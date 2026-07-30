import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { listToolProviderCredentials } from "@/lib/tools/provider-credentials";
import { handleApiError } from "@/lib/validation/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.credentials.manage");
    const { id } = await params;
    const credentials = await listToolProviderCredentials(id);
    return NextResponse.json({
      credentials: credentials.map((credential) => ({
        ...credential,
        lastTestedAt: credential.lastTestedAt?.toISOString() ?? null,
        updatedAt: credential.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
