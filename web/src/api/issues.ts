import { apiFetch } from './client';
import {
  adaptIssueRow, adaptIssueDetail,
  type RawIssueRow, type RawIssueDetail, type RawIssueAttachment,
} from './adapters/issue.adapter';
import type { Issue, IssueTypeLetter } from '../fixtures';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface IssueListFilters {
  status?: string;
  type?: string;
  assigneeUserId?: string;
  label?: string;
  priority?: string;
  /** Workspace-scoped only — ignored on the project-scoped endpoint. */
  projectId?: string;
}

function buildQuery(filters: IssueListFilters | undefined): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Workspace-scoped list — used by `IssuesProvider` to seed the per-workspace
 * cache. Detail-only fields (`descriptionAttachments`) are not present on
 * this endpoint per the BE contract.
 */
export async function listWorkspaceIssues(
  tenantSlug: string,
  workspaceSlug: string,
  filters?: IssueListFilters,
): Promise<Issue[]> {
  const items = await apiFetch<RawIssueRow[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/issues${buildQuery(filters)}`,
  );
  return items.map(adaptIssueRow);
}

/**
 * Project-scoped list — currently used only by tests / future explicit
 * project fetches. The provider relies on the workspace-scoped endpoint
 * and filters client-side per project.
 */
export async function listProjectIssues(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  filters?: Omit<IssueListFilters, 'projectId'>,
): Promise<Issue[]> {
  const items = await apiFetch<RawIssueRow[]>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues${buildQuery(filters)}`,
  );
  return items.map(adaptIssueRow);
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Detail fetch — used by the issue-detail page when an issue isn't already
 * in the workspace cache (deep link, hard refresh). Returns the issue plus
 * the expanded `descriptionAttachments` so the inspector can render
 * referenced files without a second roundtrip.
 */
export interface IssueDetailResult {
  issue: Issue;
  /** Expanded file views for the description's `attachment:<uuid>` refs. Empty if none. */
  descriptionAttachments: RawIssueAttachment[];
}

export async function getIssue(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
): Promise<IssueDetailResult> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}`,
  );
  return {
    issue: adaptIssueDetail(raw),
    descriptionAttachments: raw.descriptionAttachments ?? [],
  };
}

// ---------------------------------------------------------------------------
// Write paths (slice 6)
// ---------------------------------------------------------------------------
//
// Reality-gantt + inspector + create-issue go through these. Planning-gantt
// edits keep using the localStorage-overrides path on `IssuesProvider`.
// All endpoints are project-scoped (the BE routes are mounted under
// /projects/:projectSlug); the caller resolves the project's slug before
// invoking these.

/**
 * Patch shape sent to PATCH `/projects/:p/issues/:key`. Mirrors
 * `UpdateIssuePatch` on the server. `parentIssueId` is intentionally NOT
 * here — hierarchy mutations have their own endpoint (`setIssueParent`).
 *
 * `null` means "clear" for nullable fields (assignee, dates, estimate);
 * `undefined` means "leave unchanged" — callers MUST omit fields they
 * aren't editing so the BE's "at least one field" check passes against
 * just the changed surface.
 */
export interface UpdateIssuePayload {
  title?: string;
  description?: string | null;
  status?: Issue['status'];
  priority?: Issue['priority'];
  assigneeUserId?: string | null;
  labels?: string[];
  startDate?: string | null;
  endDate?: string | null;
  estimate?: number | null;
  descriptionAttachmentIds?: string[];
}

/**
 * PATCH an issue. Returns the freshly-adapted Issue.
 *
 * Status guard rejections come back as 403 with a human-readable message
 * (e.g. "Required fields missing: estimate"). The caller surfaces that
 * inline next to the status chip.
 */
export async function updateIssue(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  patch: UpdateIssuePayload,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return adaptIssueDetail(raw);
}

/**
 * Body shape for POST `/projects/:p/issues`. Mirrors `CreateIssueSchema`
 * on the route. `parent` is the parent issue *key* (e.g. 'CMT-7'); the
 * route resolves it to a uuid before storage.
 */
export interface CreateIssuePayload {
  type: IssueTypeLetter;
  title: string;
  description?: string | null;
  status?: Issue['status'];
  priority?: Issue['priority'];
  labels?: string[];
  assigneeUserId?: string | null;
  parent?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimate?: number | null;
  descriptionAttachmentIds?: string[];
}

/**
 * Create an issue under the given project. The BE allocates `key` + uuid
 * `id`; both come back populated on the response. The returned Issue is
 * suitable for direct insertion into the workspace cache.
 */
export async function createIssue(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  input: CreateIssuePayload,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return adaptIssueDetail(raw);
}

/**
 * Set / clear an issue's parent. The BE endpoint is PATCH (not PUT)
 * `/issues/:key/parent` — see `projectIssues.ts`. Pass `null` to clear,
 * a sibling key (e.g. 'CMT-12') to attach.
 *
 * Returns the updated Issue. The caller is responsible for keeping the
 * old + new parent's `children[]` arrays in sync — the BE does this
 * server-side, but the local cache needs the symmetric fix-up too.
 */
export async function setIssueParent(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  parentKey: string | null,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/parent`,
    { method: 'PATCH', body: JSON.stringify({ parent: parentKey }) },
  );
  return adaptIssueDetail(raw);
}

