import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { getToolForOrganization } from "@/lib/tools/repository";
import {
  deleteToolExternalCredential,
  saveToolExternalCredential,
} from "@/lib/tools/external-credentials";
import { externalCredentialInputSchema } from "@/lib/validation/tools";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; credentialId: string }> },
) {
  try {
    const user = await requireUserWithPermission("tools.credentials.manage");
    const { id, credentialId } = await params;
    await getToolForOrganization(id, user.organizationId);
    const credential = await parseJsonBody(request, externalCredentialInputSchema);
    await saveToolExternalCredential({
      toolId: id,
      credentialId,
      credential,
      actorId: user.id,
    });
    return NextResponse.json({ message: "Credencial externa actualizada." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; credentialId: string }> },
) {
  try {
    const user = await requireUserWithPermission("tools.credentials.manage");
    const { id, credentialId } = await params;
    await getToolForOrganization(id, user.organizationId);
    await deleteToolExternalCredential({ toolId: id, credentialId, actorId: user.id });
    return NextResponse.json({ message: "Credencial externa eliminada." });
  } catch (error) {
    return handleApiError(error);
  }
}
