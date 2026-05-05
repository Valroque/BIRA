import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authorize } from '../middleware/tenantScope.js';
import { AppError } from '../lib/errors.js';
import { searchMentionables } from '../usecases/mentionables/searchMentionables.js';

// Mounted at /api/tenants/:t/workspaces/:w/mentionables — workspace scope is
// resolved by the parent router.
const router: Router = Router({ mergeParams: true });

// GET /search?q=&types=user,team&limit=8
router.get(
  '/search',
  authorize('read'),
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);

    const q = String(req.query.q ?? '');
    const typesRaw = String(req.query.types ?? '');
    const types = typesRaw ? typesRaw.split(',').map((t) => t.trim()) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const hits = await searchMentionables({
      workspaceId: req.scope.workspaceId,
      tenantId: req.scope.tenantId,
      q,
      types,
      limit,
    });

    res.json({ success: true, data: hits });
  })
);

export default router;
