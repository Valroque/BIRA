import * as themeService from '../../services/themeService.js';
import * as issueService from '../../services/issueService.js';
import { toThemeView, type ThemeView } from './themeView.js';

export async function listThemes(workspaceId: string): Promise<ThemeView[]> {
  const themes = await themeService.listByWorkspace(workspaceId);
  if (themes.length === 0) return [];

  const issueIdsByTheme = await themeService.findIssueIdsForThemes(themes.map((t) => t.id));
  const allIssueIds = Array.from(new Set([...issueIdsByTheme.values()].flat()));
  const keyMap = await issueService.findKeysByIds(allIssueIds);

  return themes.map((t) => {
    const ids = issueIdsByTheme.get(t.id) ?? [];
    const keys = ids.map((id) => keyMap.get(id)).filter((k): k is string => Boolean(k)).sort();
    return toThemeView(t, keys);
  });
}
