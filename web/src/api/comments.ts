import { apiFetch } from './client';

export interface CommentView {
  id: string;
  issueId: string;
  authorUserId: string | null;
  body: string;
  mentions: Array<{ type: string; id: string }>;
  attachmentIds: string[];
  attachments: Array<{
    id: string;
    name: string;
    readUrl: string;
    size: number;
    mimeType: string;
  }>;
  createdAt: string;
  updatedAt: string | null;
}

export async function listComments(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  issueKey: string,
): Promise<CommentView[]> {
  return apiFetch<CommentView[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${issueKey}/comments`,
  );
}

export async function createComment(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  issueKey: string,
  input: { body: string; attachmentIds?: string[] },
): Promise<CommentView> {
  return apiFetch<CommentView>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${issueKey}/comments`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function updateComment(
  tenantSlug: string,
  workspaceSlug: string,
  commentId: string,
  patch: { body?: string; attachmentIds?: string[] },
): Promise<CommentView> {
  return apiFetch<CommentView>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/comments/${commentId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
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
