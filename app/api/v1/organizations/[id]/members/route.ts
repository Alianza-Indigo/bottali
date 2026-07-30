import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import {
  addOrganizationMember,
  listOrganizationMembers,
} from "@/lib/organizations/service";
import { ForbiddenError } from "@/lib/utils/errors";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";

const memberSchema = z.object({
  email: z.string().email().max(320),
  roleKey: z
    .enum([
      "ORGANIZATION_ADMIN",
      "TOOL_ADMIN",
      "TOOL_EDITOR",
      "KNOWLEDGE_MANAGER",
      "USER",
    ])
    .default("USER"),
});

function assertActiveOrganization(requestedId: string, activeId: string) {
  if (requestedId !== activeId) {
    throw new ForbiddenError("Cambia a esa organización antes de administrar sus miembros.");
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("organizations.members.manage");
    const { id } = await params;
    assertActiveOrganization(id, user.organizationId);
    return NextResponse.json({ members: await listOrganizationMembers(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserWithPermission("organizations.members.manage");
    const { id } = await params;
    assertActiveOrganization(id, user.organizationId);
    const body = await parseJsonBody(request, memberSchema);
    const member = await addOrganizationMember({
      organizationId: id,
      email: body.email,
      roleKey: body.roleKey,
      actorId: user.id,
    });
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
