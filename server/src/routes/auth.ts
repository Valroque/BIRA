import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';
import { register } from '../usecases/auth/register.js';
import { login } from '../usecases/auth/login.js';
import { refreshToken } from '../usecases/auth/refreshToken.js';
import { getProfile } from '../usecases/auth/getProfile.js';
import { updateProfile } from '../usecases/auth/updateProfile.js';
import { changePassword } from '../usecases/auth/changePassword.js';
import { AppError } from '../lib/errors.js';

const router: Router = Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// PATCH /api/auth/me — every field optional, but at least one must be set.
// Phone accepts an explicit `null` so the user can clear it; same for avatar.
const UpdateProfileSchema = z
  .object({
    firstName: z.string().min(1).max(128).optional(),
    lastName: z.string().min(1).max(128).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(32).nullable().optional(),
    avatar: z.string().max(512).nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const input = RegisterSchema.parse(req.body);
    const result = await register(input);
    logger.info('User registered', { userId: result.user.id, email: result.user.email });
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = LoginSchema.parse(req.body);
    const result = await login(input);
    logger.info('User logged in', {
      userId: result.user.id,
      email: result.user.email,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Login successful', data: result });
  })
);

router.post(
  '/refresh-token',
  asyncHandler(async (req, res) => {
    const input = RefreshSchema.parse(req.body);
    const result = await refreshToken(input);
    res.json({ success: true, data: result });
  })
);

// ── Protected ─────────────────────────────────────────────────────────────
//
// NOTE: we do NOT mount `requirePasswordResetCleared` on this router. A
// locked user must be able to:
//   - hit GET /profile to discover that they're locked, and
//   - hit POST /change-password to escape the locked state.
// The gate lives on /api/tenants/* instead, where it's load-bearing.

router.use(authenticate);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const result = await getProfile(req.user.id);
    res.json({ success: true, data: result });
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const patch = UpdateProfileSchema.parse(req.body);
    const user = await updateProfile(req.user.id, patch);
    res.json({ success: true, data: user });
  })
);

router.post(
  '/change-password',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const input = ChangePasswordSchema.parse(req.body);
    const user = await changePassword(req.user.id, input);
    // IMPORTANT: never log either password — current or new — only the user id.
    logger.info('Password changed', { userId: req.user.id });
    res.json({ success: true, data: user });
  })
);

export default router;
