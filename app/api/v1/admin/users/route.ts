import { NextResponse } from "next/server";
import { desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { handleApiError } from "@/lib/validation/http";

export async function GET(request: Request) {
  try {
    await requireUserWithPermission("users.read");
    const url = new URL(request.url);
    const search = url.searchParams.get("q");

    const query = db
      .select({
        id: users.id,
        email: users.email,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        displayName: userProfiles.displayName,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .orderBy(desc(users.createdAt))
      .limit(100);

    const rows = search ? await query.where(ilike(users.email, `%${search}%`)) : await query;
    return NextResponse.json({ users: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
