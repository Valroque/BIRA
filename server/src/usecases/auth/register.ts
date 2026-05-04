import { AppError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/passwordUtils.js';
import { generateToken, generateRefreshToken } from '../../middleware/auth.js';
import * as userService from '../../services/userService.js';
import type { User } from '../../entities/User.js';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterResult {
  user: User;
  token: string;
  refreshToken: string;
}

/**
 * Register a new user. The created user has no tenant or workspace
 * memberships yet — those are granted separately (invite flow, later phase).
 *
 * For the v1 prototype we let anyone register so we can seed accounts; once
 * the invite flow lands this will be locked down to admins.
 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  const existing = await userService.findByEmail(input.email);
  if (existing) {
    throw new AppError('A user with this email already exists', 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await userService.create({
    email: input.email.toLowerCase(),
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  return {
    user,
    token: generateToken(user.id),
    refreshToken: generateRefreshToken(user.id),
  };
}
