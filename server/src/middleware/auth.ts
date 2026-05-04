import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { getById as getUserById } from '../services/userService.js';
import { logger } from './logger.js';

interface AccessTokenPayload extends JwtPayload {
  userId: string;
}

interface RefreshTokenPayload extends JwtPayload {
  userId: string;
  type: 'refresh';
}

function jwtSecret(kind: 'access' | 'refresh'): string {
  const secret =
    kind === 'access'
      ? process.env.JWT_SECRET
      : process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new AppError(
      `Missing ${kind === 'access' ? 'JWT_SECRET' : 'JWT_REFRESH_SECRET'} env var`,
      500
    );
  }
  return secret;
}

export function generateToken(userId: string): string {
  const expiresIn = (process.env.JWT_EXPIRE || '1d') as SignOptions['expiresIn'];
  return jwt.sign({ userId }, jwtSecret('access'), { expiresIn });
}

export function generateRefreshToken(userId: string): string {
  const expiresIn = (process.env.JWT_REFRESH_EXPIRE || '14d') as SignOptions['expiresIn'];
  return jwt.sign({ userId, type: 'refresh' }, jwtSecret('refresh'), { expiresIn });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, jwtSecret('refresh')) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid refresh token', 401);
  }
  return decoded;
}

export const authenticate: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.header('Authorization') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
      return;
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(token, jwtSecret('access')) as AccessTokenPayload;
    } catch (err) {
      const isExpired = err instanceof jwt.TokenExpiredError;
      logger.warn(`Auth: ${isExpired ? 'token expired' : 'invalid token'}`, {
        path: req.originalUrl,
      });
      res.status(401).json({
        success: false,
        message: isExpired
          ? 'Access denied. Token has expired.'
          : 'Access denied. Invalid token.',
      });
      return;
    }

    const user = await getUserById(decoded.userId);
    if (!user || !user.isActive) {
      logger.warn('Auth: user not found or inactive', { userId: decoded.userId });
      res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token or inactive user.',
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
