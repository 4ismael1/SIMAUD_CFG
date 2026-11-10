import type { FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PASSWORD_CHANGE_REQUIRED"
  | "EMAIL_NOT_CONFIRMED"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "REFRESH_RACE"
  | "INTERNAL";
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const unauthorized = () =>
  new ApiError(401, "UNAUTHORIZED", "La sesión no es válida. Inicia sesión de nuevo.");
export const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos.");
export function installErrors(app: FastifyInstance) {
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "No se encontró el recurso." },
    }),
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError)
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    const http =
      error && typeof error === "object"
        ? (error as { statusCode?: number; validation?: unknown; name?: string })
        : {};
    if (hasZodFastifySchemaValidationErrors(error))
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Los datos enviados no son válidos.",
          details: error.validation.map((issue) => ({
            field: issue.instancePath.replace(/^\//, "").replaceAll("/", "."),
            message: issue.message,
          })),
        },
      });
    if (
      http.validation ||
      http.statusCode === 400 ||
      http.statusCode === 413 ||
      http.statusCode === 415 ||
      http.statusCode === 406
    )
      return reply.code(http.statusCode === 413 ? 413 : 400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Los datos enviados no son válidos.",
        },
      });
    let cause: unknown = error;
    for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
      const pg = cause as {
        code?: string;
        constraint?: string;
        cause?: unknown;
      };
      if (pg.code === "23505") {
        const field = pg.constraint?.includes("template_variables")
          ? "name"
          : pg.constraint?.includes("contracts_code")
            ? "code"
            : pg.constraint?.includes("cedula")
              ? "cedula"
              : "email";
        return reply.code(409).send({
          error: {
            code: "CONFLICT",
            message:
              field === "name"
                ? "El nombre de variable ya existe."
                : field === "code"
                  ? "El código de contrato ya existe."
                  : field === "cedula"
                    ? "La cédula ya está registrada."
                    : "El email ya está registrado.",
            details: { field },
          },
        });
      }
      cause = pg.cause;
    }
    if (http.statusCode === 429)
      return reply.code(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Demasiados intentos. Inténtalo más tarde.",
        },
      });
    // Do not log database errors/queries: they may contain hashes or credentials.
    request.log.error({ errorType: http.name ?? typeof error }, "Error interno");
    return reply.code(500).send({
      error: { code: "INTERNAL", message: "Ocurrió un error interno." },
    });
  });
}
