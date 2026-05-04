import * as themeService from '../../services/themeService.js';
import * as issueService from '../../services/issueService.js';
import { toThemeView, type ThemeView } from './themeView.js';

export async function getTheme(workspaceId: string, id: string): Promise<ThemeView | null> {
  const theme = await themeService.getById(id);
  if (!theme || theme.workspaceId !== workspaceId) return null;

  const issueIdsByTheme = await themeService.findIssueIdsForThemes([theme.id]);
  const issueIds = issueIdsByTheme.get(theme.id) ?? [];
  const keyMap = await issueService.findKeysByIds(issueIds);
  const keys = issueIds.map((id) => keyMap.get(id)).filter((k): k is string => Boolean(k)).sort();

  return toThemeView(theme, keys);
}