// ---------------------------------------------------------------------------
// Issue links (slice 7)
// ---------------------------------------------------------------------------
//
// Two link types in v1:
//   - `relates`: symmetric, untyped, every issue type. BE stores both ends.
//   - `depends on`: directed Task→Task. `key depends on blockerKey` ⇒ `key`
//     is the dependent, `blockerKey` is the predecessor. Cycles rejected by
//     the BE with HTTP 400 ("Adding this dependency would create a cycle").
//
// Each route returns the FULL IssueView for the issue at `:key` so the
// caller can rebase its cache on the canonical shape; the FE adapter still
// has to mirror the change on the OTHER end (symmetric storage rule).

/**
 * POST `/projects/:p/issues/:key/relates` body `{ relatedKey }`.
 *
 * Returns the updated `key` issue with `relatedTo[]` now including
 * `relatedKey`. The caller mirrors the change on `relatedKey`'s entry.
 */
export async function addRelatesLink(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  relatedKey: string,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/relates`,
    { method: 'POST', body: JSON.stringify({ relatedKey }) },
  );
  return adaptIssueDetail(raw);
}

/**
 * DELETE `/projects/:p/issues/:key/relates/:relatedKey`. Returns the updated
 * `key` issue with `relatedKey` removed from `relatedTo[]`.
 */
export async function removeRelatesLink(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  relatedKey: string,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/relates/${relatedKey}`,
    { method: 'DELETE' },
  );
  return adaptIssueDetail(raw);
}

/**
 * POST `/projects/:p/issues/:key/dependencies` body `{ blockerKey }`.
 *
 * Semantics: `key` depends on `blockerKey` — `key` is the dependent,
 * `blockerKey` is the predecessor. The BE returns `key`'s updated view
 * (with `blockerKey` appended to `dependsOn[]`); the caller mirrors by
 * appending `key` to `blockerKey`'s `dependedOnBy[]`.
 *
 * Cycles → 400 with `message: 'Adding this dependency would create a cycle'`.
 * Non-Task ends → 400 with `message: 'Depends-on links are Task-only'`.
 */
export async function addDependencyLink(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  blockerKey: string,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/dependencies`,
    { method: 'POST', body: JSON.stringify({ blockerKey }) },
  );
  return adaptIssueDetail(raw);
}

/**
 * DELETE `/projects/:p/issues/:key/dependencies/:blockerKey`. Returns
 * `key`'s updated view; caller scrubs `key` from `blockerKey.dependedOnBy[]`.
 */
export async function removeDependencyLink(
  tenantSlug: string,
  workspaceSlug: string,
  projectSlug: string,
  key: string,
  blockerKey: string,
): Promise<Issue> {
  const raw = await apiFetch<RawIssueDetail>(
    `/api/tenants/${tenantSlug}/workspaces/${workspaceSlug}/projects/${projectSlug}/issues/${key}/dependencies/${blockerKey}`,
    { method: 'DELETE' },
  );
  return adaptIssueDetail(raw);
}
