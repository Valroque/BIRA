import type { Issue, IssueTypeLetter } from '../../fixtures';
import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape — mirrors `IssueView` from server/src/usecases/issues/getIssue.ts
// ---------------------------------------------------------------------------

/**
 * `descriptionAttachments` is detail-only (list endpoints omit it). The
 * raw row carries `descriptionAttachmentIds` everywhere; we keep the BE
 * `attachment:<uuid>` ref strings unchanged in the FE so write paths
 * (slice 6) round-trip cleanly.
 */
export interface RawIssueAttachment {
  id: string;
  filename?: string;
  /** Some endpoints use `name` rather than `filename`; tolerate both. */
  name?: string;
  mime?: string;
  /** Older spec used `mimeType`; tolerate both. */
  mimeType?: string;
  size: number;
  sha256?: string;
  uploaderUserId?: string | null;
  createdAt?: string;
  readUrl: string;
}

export interface RawIssueRow {
  id: string;
  key: string;
  workspaceId: string;
  projectId: string;
  type: IssueTypeLetter;
  status: Issue['status'];
  priority: Issue['priority'];
  title: string;
  description: string | null;
  labels: string[];
  assigneeUserId: string | null;
  teamId: string | null;
  reporterUserId: string | null;
  parentIssueId: string | null;
  parent: string | null;
  children: string[];
  relatedTo: string[];
  dependsOn: string[];
  dependedOnBy: string[];
  startDate: string | null;
  endDate: string | null;
  estimate: number | null;
  descriptionAttachmentIds: string[];
  seq: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface RawIssueDetail extends RawIssueRow {
  /** Detail endpoint only. */
  descriptionAttachments?: RawIssueAttachment[];
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Map a list-row to the FE `Issue`. The shapes overlap heavily post-slice 0;
 * this is mostly a null-tightening pass plus dropping detail-only fields.
 *
 * `updated` is a placeholder until the FE has a real "humanise" helper. The
 * existing fixture used hand-written strings ("2h ago"); here we surface the
 * raw `updatedAt` (or `createdAt` as fallback) so list rows still have *some*
 * recency cue without inventing a date library.
 */
export function adaptIssueRow(raw: RawIssueRow): Issue {
  const id = requireField(raw.id, '', { entity: 'Issue', field: 'id' });
  const key = requireField(raw.key, '', { entity: 'Issue', field: 'key', id });
  const projectId = requireField(raw.projectId, '', { entity: 'Issue', field: 'projectId', id: key });
  const type = requireField<IssueTypeLetter>(raw.type, 'T', { entity: 'Issue', field: 'type', id: key });
  const title = requireField(raw.title, '', { entity: 'Issue', field: 'title', id: key });
  const status = requireField<Issue['status']>(raw.status, 'backlog', {
    entity: 'Issue', field: 'status', id: key,
  });
  const priority = expectField<Issue['priority']>(raw.priority, 'none', {
    entity: 'Issue', field: 'priority', id: key,
  });

  const issue: Issue = {
    key,
    type,
    title,
    status,
    priority,
    assigneeUserId: raw.assigneeUserId ?? null,
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    // Surface the BE timestamp as-is; rendering is the consumer's job.
    updated: raw.updatedAt ?? raw.createdAt ?? '',
    projectId,
  };

  // Optional / null fields — only attach when present so the FE shape stays
  // narrow and undefined-checks at consumers continue to work.
  if (raw.estimate !== null && raw.estimate !== undefined) issue.estimate = raw.estimate;
  if (raw.startDate) issue.startDate = raw.startDate;
  if (raw.endDate) issue.endDate = raw.endDate;
  if (raw.parent) issue.parent = raw.parent;
  if (raw.children?.length) issue.children = [...raw.children];
  if (raw.relatedTo?.length) issue.relatedTo = [...raw.relatedTo];
  if (raw.dependsOn?.length) issue.dependsOn = [...raw.dependsOn];
  if (raw.dependedOnBy?.length) issue.dependedOnBy = [...raw.dependedOnBy];
  if (raw.description) issue.description = raw.description;
  if (raw.teamId) issue.teamId = raw.teamId;

  return issue;
}

/**
 * Map a detail-endpoint payload. Same as the row adapter — the
 * `descriptionAttachments` array is consumed by the inspector via a
 * separate channel (the provider stores it in a sidecar map keyed by
 * issue key) so the `Issue` shape itself stays unchanged.
 */
export function adaptIssueDetail(raw: RawIssueDetail): Issue {
  return adaptIssueRow(raw);
}
