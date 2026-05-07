import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate, requireJwtAuth } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';
import { register } from '../usecases/auth/register.js';
import { login } from '../usecases/auth/login.js';
import { refreshToken } from '../usecases/auth/refreshToken.js';
import { getProfile } from '../usecases/auth/getProfile.js';
import { updateProfile } from '../usecases/auth/updateProfile.js';
import { changePassword } from '../usecases/auth/changePassword.js';
import { createToken } from '../usecases/personalAccessTokens/createToken.js';
import { listTokens } from '../usecases/personalAccessTokens/listTokens.js';
import { revokeToken } from '../usecases/personalAccessTokens/revokeToken.js';
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

// PAT create — name 1..64 chars, expiresIn enum. The four-value enum
// matches the picker on the FE settings panel; adding values requires
// a migration of the dropdown copy AND a usecase update, so the
// schema is the single source of truth.
const CreateTokenSchema = z.object({
  name: z.string().min(1).max(64),
  expiresIn: z.enum(['never', '30d', '90d', '1y']),
});

// Path param `:id` for revoke — uuid only, anything else is 400.
const TokenIdParamsSchema = z.object({
  id: z.string().uuid('Token id must be a uuid'),
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

// ── Personal Access Tokens ────────────────────────────────────────────────
//
// CRUD for the user's own PATs. All three routes additionally mount
// `requireJwtAuth` so a stolen / leaked PAT cannot mint or revoke tokens
// — the legitimate owner must log in with their password to manage them.
//
// `last4` and the entity itself are safe to log; the plaintext returned
// from POST is never logged anywhere (only the create response carries it).

router.post(
  '/tokens',
  requireJwtAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const input = CreateTokenSchema.parse(req.body);
    const result = await createToken({
      userId: req.user.id,
      name: input.name,
      expiresIn: input.expiresIn,
    });
    // Log the metadata only — NEVER the plaintext.
    logger.info('PAT created', {
      userId: req.user.id,
      tokenId: result.token.id,
      name: result.token.name,
      last4: result.token.last4,
      expiresAt: result.token.expiresAt,
    });
    res.status(201).json({
      success: true,
      data: {
        token: result.token,
        plaintext: result.plaintext,
      },
    });
  })
);

router.get(
  '/tokens',
  requireJwtAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const tokens = await listTokens({ userId: req.user.id });
    res.json({ success: true, data: tokens });
  })
);

router.delete(
  '/tokens/:id',
  requireJwtAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const { id } = TokenIdParamsSchema.parse(req.params);
    const result = await revokeToken({ userId: req.user.id, tokenId: id });
    logger.info('PAT revoked', { userId: req.user.id, tokenId: result.id });
    res.json({ success: true, data: result });
  })
);

export default router;
