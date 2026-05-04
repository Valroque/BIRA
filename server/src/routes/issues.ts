import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../lib/errors.js';
import { listIssuesByWorkspace } from '../usecases/issues/listIssues.js';
import { ISSUE_TYPES, STATUSES, PRIORITIES } from '../lib/constants.js';

// Mounted at /api/tenants/:t/workspaces/:w/issues — workspace scope is
// resolved by the parent router.
const router: Router = Router({ mergeParams: true });

const ListIssuesQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  assigneeUserId: z.string().uuid().optional(),
  label: z.string().min(1).max(64).optional(),
  priority: z.enum(PRIORITIES).optional(),
  projectId: z.string().uuid().optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.scope?.workspaceId) throw new AppError('Workspace scope missing', 500);
    const filters = ListIssuesQuerySchema.parse(req.query);
    const items = await listIssuesByWorkspace(req.scope.workspaceId, filters);
    res.json({ success: true, data: items });
  })
);

export default router;
