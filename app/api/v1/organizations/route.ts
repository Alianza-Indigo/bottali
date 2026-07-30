import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { requireUserWithPermission } from "@/lib/permissions/require";
import {
  createOrganization,
  listUserOrganizations,
} from "@/lib/organizations/service";
import { handleApiError, parseJsonBody } from "@/lib/validation/http";

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json({
      organizations: await listUserOrganizations(user.id),
      activeOrganizationId: user.organizationId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserWithPermission("organizations.manage");
    const body = await parseJsonBody(request, createSchema);
    const organization = await createOrganization({ ...body, actorId: user.id });
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
