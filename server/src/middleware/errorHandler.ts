import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, EntityError, ServiceError } from '../lib/errors.js';
import { logger } from './logger.js';

interface NormalisedError {
  statusCode: number;
  message: string;
  data?: unknown;
  /**
   * Optional structured error code surfaced in the response body. Used by
   * gates that need a stable, machine-readable handle (e.g.
   * `PAT_LIMIT_REACHED`, `PAT_NOT_FOUND`) so the FE / MCP client can
   * surface a useful prompt rather than parse the human message.
   */
  code?: string;
}

function normalise(err: unknown): NormalisedError {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, message: err.message, data: err.data };
  }
  if (err instanceof ServiceError) {
    return {
      statusCode: err.statusCode,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    };
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    return { statusCode: 400, message: message || 'Validation error' };
  }
  if (err instanceof EntityError) {
    logger.error(`EntityError [${err.entity}.${err.field}]: ${err.message}`, {
      stack: err.stack,
    });
    return { statusCode: 500, message: 'Internal data error' };
  }
  // PostgreSQL unique-constraint violation
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') return { statusCode: 400, message: 'Duplicate field value entered' };
    if (code === '23502') {
      const detail = (err as { detail?: string; message?: string }).detail;
      return { statusCode: 400, message: detail || 'Validation error' };
    }
  }
  if (err instanceof Error) {
    return { statusCode: 500, message: err.message || 'Server Error' };
  }
  return { statusCode: 500, message: 'Server Error' };
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const normalised = normalise(err);
  const isOperational =
    err instanceof AppError || err instanceof ServiceError || err instanceof ZodError;
  const level = isOperational ? 'warn' : 'error';
  const userId = (req as Request & { user?: { id?: string } }).user?.id;

  logger.log(level, `${req.method} ${req.originalUrl} — ${normalised.message}`, {
    statusCode: normalised.statusCode,
    userId,
    ...(err instanceof Error && !isOperational && { stack: err.stack }),
  });

  res.status(normalised.statusCode).json({
    success: false,
    message: normalised.message,
    ...(normalised.code !== undefined && { code: normalised.code }),
    ...(normalised.data !== undefined && { data: normalised.data }),
    ...(process.env.NODE_ENV === 'development' &&
      err instanceof Error && { stack: err.stack }),
  });
};

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
