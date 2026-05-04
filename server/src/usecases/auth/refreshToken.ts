import { AppError } from '../../lib/errors.js';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../middleware/auth.js';
import * as userService from '../../services/userService.js';

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResult {
  token: string;
  refreshToken: string;
}

export async function refreshToken({
  refreshToken: rt,
}: RefreshTokenInput): Promise<RefreshTokenResult> {
  if (!rt) throw new AppError('Refresh token is required', 400);

  let decoded;
  try {
    decoded = verifyRefreshToken(rt);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await userService.getById(decoded.userId);
  if (!user || !user.isActive) {
    throw new AppError('Invalid refresh token', 401);
  }

  return {
    token: generateToken(user.id),
    refreshToken: generateRefreshToken(user.id),
  };
}
