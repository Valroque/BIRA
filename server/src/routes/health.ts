import { Router } from 'express';
import { db } from '../db/knex.js';

const router: Router = Router();

router.get('/', async (_req, res) => {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};
  let healthy = true;

  try {
    await db.raw('SELECT 1');
    checks.postgres = { status: 'ok' };
  } catch (err) {
    healthy = false;
    checks.postgres = {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  });
});

export default router;
