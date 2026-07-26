import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserWithPermission } from "@/lib/permissions/require";
import { createUserByAdmin } from "@/lib/admin/users-service";
import { ROLE_KEYS } from "@/lib/permissions/definitions";
import { parseJsonBody, handleApiError } from "@/lib/validation/http";
import { ConflictError } from "@/lib/utils/errors";

const importSchema = z.object({
  users: z
    .array(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(1).max(120),
        roleKey: z.enum(ROLE_KEYS).optional(),
      }),
    )
    .min(1)
    .max(500),
});

/** Bulk version of POST /api/v1/admin/users (§27). Each row succeeds or fails
 * independently — a bad row in a 500-row import must not discard the other 499. */
export async function POST(request: Request) {
  try {
    const admin = await requireUserWithPermission("users.create");
    const { users } = await parseJsonBody(request, importSchema);

    const results = await Promise.all(
      users.map(async (row) => {
        try {
          const { userId } = await createUserByAdmin(row, admin.id);
          return { email: row.email, success: true as const, userId };
        } catch (error) {
          return {
            email: row.email,
            success: false as const,
            error: error instanceof ConflictError ? error.message : "No fue posible crear este usuario.",
          };
        }
      }),
    );

    return NextResponse.json({
      imported: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
