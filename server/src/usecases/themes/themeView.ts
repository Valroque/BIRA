import type { Theme } from '../../entities/Theme.js';

export interface ThemeView {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string;
  /** Issue keys (e.g. 'CMT-241') belonging to this theme. */
  issues: string[];
  createdAt: string;
  updatedAt: string | null;
}

export function toThemeView(theme: Theme, issueKeys: string[]): ThemeView {
  return {
    id: theme.id,
    workspaceId: theme.workspaceId,
    name: theme.name,
    description: theme.description,
    color: theme.color,
    issues: issueKeys,
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
  };
}
