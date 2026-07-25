import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { initiateUpload } from "@/lib/files/service";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const schema = z.object({
  toolId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await parseJsonBody(request, schema);
    const result = await initiateUpload({ userId: user.id, ...body });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
