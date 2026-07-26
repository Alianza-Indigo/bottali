import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCatalogItems } from "@/lib/tools/catalog";
import { handleApiError } from "@/lib/validation/http";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const items = await getCatalogItems(user.id);
    return NextResponse.json({ tools: items });
  } catch (error) {
    return handleApiError(error);
  }
}
