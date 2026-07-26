import "server-only";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function configuredLevel(): Level {
  const raw = process.env.LOG_LEVEL;
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

/**
 * §35 "logs estructurados": one JSON object per line to stdout/stderr, filtered by
 * LOG_LEVEL. Deliberately no external dependency (pino/winston) — Vercel's own log
 * pipeline already ingests stdout/stderr as structured entries when they're valid JSON;
 * adding a logging library would only duplicate that.
 */
function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
