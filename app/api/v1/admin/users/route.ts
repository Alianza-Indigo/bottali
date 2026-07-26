import { NextResponse } from "next/server";
import { desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { userProfiles, users } from "@/db/schema";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { createUserByAdmin } from "@/lib/admin/users-service";
import { ROLE_KEYS } from "@/lib/permissions/definitions";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  roleKey: z.enum(ROLE_KEYS).optional(),
});

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

export async function POST(request: Request) {
  try {
    const admin = await requireUserWithPermission("users.create");
    const body = await parseJsonBody(request, createUserSchema);
    const result = await createUserByAdmin(body, admin.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
