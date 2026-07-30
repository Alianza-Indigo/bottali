import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { handleApiError } from "@/lib/validation/http";
import { listUserOrganizations } from "@/lib/organizations/service";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        displayName: session.displayName,
        organization: session.organization,
      },
      organizations: await listUserOrganizations(session.id),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
