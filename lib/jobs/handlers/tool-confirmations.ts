import { registerJobHandler } from "../registry";
import { expireStalePendingConfirmations } from "@/lib/conversations/tool-confirmations";

/** §15/§36 cron cleanup: a human who never approves/rejects a paused tool call must not
 * hold its budget reservation forever — sweeps every PENDING confirmation whose expiresAt
 * has passed, marks it EXPIRED, and releases the reservation. */
registerJobHandler("expire_pending_tool_confirmations", async () => {
  return expireStalePendingConfirmations();
});
