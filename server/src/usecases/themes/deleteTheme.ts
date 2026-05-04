import { AppError } from '../../lib/errors.js';
import * as themeService from '../../services/themeService.js';

/**
 * Delete a theme. Membership rows in `issue_themes` cascade-die via
 * the FK so issues lose their reference automatically.
 */
export async function deleteTheme(workspaceId: string, id: string): Promise<void> {
  const existing = await themeService.getById(id);
  if (!existing || existing.workspaceId !== workspaceId) {
    throw new AppError('Theme not found', 404);
  }
  await themeService.deleteById(id);
}
