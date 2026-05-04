import { AppError } from '../../lib/errors.js';
import * as themeService from '../../services/themeService.js';
import { toThemeView, type ThemeView } from './themeView.js';

export interface CreateThemeInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  color?: string;
}

export async function createTheme(input: CreateThemeInput): Promise<ThemeView> {
  if (!input.name || !input.name.trim()) {
    throw new AppError('Theme name is required', 400);
  }
  const existing = await themeService.findByName(input.workspaceId, input.name);
  if (existing) {
    throw new AppError(`A theme named '${input.name}' already exists in this workspace`, 409);
  }
  const theme = await themeService.create(input);
  return toThemeView(theme, []);
}
