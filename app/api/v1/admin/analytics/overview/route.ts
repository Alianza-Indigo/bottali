import { NextResponse } from "next/server";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";
import { getAnalyticsOverview } from "@/lib/analytics/repository";

export async function GET() {
  try {
    await requireUserWithPermission("analytics.read");

    return NextResponse.json(await getAnalyticsOverview());
  } catch (error) {
    return handleApiError(error);
  }
}
