import { AppError } from '../../lib/errors.js';
import { comparePassword } from '../../lib/passwordUtils.js';
import { generateToken, generateRefreshToken } from '../../middleware/auth.js';
import * as userService from '../../services/userService.js';
import { User } from '../../entities/User.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: User;
  token: string;
  refreshToken: string;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const row = await userService.findByEmailWithHash(input.email);
  if (!row || !row.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  const ok = await comparePassword(input.password, row.passwordHash);
  if (!ok) {
    throw new AppError('Invalid credentials', 401);
  }

  await userService.updateLastLogin(row.id);

  const user = User.fromRow({
    ...row,
    lastLogin: new Date(),
  });

  return {
    user,
    token: generateToken(user.id),
    refreshToken: generateRefreshToken(user.id),
  };
}
