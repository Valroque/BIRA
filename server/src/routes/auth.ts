import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../middleware/logger.js';
import { register } from '../usecases/auth/register.js';
import { login } from '../usecases/auth/login.js';
import { refreshToken } from '../usecases/auth/refreshToken.js';
import { getProfile } from '../usecases/auth/getProfile.js';
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

router.use(authenticate);

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const result = await getProfile(req.user.id);
    res.json({ success: true, data: result });
  })
);

export default router;
