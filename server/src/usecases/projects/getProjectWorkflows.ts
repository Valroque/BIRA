import * as projectWorkflowService from '../../services/projectWorkflowService.js';
import * as workflowService from '../../services/workflowService.js';
import { ISSUE_TYPES, type IssueType } from '../../lib/constants.js';
import type { Workflow } from '../../entities/Workflow.js';

export interface WorkflowSummary {
  id: string;
  slug: string;
  name: string;
}

export type ProjectWorkflowMap = Record<IssueType, WorkflowSummary | null>;

/**
 * Default workflow slug per issue type. Mirrors
 * `DEFAULT_PROJECT_WORKFLOWS` in `web/src/fixtures.ts`:
 *   T / B / S → 'default' (the standard six-state flow)
 *   E        → 'epic-coarse' (loose three-state flow)
 *
 * If no row exists in `project_workflows` for a (project, issueType)
 * pair, we fall back to the workspace-level workflow with this slug.
 * If THAT doesn't exist either (e.g. fresh workspace without the
 * defaults seeded), we return null for that type.
 */
const DEFAULT_SLUG_FOR_TYPE: Record<IssueType, string> = {
  T: 'default',
  B: 'default',
  S: 'default',
  E: 'epic-coarse',
};

function summary(w: Workflow): WorkflowSummary {
  return { id: w.id, slug: w.slug, name: w.name };
}

export async function getProjectWorkflows(
  workspaceId: string,
  projectId: string
): Promise<ProjectWorkflowMap> {
  const explicit = await projectWorkflowService.listByProject(projectId);
  const explicitByType = new Map(explicit.map((r) => [r.issueType, r.workflowId]));

  // Resolve every workflowId we'll need in one pass.
  const explicitIds = explicit.map((r) => r.workflowId);
  const explicitWorkflows = await Promise.all(explicitIds.map((id) => workflowService.getById(id)));
  const explicitWorkflowById = new Map(
    explicitWorkflows.filter((w): w is Workflow => Boolean(w)).map((w) => [w.id, w])
  );

  // Fallback workflows — fetch lazily (one query per distinct slug).
  const slugCache = new Map<string, Workflow | null>();

  const out = {} as ProjectWorkflowMap;
  for (const type of ISSUE_TYPES) {
    const explicitId = explicitByType.get(type);
    if (explicitId) {
      const w = explicitWorkflowById.get(explicitId) ?? null;
      out[type] = w ? summary(w) : null;
      continue;
    }
    const slug = DEFAULT_SLUG_FOR_TYPE[type];
    let fallback = slugCache.get(slug);
    if (fallback === undefined) {
      fallback = await workflowService.findBySlug(workspaceId, slug);
      slugCache.set(slug, fallback);
    }
    out[type] = fallback ? summary(fallback) : null;
  }

  return out;
}
