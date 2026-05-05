import { getFileStore } from '../../services/fileStore/index.js';
import type { File } from '../../entities/File.js';

export interface FileView {
  id: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  uploaderUserId: string | null;
  createdAt: string;
  readUrl: string;
}

export function toFileView(
  file: File,
  ctx: { tenantSlug: string; workspaceSlug: string }
): FileView {
  const store = getFileStore();
  const readUrl = store.getReadUrl({
    id: file.id,
    storageKey: file.storageKey,
    tenantSlug: ctx.tenantSlug,
    workspaceSlug: ctx.workspaceSlug,
  });

  return {
    id: file.id,
    filename: file.filename,
    mime: file.mime,
    size: file.size,
    sha256: file.sha256,
    uploaderUserId: file.uploaderUserId,
    createdAt: file.createdAt,
    readUrl,
  };
}
