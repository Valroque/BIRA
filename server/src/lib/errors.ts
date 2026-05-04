/**
 * Layered error classes — ported from ABHA.
 *
 *   EntityError  — data integrity failure at entity construction (bug, not user error)
 *   ServiceError — business rule violation; carries suggested HTTP status
 *   AppError     — client-facing HTTP error with explicit status
 *
 * The global error handler maps these to HTTP responses:
 *   EntityError  → 500 + logged
 *   ServiceError → mapped via error.statusCode
 *   AppError     → passed through
 */

export class EntityError extends Error {
  readonly entity: string;
  readonly field: string;
  readonly layer = 'entity' as const;

  constructor(message: string, entity: string, field: string) {
    super(message);
    this.name = 'EntityError';
    this.entity = entity;
    this.field = field;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ServiceError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly layer = 'service' as const;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code ?? null;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly status: 'fail' | 'error';
  readonly isOperational = true;
  readonly data: unknown;

  constructor(message: string, statusCode: number, data?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.data = data;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
