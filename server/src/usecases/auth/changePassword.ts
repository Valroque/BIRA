import { AppError } from '../../lib/errors.js';
import { comparePassword, hashPassword } from '../../lib/passwordUtils.js';
import * as userService from '../../services/userService.js';
import { User } from '../../entities/User.js';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Self-driven password change. Verifies the current password, persists the
 * new one, and clears `mustResetPassword`. This is the ONLY path that clears
 * the flag — admin resets re-arm it, re-logging in does not clear it.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput
): Promise<User> {
  const row = await userService.findByIdWithHash(userId);
  if (!row) throw new AppError('User not found', 404);

  const ok = await comparePassword(input.currentPassword, row.passwordHash);
  if (!ok) {
    throw new AppError('Current password is incorrect', 401);
  }

  if (input.newPassword === input.currentPassword) {
    throw new AppError(
      'New password must be different from the current password',
      400
    );
  }

  const passwordHash = await hashPassword(input.newPassword);
  await userService.setPassword(userId, passwordHash, { mustReset: false });

  // Return the entity with the freshly cleared flag — the caller (route)
  // surfaces this so the FE can update its locked-state UI.
  return User.fromRow({ ...row, mustResetPassword: false });
}
