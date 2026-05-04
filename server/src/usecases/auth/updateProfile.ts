import { AppError } from '../../lib/errors.js';
import * as userService from '../../services/userService.js';
import type { User } from '../../entities/User.js';

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  avatar?: string | null;
}

/**
 * Self-driven profile update. The route layer enforces "at least one field"
 * via Zod; this usecase only handles email-collision and persistence.
 */
export async function updateProfile(
  userId: string,
  patch: UpdateProfileInput
): Promise<User> {
  const normalised: UpdateProfileInput = { ...patch };

  if (normalised.email !== undefined) {
    const lowered = normalised.email.toLowerCase();
    normalised.email = lowered;

    const current = await userService.getById(userId);
    if (!current) throw new AppError('User not found', 404);

    if (lowered !== current.email.toLowerCase()) {
      const collision = await userService.findByEmail(lowered);
      if (collision && collision.id !== userId) {
        throw new AppError('A user with this email already exists', 409);
      }
    }
  }

  const updated = await userService.update(userId, normalised);
  if (!updated) throw new AppError('User not found', 404);
  return updated;
}
