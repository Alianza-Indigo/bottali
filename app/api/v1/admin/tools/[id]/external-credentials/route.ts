import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import {
  listToolExternalCredentials,
  saveToolExternalCredential,
} from "@/lib/tools/external-credentials";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";
import { externalCredentialInputSchema } from "@/lib/validation/tools";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUserWithPermission("tools.credentials.manage");
    const { id } = await params;
    const credentials = await listToolExternalCredentials(id);
    return NextResponse.json({
      credentials: credentials.map((credential) => ({
        ...credential,
        updatedAt: credential.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("tools.credentials.manage");
    const { id } = await params;
    const credential = await parseJsonBody(request, externalCredentialInputSchema);
    const credentialId = await saveToolExternalCredential({
      toolId: id,
      credential,
      actorId: user.id,
    });
    return NextResponse.json({ credentialId, message: "Credencial externa creada." }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
