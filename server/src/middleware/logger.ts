import { createLogger, format, transports, type Logger } from 'winston';
import type { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

const fmt = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  isProd ? format.json() : format.printf((info) => {
    const { timestamp, level, message, ...rest } = info as Record<string, unknown>;
    const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp as string} ${level}: ${message as string}${restStr}`;
  })
);

export const logger: Logger = createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: fmt,
  transports: [new transports.Console({ format: fmt })],
});

export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
}
