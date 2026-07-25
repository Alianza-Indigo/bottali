export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autenticado.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No autorizado para esta acción.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Datos inválidos.",
    public readonly issues?: unknown,
  ) {
    super(message, "VALIDATION_ERROR", 422);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicto con el estado actual del recurso.") {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Demasiadas solicitudes. Intenta más tarde.") {
    super(message, "RATE_LIMITED", 429);
  }
}

export class BudgetExceededError extends AppError {
  constructor(message = "Se alcanzó el límite de presupuesto configurado.") {
    super(message, "BUDGET_EXCEEDED", 402);
  }
}
