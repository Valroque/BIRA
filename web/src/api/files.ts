// Files API — workspace-scoped upload / delete.
//
// Endpoints:
//   POST   /api/tenants/:t/workspaces/:w/files            (multipart, field `file`)
//   GET    /api/tenants/:t/workspaces/:w/files/:id        (raw bytes — used as `readUrl`)
//   DELETE /api/tenants/:t/workspaces/:w/files/:id
//
// The BE is multipart-direct (multer with memory storage) — there's no
// presigned-URL handshake. 10 MB cap is enforced server-side; the client
// surfaces the structured 413 message verbatim.
//
// The shared `apiFetch` wrapper hard-codes `Content-Type: application/json`,
// which would break the multipart boundary. Upload therefore goes through
// a dedicated fetch that mirrors apiFetch's auth + envelope handling but
// lets the browser set the multipart Content-Type itself.

import { ApiError, getToken } from './client';
import { adaptFileView, type FileView, type RawFileView } from './adapters/file.adapter';

export type { FileView } from './adapters/file.adapter';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a single file to the workspace's filestore. Returns the adapted
 * FileView the caller can render and reference via `attachment:<uuid>`.
 *
 * Auth: workspace `write`. Errors:
 *   - 413 `File too large (10 MB max)`   — surface inline next to the chip.
 *   - 400 `Invalid multipart request`    — usually a stale form boundary.
 *   - 401                                — caller's wrapper should surface a
 *                                          re-login affordance; we don't try
 *                                          to refresh here (no JSON body to
 *                                          replay) since the existing fetch
 *                                          model already retries once on 401
 *                                          via the JSON path. For the multipart
 *                                          path a 401 mid-upload just throws.
 */
export async function uploadFile(
  tenantSlug: string,
  workspaceSlug: string,
  file: File,
): Promise<FileView> {
  const form = new FormData();
  form.append('file', file, file.name);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Intentionally DO NOT set Content-Type — the browser fills it with the
  // multipart boundary for us. Setting it manually breaks the parse.

  const res = await fetch(
    `${BASE_URL}/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/files`,
    { method: 'POST', body: form, headers },
  );

  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    const message =
      (body as { message?: string })?.message ??
      (body as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  const json = await res.json();
  const data = (json?.data !== undefined ? json.data : json) as RawFileView;
  return adaptFileView(data);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete a file. The BE allows the uploader OR a workspace admin; non-eligible
 * callers receive 403. The composer UI doesn't expose this directly today —
 * removing an attachment from a draft just drops it from the local list, the
 * orphan file is collected when the user closes the page.
 *
 * Exposed for future "remove already-uploaded attachment from saved comment"
 * flows.
 */
export async function deleteFile(
  tenantSlug: string,
  workspaceSlug: string,
  fileId: string,
): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(
    `${BASE_URL}/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/files/${fileId}`,
    { method: 'DELETE', headers },
  );

  if (!res.ok && res.status !== 204) {
    let body: unknown;
    try { body = await res.json(); } catch { body = null; }
    const message =
      (body as { message?: string })?.message ??
      (body as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
}
