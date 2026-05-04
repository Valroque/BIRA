import { AppError } from '../../lib/errors.js';
import * as themeService from '../../services/themeService.js';
import * as issueService from '../../services/issueService.js';

export interface AttachThemeToIssueInput {
  workspaceId: string;
  themeId: string;
  issueKey: string;
}

/**
 * Attach a theme to an issue. Same-workspace invariant is enforced:
 * cross-workspace combinations 404 (no info-leak).
 */
export async function attachThemeToIssue(input: AttachThemeToIssueInput): Promise<void> {
  const theme = await themeService.getById(input.themeId);
  if (!theme || theme.workspaceId !== input.workspaceId) {
    throw new AppError('Theme not found', 404);
  }
  const issue = await issueService.findByKey(input.workspaceId, input.issueKey);
  if (!issue) {
    throw new AppError(`Issue '${input.issueKey}' not found`, 404);
  }
  await themeService.attachIssue(issue.id, theme.id);
}
