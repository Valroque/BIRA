import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../lib/errors.js';
import { listMilestonesByWorkspace } from '../usecases/milestones/listMilestones.js';

// Mounted at /api/tenants/:t/workspaces/:w/milestones — workspace scope is
// resolved by the parent router (tenants.ts).
const router: Router = Router({ mergeParams: true });

const ListMilestonesQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const filters = ListMilestonesQuerySchema.parse(req.query);
    const items = await listMilestonesByWorkspace(req.scope.workspaceId, filters);
    res.json({ success: true, data: items });
  })
);

export default router;
