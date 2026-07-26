import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { AppError, ValidationError } from "@/lib/utils/errors";
import { logger } from "@/lib/observability/logger";
import { captureException } from "@/lib/observability/sentry";
import { getCurrentRequestId } from "@/lib/observability/request-context";

// `AnyInputSchema<T>` (rather than `ZodSchema<T>`, which pins Input = Output = T) lets T
// bind to the schema's actual *output* type even when `.default(...)` fields make the input
// type looser than the output type — otherwise callers get the input-shaped (partially
// optional) type back instead of the fully-defaulted output shape. The Input parameter is
// intentionally unconstrained (schemas vary too much to type it precisely here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInputSchema<T> = ZodType<T, ZodTypeDef, any>;

export async function parseJsonBody<T>(request: Request, schema: AnyInputSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError("El cuerpo de la solicitud debe ser JSON válido.", "INVALID_JSON", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Datos inválidos.", parsed.error.flatten());
  }
  return parsed.data;
}

export async function handleApiError(error: unknown): Promise<NextResponse> {
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, issues: error.issues } },
      { status: error.httpStatus },
    );
  }
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }

  // Only genuinely unexpected errors (not AppError subclasses, which are normal control
  // flow — a 404 or a validation failure isn't an "error" worth alerting on) reach here.
  const requestId = await getCurrentRequestId();
  logger.error("unhandled_api_error", {
    requestId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  captureException(error, { requestId });

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado.", requestId } },
    { status: 500 },
  );
}
