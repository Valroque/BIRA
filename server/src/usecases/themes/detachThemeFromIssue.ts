import { AppError } from '../../lib/errors.js';
import * as themeService from '../../services/themeService.js';
import * as issueService from '../../services/issueService.js';

export interface DetachThemeFromIssueInput {
  workspaceId: string;
  themeId: string;
  issueKey: string;
}

export async function detachThemeFromIssue(input: DetachThemeFromIssueInput): Promise<void> {
  const theme = await themeService.getById(input.themeId);
  if (!theme || theme.workspaceId !== input.workspaceId) {
    throw new AppError('Theme not found', 404);
  }
  const issue = await issueService.findByKey(input.workspaceId, input.issueKey);
  if (!issue) {
    throw new AppError(`Issue '${input.issueKey}' not found`, 404);
  }
  const removed = await themeService.detachIssue(issue.id, theme.id);
  if (!removed) {
    throw new AppError('Theme is not attached to this issue', 404);
  }
}
