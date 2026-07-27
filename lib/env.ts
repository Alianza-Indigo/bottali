import { z } from "zod";

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const numberFromString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : fallback))
    .pipe(z.number().finite());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  APP_SECRET_KEY: z.string().min(16, "APP_SECRET_KEY debe tener al menos 16 caracteres"),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),
  DATABASE_POOL_URL: z.string().optional(),

  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  REDIS_URL: z.string().optional(),
  REDIS_TOKEN: z.string().optional(),

  AUTH_COOKIE_NAME: z.string().default("crisis_session"),
  SESSION_TTL_SECONDS: numberFromString(2592000),
  EMAIL_VERIFICATION_TTL_SECONDS: numberFromString(86400),
  PASSWORD_RESET_TTL_SECONDS: numberFromString(3600),

  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("no-reply@example.org"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: numberFromString(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  LLM_PROVIDER: z.enum(["fake", "openai-compatible"]).default("fake"),
  LLM_API_KEY: z.string().optional(),
  LLM_API_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_DEFAULT_MODEL: z.string().default("gpt-4o-mini"),
  LLM_FALLBACK_MODEL: z.string().optional(),

  EMBEDDING_PROVIDER: z.enum(["fake", "openai-compatible"]).default("fake"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_API_BASE_URL: z.string().default("https://api.openai.com/v1"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  MODERATION_PROVIDER: z.enum(["fake", "openai-compatible"]).default("fake"),
  MODERATION_API_KEY: z.string().optional(),

  STT_PROVIDER: z.enum(["disabled", "fake", "openai-compatible"]).default("disabled"),
  STT_API_KEY: z.string().optional(),

  TTS_PROVIDER: z.enum(["disabled", "fake", "openai-compatible"]).default("disabled"),
  TTS_API_KEY: z.string().optional(),

  MAX_UPLOAD_BYTES: numberFromString(26214400),
  SIGNED_URL_TTL_SECONDS: numberFromString(900),
  GENERATED_FILE_TTL_SECONDS: numberFromString(2592000),
  DEFAULT_DAILY_MESSAGE_LIMIT: numberFromString(200),
  DEFAULT_MONTHLY_TOKEN_LIMIT: numberFromString(2000000),
  DEFAULT_MONTHLY_COST_LIMIT_CENTS: numberFromString(5000),

  JOB_PROVIDER: z.enum(["sync", "vercel-queue"]).default("sync"),
  JOB_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // Real anti-brute-force control in production (20/15min per IP is deliberately tight for
  // a real user). A full e2e/security Playwright run performs far more logins than any real
  // user would in that window, and every request in a single CI job shares one IP — so this
  // is configurable rather than hardcoded, letting CI raise it without weakening production.
  LOGIN_RATE_LIMIT_MAX: numberFromString(20),

  ENABLE_VOICE: boolFromString,
  ENABLE_FILES: boolFromString,
  ENABLE_PWA: boolFromString,
  ENABLE_ANALYTICS: boolFromString,
  // Temporary escape hatch (§28): unset/false preserves the normal behavior (MFA required
  // at login for any account that has it enabled, and required outright for every admin
  // role). Set to "true" to switch both checks off without touching any code — turn back
  // off the same way once the reason for disabling it is resolved.
  DISABLE_MFA: boolFromString,

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

/**
 * Fails fast with a readable message if a critical variable is missing or malformed.
 * Cached after first successful parse so repeated calls are cheap in serverless invocations.
 */
export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuración de entorno inválida. Revisa .env.example.\n${issues}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return getEnv().APP_ENV === "production";
}
