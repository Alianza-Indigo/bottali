import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { switchSessionOrganization } from "@/lib/organizations/service";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";

const schema = z.object({ organizationId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { organizationId } = await parseJsonBody(request, schema);
    await switchSessionOrganization(user.sessionId, user.id, organizationId);
    return NextResponse.json({ message: "Organización activa actualizada." });
  } catch (error) {
    return handleApiError(error);
  }
}
