import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { testToolProviderCredential } from "@/lib/tools/provider-credentials";
import { handleApiError } from "@/lib/validation/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> },
) {
  try {
    await requireUserWithPermission("tools.credentials.manage");
    const { id, providerId } = await params;
    const health = await testToolProviderCredential(id, providerId);
    return NextResponse.json({ health });
  } catch (error) {
    return handleApiError(error);
  }
}
