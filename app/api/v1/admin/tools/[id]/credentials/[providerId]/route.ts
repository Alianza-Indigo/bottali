import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import {
  deleteToolProviderCredential,
  saveToolProviderCredential,
} from "@/lib/tools/provider-credentials";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";

const PRIVATE_HOSTNAME_PATTERN =
  /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|\[::1\])/i;

const credentialSchema = z.object({
  apiKey: z.string().trim().min(8).max(500).optional(),
  baseUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => value.startsWith("https://"), "La URL debe usar HTTPS.")
    .refine(
      (value) => !PRIVATE_HOSTNAME_PATTERN.test(new URL(value).hostname),
      "No se permiten direcciones privadas o internas.",
    )
    .optional()
    .nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> },
) {
  try {
    const user = await requireUserWithPermission("tools.credentials.manage");
    const { id, providerId } = await params;
    const body = await parseJsonBody(request, credentialSchema);
    await saveToolProviderCredential({
      toolId: id,
      providerId,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      actorId: user.id,
    });
    return NextResponse.json({ message: "Credencial guardada." });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> },
) {
  try {
    const user = await requireUserWithPermission("tools.credentials.manage");
    const { id, providerId } = await params;
    await deleteToolProviderCredential({ toolId: id, providerId, actorId: user.id });
    return NextResponse.json({ message: "Credencial eliminada." });
  } catch (error) {
    return handleApiError(error);
  }
}
