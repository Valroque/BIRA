import { AppError } from '../../lib/errors.js';
import * as themeService from '../../services/themeService.js';
import * as issueService from '../../services/issueService.js';
import { toThemeView, type ThemeView } from './themeView.js';

export interface UpdateThemePatch {
  name?: string;
  description?: string | null;
  color?: string;
}

export async function updateTheme(
  workspaceId: string,
  id: string,
  patch: UpdateThemePatch
): Promise<ThemeView> {
  const provided = Object.keys(patch).filter(
    (k) => (patch as Record<string, unknown>)[k] !== undefined
  );
  if (provided.length === 0) {
    throw new AppError('At least one field must be provided', 400);
  }
  const existing = await themeService.getById(id);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw new AppError('Theme not found', 404);
  }
  if (patch.name && patch.name !== existing.name) {
    const collision = await themeService.findByName(workspaceId, patch.name);
    if (collision && collision.id !== existing.id) {
      throw new AppError(`A theme named '${patch.name}' already exists in this workspace`, 409);
    }
  }
  const updated = await themeService.updateById(id, patch);
  if (!updated) throw new AppError('Theme not found', 404);

  const issueIdsByTheme = await themeService.findIssueIdsForThemes([updated.id]);
  const issueIds = issueIdsByTheme.get(updated.id) ?? [];
  const keyMap = await issueService.findKeysByIds(issueIds);
  const keys = issueIds.map((id) => keyMap.get(id)).filter((k): k is string => Boolean(k)).sort();

  return toThemeView(updated, keys);
}
