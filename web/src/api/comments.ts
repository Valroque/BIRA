// Comments API — list / create / update / delete on a single issue.
//
// Endpoints:
//   GET    /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments
//   POST   /api/tenants/:t/workspaces/:w/projects/:p/issues/:key/comments
//   PATCH  /api/tenants/:t/workspaces/:w/comments/:commentId
//   DELETE /api/tenants/:t/workspaces/:w/comments/:commentId
//
// Mention extraction is server-side: the BE re-parses `@[user:<uuid>]` /
// `@[team:<uuid>]` tokens out of the body on every write and stores the
// resulting `mentions[]` alongside it. Callers only need to send `body`.

import { apiFetch } from './client';
import {
  adaptComment,
  type Comment,
  type RawComment,
} from './adapters/comment.adapter';

export type { Comment } from './adapters/comment.adapter';

export async function listComments(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  issueKey: string,
): Promise<Comment[]> {
  const raw = await apiFetch<RawComment[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${issueKey}/comments`,
  );
  return raw.map(adaptComment);
}

export async function createComment(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  issueKey: string,
  input: { body: string; attachmentIds?: string[] },
): Promise<Comment> {
  const raw = await apiFetch<RawComment>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${issueKey}/comments`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return adaptComment(raw);
}

export async function updateComment(
  tenantSlug: string,
  workspaceSlug: string,
  commentId: string,
  patch: { body?: string; attachmentIds?: string[] },
): Promise<Comment> {
  const raw = await apiFetch<RawComment>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/comments/${commentId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return adaptComment(raw);
}

export async function deleteComment(
  tenantSlug: string,
  workspaceSlug: string,
  commentId: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/comments/${commentId}`,
    { method: 'DELETE' },
  );
}
