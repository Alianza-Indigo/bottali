import { getEnv } from "@/lib/env";
import { ForbiddenError } from "@/lib/utils/errors";

/**
 * Validates the shared secret Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>`.
 * Every /api/v1/cron/* route must call this before doing any work (§6: "validar una clave
 * secreta"). Throws rather than returning a boolean so a missing check can't be accidentally
 * ignored by a caller that forgets to check the return value.
 */
export function assertValidCronRequest(request: Request): void {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    throw new ForbiddenError("CRON_SECRET no está configurado; los endpoints de cron están deshabilitados.");
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    throw new ForbiddenError("Solicitud de cron no autorizada.");
  }
}
