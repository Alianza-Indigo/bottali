import { captureMessage } from "@/lib/observability/sentry";
import { logger } from "@/lib/observability/logger";
import { getOperationalAlerts } from "./repository";

export async function reportOperationalAlerts() {
  const alerts = await getOperationalAlerts();
  if (alerts.stuckJobs.length > 0) {
    const message = `${alerts.stuckJobs.length} trabajos llevan más de 15 minutos en ejecución.`;
    logger.error(message, { jobs: alerts.stuckJobs });
    captureMessage(message, "error");
  }
  if (alerts.spend.abnormal) {
    const message = `Gasto anómalo: ${alerts.spend.last24Hours.toFixed(2)} centavos en las últimas 24 horas.`;
    logger.warn(message, { spend: alerts.spend });
    captureMessage(message, "warning");
  }
  return alerts;
}
