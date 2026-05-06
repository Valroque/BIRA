// File adapter.
//
// BE shape (from `server/src/usecases/files/fileView.ts → FileView`):
//   {
//     id, filename, mime, size, sha256,
//     uploaderUserId: string | null,
//     createdAt, readUrl
//   }
//
// FE entity:
//   - `id` is the file UUID — used to compose the `attachment:<uuid>` ref
//     persisted on a comment / issue description. Never rendered.
//   - `name` is the user-visible filename; render this, never the id.
//   - `readUrl` is whatever the filestore driver returns (today: an HTTP
//     path under /api/tenants/:t/workspaces/:w/files/:id served by the
//     `pg` driver). Treat it as opaque — pass to `<img>`/`<a>`, don't parse.
//   - `mimeType` mirrors the comment-attachment naming so a single
//     `<AttachmentView>` shape works for both consumers.

import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawFileView {
  id: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  uploaderUserId: string | null;
  createdAt: string;
  readUrl: string;
}

// ---------------------------------------------------------------------------
// FE entity
// ---------------------------------------------------------------------------

export interface FileView {
  /** UUID — primary identity. Never rendered. Used to build `attachment:<uuid>` refs. */
  id: string;
  /** User-visible filename. */
  name: string;
  /** Raw bytes count. Render via `formatFileSize`. */
  size: number;
  /** Lowercase MIME — `image/png`, `application/pdf`, etc. */
  mimeType: string;
  /** Opaque URL the FE can pass to <img src> / <a href>. */
  readUrl: string;
  /** UUID of the uploader, or null when the file pre-dated the column. Never rendered. */
  uploaderUserId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function adaptFileView(raw: RawFileView): FileView {
  const id = requireField(raw.id, '', { entity: 'File', field: 'id' });
  return {
    id,
    name: expectField(raw.filename ?? '', '', { entity: 'File', field: 'filename', id }),
    size: typeof raw.size === 'number' ? raw.size : 0,
    mimeType: expectField(raw.mime ?? '', 'application/octet-stream', {
      entity: 'File', field: 'mime', id,
    }),
    readUrl: expectField(raw.readUrl ?? '', '', { entity: 'File', field: 'readUrl', id }),
    uploaderUserId: raw.uploaderUserId ?? null,
    createdAt: expectField(raw.createdAt ?? '', '', { entity: 'File', field: 'createdAt', id }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Whether the file's MIME indicates a renderable image. */
export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Build the persisted ref string a comment / description carries.
 * Mirrors `buildAttachmentRef` on the BE so round-trips are clean.
 */
export function buildAttachmentRef(fileId: string): string {
  return `attachment:${fileId}`;
}

/** Format bytes as a short human label (1.4 MB, 320 KB, …). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
