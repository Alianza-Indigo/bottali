import "./load-env";

import { getEnv } from "@/lib/env";

/**
 * Pre-deploy sanity check, meant to run against the SAME environment variables the target
 * deployment will use (e.g. `vercel env pull` locally, or as a CI step before `vercel deploy`).
 * `getEnv()` already enforces the base schema; this adds production-only hard requirements
 * that are legal-but-unsafe to skip (e.g. an in-memory rate limiter across serverless
 * instances) rather than schema violations.
 */
function main() {
  const env = getEnv();
  console.log(`Entorno: APP_ENV=${env.APP_ENV}, NODE_ENV=${env.NODE_ENV}`);

  if (env.APP_ENV !== "production") {
    console.log("No es producción: solo se valida el esquema base. OK.");
    return;
  }

  const problems: string[] = [];

  if (!env.REDIS_URL || !env.REDIS_TOKEN) {
    problems.push(
      "REDIS_URL/REDIS_TOKEN no configurados: el limitador de tasa caerá a un contador en memoria, " +
        "que no es válido entre instancias serverless. Configura Upstash Redis.",
    );
  }
  if (!env.BLOB_READ_WRITE_TOKEN) {
    problems.push("BLOB_READ_WRITE_TOKEN no configurado: el almacenamiento de archivos fallará en producción (obligatorio, sin fallback local).");
  }
  if (env.JOB_PROVIDER !== "vercel-queue") {
    problems.push(
      `JOB_PROVIDER=${env.JOB_PROVIDER}: en Vercel (funciones sin estado) debe ser "vercel-queue" ` +
        "para que los trabajos se procesen vía cron polling en lugar de en el mismo request.",
    );
  }
  if (!env.CRON_SECRET) {
    problems.push("CRON_SECRET no configurado: los endpoints /api/v1/cron/* no podrán autenticar las llamadas de Vercel Cron.");
  }
  if (env.LLM_PROVIDER === "fake") {
    problems.push('LLM_PROVIDER=fake: el proveedor determinista de pruebas está activo; configura "openai-compatible" con LLM_API_KEY para producción real.');
  }
  if (!env.NEXT_PUBLIC_APP_URL.startsWith("https://")) {
    problems.push(`NEXT_PUBLIC_APP_URL debe usar https:// en producción (actual: ${env.NEXT_PUBLIC_APP_URL}).`);
  }
  if (env.APP_SECRET_KEY.length < 32) {
    problems.push("APP_SECRET_KEY tiene menos de 32 caracteres: usa `openssl rand -hex 32` para generarlo.");
  }

  if (problems.length > 0) {
    console.error("\nProblemas encontrados para producción:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log("Todas las variables requeridas para producción están presentes. OK.");
}

main();
