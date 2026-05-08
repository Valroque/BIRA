import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { getById as getUserById } from '../services/userService.js';
import * as patService from '../services/personalAccessTokenService.js';
import { hashPat, PAT_PREFIX } from '../lib/patUtils.js';
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

/**
 * Per-token debounce for the `last_used_at` UPDATE. Single-instance BE
 * for now; if we go multi-instance the debounce becomes per-instance,
 * which is fine — at worst we get one extra write per minute per instance,
 * not a correctness issue.
 *
 * Map<tokenId, lastWriteEpochMs>. Module-level on purpose: cleared only
 * on process restart (and PATs that go quiet drop out of the map only
 * when the process churns, which is acceptable for an in-memory hint).
 */
const PAT_LAST_USED_DEBOUNCE_MS = 60_000;
const patLastUsedAt = new Map<string, number>();

function maybeTouchLastUsed(tokenId: string): void {
  const now = Date.now();
  const last = patLastUsedAt.get(tokenId);
  if (last !== undefined && now - last < PAT_LAST_USED_DEBOUNCE_MS) return;
  patLastUsedAt.set(tokenId, now);
  // Fire-and-forget. The service helper has its own try/catch so this
  // never throws into the request path; the .catch is belt-and-braces.
  patService.touchLastUsed(tokenId).catch((err) => {
    logger.warn('PAT touchLastUsed unexpectedly threw', {
      tokenId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
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

    // ── PAT path ─────────────────────────────────────────────────────
    // PATs are recognised by their `bira_pat_` prefix. The string is
    // hashed (sha256), looked up by hash, validated for revoke/expiry,
    // and the owning user is loaded via the same `getUserById` path the
    // JWT branch uses — so `req.user` is byte-for-byte identical between
    // the two methods and downstream code stays agnostic.
    //
    // Failure modes are intentionally collapsed into a single 401 with
    // a generic message: the caller doesn't get to distinguish "wrong
    // token" from "revoked" from "expired" — that's an information leak.
    if (token.startsWith(PAT_PREFIX)) {
      const hashHex = hashPat(token);
      const pat = await patService.findActiveByHash(hashHex);
      if (!pat) {
        logger.warn('Auth: invalid or expired PAT', { path: req.originalUrl });
        res.status(401).json({
          success: false,
          message: 'Access denied. Invalid or expired token.',
        });
        return;
      }

      const user = await getUserById(pat.userId);
      if (!user || !user.isActive) {
        logger.warn('Auth: PAT owner not found or inactive', {
          tokenId: pat.id,
          userId: pat.userId,
        });
        res.status(401).json({
          success: false,
          message: 'Access denied. Invalid or expired token.',
        });
        return;
      }

      req.user = user;
      req.auth = { method: 'pat', tokenId: pat.id };
      maybeTouchLastUsed(pat.id);
      next();
      return;
    }

    // ── JWT path (unchanged behaviour) ───────────────────────────────
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
    req.auth = { method: 'jwt' };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Gate that blocks any request from a user whose `mustResetPassword` flag
 * is set. Mount AFTER `authenticate` on routers that should be off-limits
 * to locked accounts (notably `/api/tenants/*`). The user can still hit
 * `/api/auth/profile` (to discover they're locked) and
 * `/api/auth/change-password` (to escape) — those routes intentionally
 * skip this gate.
 */
export const requirePasswordResetCleared: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (req.user.mustResetPassword) {
    res.status(423).json({
      success: false,
      code: 'PASSWORD_RESET_REQUIRED',
      message:
        'Your password must be reset before you can continue. Use POST /api/auth/change-password.',
    });
    return;
  }
  next();
};

/**
 * Gate that blocks any request not authenticated via JWT — i.e. PAT-
 * authed requests fail here with 403. Mount on PAT-management routes
 * (`POST/GET/DELETE /api/auth/tokens`) so a stolen / leaked PAT cannot
 * be used to mint additional PATs or revoke existing ones. The legitimate
 * owner must log in with their password to manage their tokens.
 *
 * Returns a structured error code (`PAT_CANNOT_MINT_PAT`) so the FE / MCP
 * client can surface a useful prompt rather than a generic "forbidden".
 */
export const requireJwtAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (req.auth?.method !== 'jwt') {
    res.status(403).json({
      success: false,
      code: 'PAT_CANNOT_MINT_PAT',
      message:
        'Personal Access Tokens cannot be used to manage tokens. Log in with your password first.',
    });
    return;
  }
  next();
};
