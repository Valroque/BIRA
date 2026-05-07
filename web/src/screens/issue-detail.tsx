import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, TypeChip, IssueId, StatusDot, Priority, Avatar, STATUSES, useTenantContext, useTenantBreadcrumbs } from '../components/shell';
import {
  AttachmentRow, RenderedAttachmentRow, renderRichText, useComposer,
  type RenderAttachment,
} from '../components/composer';
import { IssuePickerModal } from '../components/issue-picker';
import { OwnerPicker } from '../components/owner-picker';
import { useDismiss } from '../components/use-dismiss';
// `ISSUES` is referenced ONLY for the design-canvas reference render
// (default-arg fallback below). Live data flows through `useIssues()`.
import { IDEAL_POINTS_PER_DAY, ISSUES, computeTaskLoad, dependsOnWouldCycle, type Issue } from '../fixtures';
import {
  listComments, createComment, updateComment, deleteComment,
  type Comment,
} from '../api/comments';
import { MentionPicker } from '../components/mention-picker';
import type { MentionableHit } from '../api/mentionables';
import { CommentBody } from '../components/comment-body';
import { useProjects } from '../state/projects';
import { useIssues, fetchIssueDetail } from '../state/issues';
import { useUsers, useResolvedUser, UNKNOWN_USER_LABEL } from '../state/users';
import { useWorkspaceMembers } from '../state/workspace-members';
import { useAuth } from '../state/auth';
import { SkeletonRow } from '../components/states';
import { Modal, ModalBody, ModalFooter, ModalHeader } from '../components/modal';

const STATUS_LABEL: Record<Issue['status'], string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  done: 'Done',
  canceled: 'Canceled',
};

const PRIORITY_LABEL: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

// Right inspector width: persisted so the user's preferred size sticks
// across navigations and reloads. Bounds keep it useful on small screens
// without letting it crowd out the issue body.
const INSPECTOR_KEY = 'bira:issue-inspector-width';
const INSPECTOR_MIN = 240;
const INSPECTOR_MAX = 540;
const INSPECTOR_DEFAULT = 280;

function loadInspectorWidth(): number {
  try {
    const raw = localStorage.getItem(INSPECTOR_KEY);
    if (!raw) return INSPECTOR_DEFAULT;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return INSPECTOR_DEFAULT;
    return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, n));
  } catch {
    return INSPECTOR_DEFAULT;
  }
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse the ISO `YYYY-MM-DD` field directly (no `new Date(iso)`), so the
// rendered date doesn't shift in non-UTC timezones.
function formatISODate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function IssueDetailPage() {
  const { key } = useParams<{ key: string }>();
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { getProject } = useProjects();
  const { getIssue, loading: listLoading, cacheDetail, getDescriptionAttachments } = useIssues();
  const projectInfo = getProject(project);
  const cached = key ? getIssue(key) : undefined;
  // The list endpoint omits detail-only fields (descriptionAttachments,
  // anything else added later). `getDescriptionAttachments(key)` returns
  // `undefined` until the detail endpoint has been fetched at least once
  // for this issue, regardless of whether the row itself is cached. We
  // use that as the "needs detail fetch" signal so list→detail navigation
  // still hydrates attachments.
  const detailFetched = key ? getDescriptionAttachments(key) !== undefined : false;

  // Detail fetch: runs when the row is missing OR the detail-only sidecar
  // hasn't been populated yet. Stashes the result in the provider so
  // subsequent renders (and other consumers) read from cache.
  const [fallbackIssue, setFallbackIssue] = useState<Issue | undefined>(undefined);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  useEffect(() => {
    // Skip while the workspace list is still loading; the cache may be
    // about to populate and we'd double-fetch.
    if (!key || listLoading) return;
    if (cached && detailFetched) return;
    let cancelled = false;
    setFallbackLoading(true);
    setFallbackError(null);
    fetchIssueDetail(tenant, workspace, project, key)
      .then((res) => {
        if (cancelled) return;
        cacheDetail(res.issue, res.descriptionAttachments);
        setFallbackIssue(res.issue);
      })
      .catch((err) => {
        if (cancelled) return;
        setFallbackError(err instanceof Error ? err.message : 'Failed to load issue');
      })
      .finally(() => {
        if (!cancelled) setFallbackLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenant, workspace, project, key, cached, detailFetched, listLoading, cacheDetail]);

  const issue = cached ?? fallbackIssue;

  // Loading: workspace list still hydrating OR the deep-link fallback is
  // in flight. Keep the chrome (TopBar) so the user sees they're on a
  // valid route, drop a small skeleton in the body area.
  if (!issue && (listLoading || fallbackLoading)) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={[
          { label: tenantName, to: `/${tenant}/workspaces` },
          { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
          { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
          { label: 'Issues', to: `/${tenant}/${workspace}/${project}/list` },
          key ?? '?',
        ]} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 420 }}>
            <SkeletonRow width="40%" height={14} />
            <SkeletonRow width="80%" height={20} />
            <SkeletonRow width="60%" height={12} />
          </div>
        </div>
      </div>
    );
  }

  if (!issue) {
    const isError = !!fallbackError;
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={[
          { label: tenantName, to: `/${tenant}/workspaces` },
          { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
          { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
          { label: 'Issues', to: `/${tenant}/${workspace}/${project}/list` },
          key ?? '?',
        ]} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, background: 'var(--bg-muted)',
              color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Icon name="alert" size={20} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>
              {isError ? 'Could not load issue' : 'Issue not found'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '6px 0 14px' }}>
              {isError ? (
                fallbackError
              ) : (
                <>
                  <span className="mono">{key}</span> doesn’t exist in this project. It may have been deleted, or the link is wrong.
                </>
              )}
            </p>
            <Link to={`/${tenant}/${workspace}/${project}/list`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
              <Icon name="arrowRight" size={13} />Back to issues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <IssueDetail issue={issue} />;
}

/**
 * Inner detail view. Exported with an optional `issue` prop so the
 * design-canvas reference can render it with a default fixture; the
 * routed `IssueDetailPage` always passes a real one.
 */
function IssueDetail({ issue = ISSUES[0] }: { issue?: Issue }) {
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { getProject, getProjectById } = useProjects();
  const {
    issues: workspaceIssues, patchIssue, setParent,
    addRelation, removeRelation, addDependsOn, removeDependsOn,
    getDescriptionAttachments,
  } = useIssues();
  // Description attachments (`attachment:<uuid>` refs expanded by the
  // detail endpoint) — empty / undefined when the issue was only seen via
  // the workspace list and the detail fetch hasn't landed yet.
  const descriptionAttachmentsRaw = getDescriptionAttachments(issue.key) ?? [];
  // Adapt to the render-side shape consumed by `RenderedAttachmentRow` —
  // the BE already returns the same fields, just under different names
  // (filename → name, mime → mimeType). Tolerate both forms (the
  // `RawIssueAttachment` adapter type accepts either).
  const descriptionAttachments = useMemo<RenderAttachment[]>(
    () => descriptionAttachmentsRaw
      .filter((a) => !!a.id && !!a.readUrl)
      .map((a) => ({
        id: a.id,
        name: a.filename ?? a.name ?? 'attachment',
        size: typeof a.size === 'number' ? a.size : 0,
        mimeType: a.mime ?? a.mimeType ?? 'application/octet-stream',
        readUrl: a.readUrl,
      })),
    [descriptionAttachmentsRaw],
  );
  const { getUser } = useUsers();
  const { user: currentUser } = useAuth();
  // Inner detail: drive everything off the issue's owning project rather than
  // the URL slug, so the breadcrumb is right even when this is rendered inside
  // the design-canvas with a default issue.
  const owningProject = getProjectById(issue.projectId) ?? getProject(project);
  // Resolve the assignee uuid → display name at the boundary; never render
  // the uuid. Unassigned issues fall through to a placeholder.
  const assigneeName = issue.assigneeUserId
    ? (getUser(issue.assigneeUserId)?.displayName ?? UNKNOWN_USER_LABEL)
    : 'Unassigned';
  // Reporter isn't on the fixture model — surface the current user as a
  // mock so the profile link goes somewhere real.
  const reporter = currentUser?.displayName ?? UNKNOWN_USER_LABEL;
  const reporterEmail = currentUser?.email ?? '';
  const blocked = issue.status === 'in-review';

  const [inspectorWidth, setInspectorWidth] = useState<number>(loadInspectorWidth);
  useEffect(() => {
    try { localStorage.setItem(INSPECTOR_KEY, String(inspectorWidth)); } catch { /* ignore */ }
  }, [inspectorWidth]);

  // Children stay session-only for now — slice 6 wired up parent edits via
  // `setParent`, but the inspector's "link existing issue as child" flow
  // hasn't been moved to the BE yet (it would set the *target's* parent
  // to this issue, which the BE supports but the UX is its own follow-up).
  const navigate = useNavigate();
  const [addedChildren, setAddedChildren] = useState<string[]>([]);
  // Picker mode is null when closed; set to 'child', 'related', 'parent', or
  // 'depends-on'. Depends-on is Task-only and validated against the existing
  // graph to keep it acyclic.
  const [pickerMode, setPickerMode] = useState<null | 'child' | 'related' | 'parent' | 'depends-on'>(null);
  // Date + estimate edits round-trip through the BE (slice 6). Local state
  // mirrors the live value so the EditableDate / EditableEstimate controls
  // keep their existing controlled-input shape; a failed PATCH triggers a
  // state resync from the issue snapshot AND surfaces an inline message.
  const [startDate, setStartDateLocal] = useState<string | undefined>(issue.startDate);
  const [endDate, setEndDateLocal] = useState<string | undefined>(issue.endDate);
  // Per-control inline error messages — keyed by a short code so a fresh
  // success in one field doesn't dismiss an unrelated error. Cleared on
  // the next successful patch for the same key. Slice 7 adds `related` /
  // `dependsOn` for link-mutation feedback (cycle / Task-only / etc.).
  const [errors, setErrors] = useState<Partial<Record<
    'status' | 'priority' | 'owner' | 'startDate' | 'endDate' | 'estimate'
    | 'parent' | 'related' | 'dependsOn', string
  >>>({});
  const clearError = (k: keyof typeof errors) => setErrors((p) => {
    if (!(k in p)) return p;
    const next = { ...p };
    delete next[k];
    return next;
  });
  const setError = (k: keyof typeof errors, message: string) =>
    setErrors((p) => ({ ...p, [k]: message }));

  const setStartDate = async (next: string | undefined) => {
    const prev = startDate;
    setStartDateLocal(next);
    const result = await patchIssue(issue.key, { startDate: next ?? null });
    if (!result.ok) {
      setStartDateLocal(prev);
      setError('startDate', result.message);
    } else {
      clearError('startDate');
    }
  };
  const setEndDate = async (next: string | undefined) => {
    const prev = endDate;
    setEndDateLocal(next);
    const result = await patchIssue(issue.key, { endDate: next ?? null });
    if (!result.ok) {
      setEndDateLocal(prev);
      setError('endDate', result.message);
    } else {
      clearError('endDate');
    }
  };
  // Owner — single picker that switches between Person and Team. Mutual
  // exclusion is enforced server-side, but we send both fields in one PATCH
  // so the optimistic state matches what the BE will return (the BE auto-
  // clears the other side too, but the round-trip lag is visible without
  // the optimistic clear).
  const setOwner = async (next: { assigneeUserId: string | null; teamId: string | null }) => {
    const result = await patchIssue(issue.key, {
      assigneeUserId: next.assigneeUserId,
      teamId: next.teamId,
    });
    if (!result.ok) setError('owner', result.message);
    else clearError('owner');
  };

  // Depends-on (predecessors) and Related links read directly off the
  // BE-backed `issue` — slice 7 wired both into `useIssues()` so optimistic
  // mutations show up here without a local mirror. The cycle check still
  // runs against the workspace cache (see `dependencyGraph` below).
  // Effort estimate. Mandatory on Tasks (the unit of scheduled work).
  const [estimate, setEstimateLocal] = useState<number | undefined>(issue.estimate);
  const setEstimate = async (next: number | undefined) => {
    const prev = estimate;
    setEstimateLocal(next);
    const result = await patchIssue(issue.key, { estimate: next ?? null });
    if (!result.ok) {
      setEstimateLocal(prev);
      setError('estimate', result.message);
    } else {
      clearError('estimate');
    }
  };

  // Resync local-state mirrors when navigating to a different issue OR when
  // the live override store changes the field underneath us (e.g. a gantt
  // drag updates startDate while this page is mounted). Uses the *local*
  // setter, not the persist-through one, to avoid feeding the store back
  // into itself.
  useEffect(() => {
    setAddedChildren([]);
    setPickerMode(null);
    setStartDateLocal(issue.startDate);
    setEndDateLocal(issue.endDate);
    setEstimateLocal(issue.estimate);
    setErrors({});
  }, [issue.key, issue.startDate, issue.endDate, issue.estimate]);

  const allChildren = [...(issue.children ?? []), ...addedChildren];
  const allRelated = issue.relatedTo ?? [];
  const dependsOn = issue.dependsOn ?? [];
  // Parent reads through to the BE-backed issue (post-write the cache is
  // updated, so this auto-refreshes when `setParent` returns success).
  const effectiveParent = issue.parent ?? null;

  // Valid child types per the v1 hierarchy:
  //   Epic   → Story / Task / Bug
  //   Story  → Task / Bug only
  // (No epic-of-epic, no nested stories.)
  const allowedChildTypes: Issue['type'][] =
    issue.type === 'E' ? ['S', 'T', 'B']
      : issue.type === 'S' ? ['T', 'B']
        : [];
  // Inverse of the hierarchy: which types are valid parents of this issue.
  //   Story        → Epic only
  //   Task / Bug   → Epic or Story
  //   Epic         → no parent (the row is hidden, but keep the list empty)
  const allowedParentTypes: Issue['type'][] =
    issue.type === 'S' ? ['E']
      : (issue.type === 'T' || issue.type === 'B') ? ['E', 'S']
        : [];

  const goCreateChild = () => {
    navigate(`/${tenant}/${workspace}/${project}/issue/new?parent=${issue.key}`);
  };
  const openChildPicker = () => setPickerMode('child');
  const openRelatedPicker = () => setPickerMode('related');
  const openParentPicker = () => setPickerMode('parent');
  const openDependencyPicker = () => setPickerMode('depends-on');
  const clearParent = async () => {
    const result = await setParent(issue.key, null);
    if (!result.ok) setError('parent', result.message);
    else clearError('parent');
  };
  // Slice 7 — link mutations. Each path optimistically updates BOTH ends
  // of the symmetric edge in the workspace cache, then PATCHes the BE.
  // The picker is closed before the await so the UX feels snappy; failures
  // surface as inline errors under the relevant section without re-opening
  // the picker.
  const removeDependency = async (blockerKey: string) => {
    const result = await removeDependsOn(issue.key, blockerKey);
    if (!result.ok) setError('dependsOn', result.message);
    else clearError('dependsOn');
  };
  const removeBlocked = async (dependentKey: string) => {
    // Removing from the OTHER end — `dependentKey` depends on `issue.key`,
    // so the call passes the dependent's key first.
    const result = await removeDependsOn(dependentKey, issue.key);
    if (!result.ok) setError('dependsOn', result.message);
    else clearError('dependsOn');
  };
  const removeRelatedLink = async (otherKey: string) => {
    const result = await removeRelation(issue.key, otherKey);
    if (!result.ok) setError('related', result.message);
    else clearError('related');
  };

  const handlePickerSelect = async (target: Issue) => {
    const mode = pickerMode;
    setPickerMode(null);
    if (mode === 'child') setAddedChildren((prev) => [...prev, target.key]);
    else if (mode === 'related') {
      const result = await addRelation(issue.key, target.key);
      if (!result.ok) setError('related', result.message);
      else clearError('related');
    }
    else if (mode === 'parent') {
      const result = await setParent(issue.key, target.key);
      if (!result.ok) setError('parent', result.message);
      else clearError('parent');
    }
    else if (mode === 'depends-on') {
      const result = await addDependsOn(issue.key, target.key);
      if (!result.ok) setError('dependsOn', result.message);
      else clearError('dependsOn');
    }
  };

  // Predecessors map for the depends-on cycle check. Reads directly off the
  // workspace cache — `dependsOn` for `issue.key` is already up to date here
  // because optimistic mutations from `addDependsOn` write through to the
  // cache before the await resolves.
  const dependencyGraph = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const i of workspaceIssues) m.set(i.key, [...(i.dependsOn ?? [])]);
    return m;
  }, [workspaceIssues]);

  const startInspectorResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = inspectorWidth;
    // Handle sits on the inspector's LEFT edge, so dragging left grows it.
    const move = (ev: MouseEvent) => {
      const next = Math.max(
        INSPECTOR_MIN,
        Math.min(INSPECTOR_MAX, Math.round(startWidth - (ev.clientX - startX))),
      );
      setInspectorWidth(next);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: owningProject?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
        { label: 'Issues', to: `/${tenant}/${workspace}/${project}/list` },
        issue.key,
      ]} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 760, padding: '24px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TypeChip type={issue.type} />
              <IssueId id={issue.key} />
              <CopyLinkButton
                url={`${window.location.origin}/${tenant}/${workspace}/${owningProject?.slug ?? project}/issue/${issue.key}`}
              />
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                opened by{' '}
                <MemberLink tenant={tenant} workspace={workspace} name={reporter} email={reporterEmail} />
                {' · 2 days ago'}
              </span>
            </div>
            <h1 style={{
              fontSize: 22, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.3,
              margin: 0, textWrap: 'pretty',
            }}>{issue.title}</h1>

            {/*
              The blocked-transition banner only renders when the issue is in In Review
              (the example state where rules are checked). For other statuses we don't
              show the banner — a real flow improvement over the original which had it
              pinned to a single hardcoded issue.

              Drift fix: rule-types match BIRA's agreed five
              (role, assignee_only, reporter_only, required_fields, not_self).
            */}
            {blocked && (
              <div style={{ marginTop: 18, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, background: 'var(--blocked)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    <Icon name="lock" size={13} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
                      Cannot move to Done — 2 of 3 rules failing
                    </div>
                    <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
                      Resolve the items below or ask an admin to override.
                    </div>
                  </div>
                  <button className="btn btn-sm" style={{ borderColor: '#fecaca', color: '#991b1b', background: '#fff' }}>
                    Override…
                  </button>
                </div>
                <div style={{ borderTop: '1px solid #fecaca', background: '#fff', padding: '4px 0' }}>
                  <BlockedRule
                    ruleType="role"
                    status="fail"
                    title="Only admins can move to Done"
                    detail={<>You are signed in as <strong>{assigneeName}</strong> (member). Required role: <strong>admin</strong>.</>}
                  />
                  <BlockedRule
                    ruleType="required_fields"
                    status="fail"
                    title="Required fields must be set"
                    detail={
                      <>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 6px', background: '#fee2e2', borderRadius: 3,
                          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#991b1b',
                        }}>
                          estimate <span style={{ color: '#dc2626' }}>empty</span>
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 6px', background: 'var(--done-bg)', borderRadius: 3,
                          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--done)', marginLeft: 6,
                        }}>
                          assignee <Icon name="check" size={10} />
                        </span>
                      </>
                    }
                  />
                  <BlockedRule
                    ruleType="not_self"
                    status="pass"
                    title="Reviewer must not be the reporter"
                    detail={
                      <span style={{ color: 'var(--done)' }}>
                        <Icon name="check" size={11} /> You are not the reporter ({reporter}).
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {/*
              Description is editable in-session: the textarea writes back to
              local component state but not to the fixture, matching the
              prototype's other UI-only mutations (board reorders, addedChildren).
              `key={issue.key}` resets the editor when navigating between issues.
            */}
            <EditableDescription
              key={issue.key}
              initial={issue.description ?? ''}
              attachments={descriptionAttachments}
            />

            {/*
              Linked issues — sits between the description and activity so child
              and related links are reachable without hunting in the inspector.
              Mirrors the inspector's add/link affordances; renders fuller cards
              (status + assignee) since the main column has the room.
            */}
            <LinkedIssuesPanel
              issue={issue}
              childIds={allChildren}
              relatedIds={allRelated}
              dependsOnIds={dependsOn}
              dependedOnByIds={issue.dependedOnBy ?? []}
              relatedError={errors.related}
              dependsOnError={errors.dependsOn}
              onCreateChild={goCreateChild}
              onLinkChild={openChildPicker}
              onLinkRelated={openRelatedPicker}
              onLinkDependency={openDependencyPicker}
              onRemoveRelated={removeRelatedLink}
              onRemoveDependency={removeDependency}
              onRemoveBlocked={removeBlocked}
            />

            {/* Activity */}
            <ActivityFeed />
          </div>
        </div>

        {/* Right inspector — drag the left edge to resize. */}
        <aside style={{
          width: inspectorWidth, borderLeft: '1px solid var(--border-muted)', background: 'var(--bg-subtle)',
          flexShrink: 0, position: 'relative', fontSize: 12,
        }}>
          {/* Invisible 6px drag strip straddling the left border. */}
          <div
            onMouseDown={startInspectorResize}
            data-tip="Drag to resize"
            style={{
              position: 'absolute', top: 0, bottom: 0, left: -3, width: 6,
              cursor: 'col-resize', zIndex: 2,
            }}
          />
          <div className="scroll" style={{ height: '100%', overflow: 'auto', padding: 16 }}>
          <Meta label="Status" error={errors.status}>
            <button className="btn btn-sm" style={{
              width: '100%', justifyContent: 'flex-start',
              background: `var(--${issue.status}-bg)`,
              borderColor: `var(--${issue.status})`,
              color: `var(--${issue.status})`,
            }}>
              <StatusDot status={issue.status} size={11} /> {STATUS_LABEL[issue.status]}
              <Icon name="chevronDown" size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {/* Mini transition picker — clicking a row PATCHes status. The
                BE workflow guard (slice 5 on the BE) returns 403 with a
                human-readable reason on rejection; the optimistic write
                rolls back and the message renders below the chip. */}
            <div style={{
              marginTop: 6, border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '4px 8px', fontSize: 10.5, fontWeight: 600, color: 'var(--fg-faint)',
                textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg-subtle)',
              }}>Move to…</div>
              {STATUSES.filter((s) => s.id !== issue.status).map((s) => {
                const blockedHere = blocked && s.id === 'done';
                return (
                  <TransOption
                    key={s.id}
                    status={s.id}
                    label={s.name}
                    trigger={s.id === 'done' && issue.status === 'in-review' ? 'approve' : undefined}
                    blocked={blockedHere}
                    reason={blockedHere ? '2 rules failing' : undefined}
                    available={!blockedHere}
                    onClick={async () => {
                      const result = await patchIssue(issue.key, { status: s.id });
                      if (!result.ok) setError('status', result.message);
                      else clearError('status');
                    }}
                  />
                );
              })}
            </div>
          </Meta>
          <Meta label="Priority">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Priority p={issue.priority} /><span>{PRIORITY_LABEL[issue.priority]}</span>
            </span>
          </Meta>
          <Meta label="Owner" error={errors.owner}>
            <OwnerPicker
              assigneeUserId={issue.assigneeUserId}
              teamId={issue.teamId ?? null}
              onChange={setOwner}
              variant="inspector"
            />
          </Meta>
          <Meta label="Reporter">
            <Link
              to={`/${tenant}/${workspace}/u/${encodeURIComponent(reporterEmail)}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                color: 'var(--fg)', textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              <Avatar name={reporter} size={20} /><span>{reporter}</span>
            </Link>
          </Meta>
          <Meta label="Project">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="folder" size={13} color="var(--fg-muted)" />
              {owningProject?.name ?? 'Unknown project'}
            </span>
          </Meta>
          {/* Effort. Required on Tasks (the unit of scheduled work);
              shown read-only on Bugs (handy context, not enforced); hidden
              on Stories and Epics — those roll up from leaves. The "≈ N
              days" hint is calendar-translated using IDEAL_POINTS_PER_DAY.
              For Tasks with both dates set we also surface the actual
              points-per-day load — anything above 1× ideal is flagged. */}
          {(issue.type === 'T' || issue.type === 'B') && (
            <Meta label={issue.type === 'T' ? 'Effort (required)' : 'Effort'} error={errors.estimate}>
              <EditableEstimate
                value={estimate}
                onChange={setEstimate}
                required={issue.type === 'T'}
              />
              {issue.type === 'T' && (
                <WorkloadHint estimate={estimate} startDate={startDate} endDate={endDate} />
              )}
            </Meta>
          )}
          <Meta label="Labels">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {issue.labels.length === 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>No labels</span>
              )}
              {issue.labels.map((l) => (
                <span key={l} className="pill" style={{ background: 'var(--bg-muted)', color: 'var(--fg)' }}>{l}</span>
              ))}
            </div>
          </Meta>
          {/* Schedules live on leaf work (Tasks and Bugs) only. Story and
              Epic timelines are derived from the leaves underneath them on
              the Gantt — they don't carry their own dates. */}
          {(issue.type === 'T' || issue.type === 'B') && (
            <>
              <Meta
                label="Start date"
                error={errors.startDate}
                extras={startDate ? <ClearDateButton onClear={() => setStartDate(undefined)} label="Clear start date" /> : undefined}
              >
                <EditableDate value={startDate} max={endDate} onChange={setStartDate} />
              </Meta>
              <Meta
                label="End date"
                error={errors.endDate}
                extras={endDate ? <ClearDateButton onClear={() => setEndDate(undefined)} label="Clear end date" /> : undefined}
              >
                <EditableDate value={endDate} min={startDate} onChange={setEndDate} />
              </Meta>
            </>
          )}
          {/* Hierarchy.
              - Epics are top-level; they cannot have a parent, so the Parent
                Meta is hidden entirely for type 'E'.
              - Stories require an Epic parent — the clear (×) button is
                hidden, and the empty state flags the requirement.
              - Tasks / Bugs can sit under an Epic or a Story (or be
                top-level); parent is optional, the × clears it.
              Leaves (Task / Bug) cannot have children, so the Children Meta
              is hidden for them. */}
          {issue.type !== 'E' && (
            <Meta
              label={issue.type === 'S' ? 'Parent (required)' : 'Parent'}
              error={errors.parent}
              extras={
                <button
                  type="button"
                  onClick={openParentPicker}
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0 6px', height: 20, fontSize: 11 }}
                  aria-label={effectiveParent ? 'Change parent' : 'Set parent'}
                >
                  <Icon name="link" size={11} /> {effectiveParent ? 'Change' : 'Set'}
                </button>
              }
            >
              {effectiveParent ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <IssueLink id={effectiveParent} />
                  {/* Stories must always have a parent — no clear affordance. */}
                  {issue.type !== 'S' && (
                    <button
                      type="button"
                      onClick={clearParent}
                      aria-label="Clear parent"
                      data-tip="Clear parent"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, padding: 0, borderRadius: 3,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--fg-faint)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--fg)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; }}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  )}
                </span>
              ) : issue.type === 'S' ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11.5, color: 'var(--blocked)',
                }}>
                  <Icon name="alert" size={12} />
                  Pick an Epic — Stories must roll up to one
                </span>
              ) : (
                <NotSet />
              )}
            </Meta>
          )}
          {/* Multi-issue relations (Children, Related, Depends on, Blocks)
              live in the main column below the description, not in the
              inspector — the lists need horizontal room and tend to be the
              context the user wants while reading the issue. The inspector
              keeps the singular Parent reference so structural placement
              stays one click away. */}
          </div>
        </aside>
      </div>
      {pickerMode && (
        <IssuePickerModal
          title={
            pickerMode === 'child' ? 'Link child issue'
              : pickerMode === 'related' ? 'Link related issue'
                : pickerMode === 'depends-on' ? 'Add a dependency'
                  : 'Set parent issue'
          }
          subtitle={
            pickerMode === 'child'
              ? `Pick an issue to link as a child of ${issue.key}. ${
                  issue.type === 'E' ? 'Stories, Tasks, and Bugs are valid.' : 'Only Tasks and Bugs are valid children of a Story.'
                }`
              : pickerMode === 'related'
                ? 'Pick any issue to mark as related. Relates is symmetric.'
                : pickerMode === 'depends-on'
                  ? `Pick a Task that ${issue.key} should wait on. Only other Tasks are valid; candidates that would close a cycle are filtered out.`
                  : `Pick the parent of ${issue.key}. ${
                      issue.type === 'S' ? 'Only Epics are valid parents of a Story.' : 'Epics and Stories are valid parents of a Task or Bug.'
                    }`
          }
          excludeIds={[
            issue.key,
            ...allChildren,
            ...allRelated,
            ...(effectiveParent ? [effectiveParent] : []),
            ...(pickerMode === 'depends-on' ? dependsOn : []),
          ]}
          filter={
            pickerMode === 'child'
              ? (i) => allowedChildTypes.includes(i.type)
              : pickerMode === 'parent'
                ? (i) => allowedParentTypes.includes(i.type)
                : pickerMode === 'depends-on'
                  ? (i) => i.type === 'T' && !dependsOnWouldCycle(issue.key, i.key, dependencyGraph)
                  : undefined
          }
          onSelect={handlePickerSelect}
          onClose={() => setPickerMode(null)}
        />
      )}
    </div>
  );
}

type RuleType = 'role' | 'assignee_only' | 'reporter_only' | 'required_fields' | 'not_self';

const RULE_ICON: Record<RuleType, string> = {
  role: 'shield',
  assignee_only: 'user',
  reporter_only: 'user',
  required_fields: 'asterisk',
  not_self: 'users',
};

interface BlockedRuleProps {
  ruleType: RuleType;
  status: 'pass' | 'fail';
  title: string;
  detail: ReactNode;
}
function BlockedRule({ ruleType, status, title, detail }: BlockedRuleProps) {
  const passing = status === 'pass';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px' }}>
      <div style={{
        width: 18, height: 18, borderRadius: 9,
        background: passing ? 'var(--done)' : '#fff',
        color: passing ? '#fff' : '#dc2626',
        border: passing ? 'none' : '1.5px solid #dc2626',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        {passing ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={RULE_ICON[ruleType]} size={12} color="var(--fg-muted)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: passing ? 'var(--fg-muted)' : 'var(--fg)' }}>{title}</span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--fg-faint)', background: 'var(--bg-subtle)',
            padding: '1px 4px', borderRadius: 2,
          }}>{ruleType}</span>
          {!passing && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px',
              background: '#fee2e2', color: '#991b1b', borderRadius: 3,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>Failing</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{detail}</div>
      </div>
    </div>
  );
}

interface TransOptionProps {
  status: string;
  label: string;
  trigger?: string;
  available?: boolean;
  blocked?: boolean;
  reason?: string;
  /**
   * Slice 6 — fires when the row is clicked and the transition isn't
   * locally blocked. Awaits the BE PATCH; the host is responsible for
   * rolling back / surfacing errors.
   */
  onClick?: () => void;
}
function TransOption({ status, label, trigger, blocked, reason, onClick }: TransOptionProps) {
  const inner = (
    <>
      <StatusDot status={status} size={10} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      {trigger && (
        <span className="mono" style={{
          fontSize: 10.5, color: 'var(--fg-muted)', background: 'var(--bg-subtle)',
          padding: '1px 5px', borderRadius: 3,
        }}>{trigger}</span>
      )}
      <div style={{ flex: 1 }} />
      {blocked && (
        <span style={{ fontSize: 10.5, color: 'var(--blocked)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="lock" size={11} /><span>{reason}</span>
        </span>
      )}
    </>
  );
  if (onClick && !blocked) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
          width: '100%', textAlign: 'left',
          cursor: 'pointer',
          background: 'transparent', border: 'none',
          borderTop: '1px solid var(--border-muted)',
          color: 'inherit', font: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      cursor: blocked ? 'not-allowed' : 'pointer',
      opacity: blocked ? 0.6 : 1,
      borderTop: '1px solid var(--border-muted)',
    }}>
      {inner}
    </div>
  );
}

function Meta({ label, extras, error, children }: {
  label: string;
  extras?: ReactNode;
  /** Inline error message rendered below the value — used for failed PATCH feedback. */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 18, marginBottom: 6 }}>
        <div className="label-section">{label}</div>
        {extras && <><div style={{ flex: 1 }} />{extras}</>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg)' }}>{children}</div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 4, fontSize: 11.5, color: 'var(--blocked)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="alert" size={11} />{error}
        </div>
      )}
    </div>
  );
}

function DateValue({ iso }: { iso: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Icon name="calendar" size={13} color="var(--fg-muted)" />
      <span>{formatISODate(iso)}</span>
    </span>
  );
}

function NotSet() {
  return <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Not set</span>;
}

/**
 * Inline-editable ISO date field. Click the value to swap in a native
 * date input; commits on blur or Enter, cancels on Escape. Session-only
 * — like the rest of the inspector, no fixture writeback.
 */
function EditableDate({
  value, min, max, onChange,
}: {
  value: string | undefined;
  min?: string;
  max?: string;
  onChange: (next: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Try to surface the picker UI directly so the user doesn't need a
    // second click. `showPicker` is gated on a recent user interaction;
    // any browser that disallows it will silently no-op and the input
    // still works via keyboard.
    try { el.showPicker?.(); } catch { /* ignore */ }
  }, [editing]);

  if (editing) {
    const commit = () => {
      onChange(draft || undefined);
      setEditing(false);
    };
    const cancel = () => {
      setDraft(value ?? '');
      setEditing(false);
    };
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        style={{
          fontSize: 12.5, padding: '2px 6px', height: 24,
          border: '1px solid var(--border)', borderRadius: 4,
          background: 'var(--bg)', color: 'var(--fg)',
          fontFamily: 'inherit',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 4px', margin: '-2px -4px',
        border: '1px solid transparent', borderRadius: 4,
        background: 'transparent', color: 'var(--fg)',
        fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.borderColor = 'var(--border-muted)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      {value ? <DateValue iso={value} /> : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-faint)' }}>
          <Icon name="calendar" size={13} color="var(--fg-faint)" />
          <span>Set date</span>
        </span>
      )}
    </button>
  );
}

/**
 * Inline-editable effort estimate, in the same units as `Issue.estimate`.
 * Click the value (or the "Set effort" prompt) to reveal a number input;
 * commit on blur or Enter, cancel on Escape. When `required` is true and
 * the value is missing, the empty state surfaces a "Required" prompt
 * instead of plain "Not set", matching the Story-without-parent treatment.
 *
 * The "≈ N days" hint translates effort points to calendar days using
 * IDEAL_POINTS_PER_DAY (4) — a single project-agnostic constant for v1.
 */
function EditableEstimate({
  value, onChange, required,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  required: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value !== undefined ? String(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value !== undefined ? String(value) : ''); }, [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    const commit = () => {
      const trimmed = draft.trim();
      if (trimmed === '') {
        onChange(undefined);
      } else {
        const n = Number.parseFloat(trimmed);
        if (Number.isFinite(n) && n >= 0) onChange(n);
      }
      setEditing(false);
    };
    const cancel = () => {
      setDraft(value !== undefined ? String(value) : '');
      setEditing(false);
    };
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        style={{
          fontSize: 12.5, padding: '2px 6px', height: 24, width: 80,
          border: '1px solid var(--border)', borderRadius: 4,
          background: 'var(--bg)', color: 'var(--fg)',
          fontFamily: 'inherit',
        }}
      />
    );
  }

  if (value === undefined) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '2px 4px', margin: '-2px -4px',
          border: '1px solid transparent', borderRadius: 4,
          background: 'transparent',
          fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
          color: required ? 'var(--blocked)' : 'var(--fg-faint)',
        }}
      >
        <Icon name={required ? 'alert' : 'asterisk'} size={12} />
        <span>{required ? 'Required — set effort' : 'Set effort'}</span>
      </button>
    );
  }

  const days = value / IDEAL_POINTS_PER_DAY;
  // "Working days" — Sat/Sun don't count under the v1 working-week policy.
  // Show fractional days for sub-day work, whole days for >= 1.
  const daysLabel =
    days === 0 ? '0 working days'
      : days < 1 ? `≈ ${days.toFixed(2).replace(/\.?0+$/, '')} working day`
        : days === 1 ? '≈ 1 working day'
          : `≈ ${(Math.round(days * 10) / 10).toString().replace(/\.0$/, '')} working days`;
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '2px 4px', margin: '-2px -4px',
        border: '1px solid transparent', borderRadius: 4,
        background: 'transparent', color: 'var(--fg)',
        fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.borderColor = 'var(--border-muted)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      <span className="tnum" style={{ fontWeight: 600 }}>{value} pt{value === 1 ? '' : 's'}</span>
      <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{daysLabel} at {IDEAL_POINTS_PER_DAY}/day</span>
    </button>
  );
}

/**
 * Compares the Task's effort against its scheduled working-day span and
 * shows the resulting points-per-day. Anything above ideal is rendered
 * in the blocked colour with an explicit "overworked" call-out so the
 * planner can see the cost of squeezing the bar without doing the math.
 * Renders nothing when load can't be computed (no estimate, missing
 * date, span lands entirely on weekends/holidays).
 */
function WorkloadHint({
  estimate, startDate, endDate,
}: {
  estimate: number | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}) {
  const load = computeTaskLoad(estimate, startDate, endDate);
  if (!load) return null;
  const ppd = (Math.round(load.pointsPerDay * 10) / 10).toString().replace(/\.0$/, '');
  const overloaded = load.overload > 1.0001;
  const overloadX = (Math.round(load.overload * 10) / 10).toString().replace(/\.0$/, '');
  if (!overloaded) {
    return (
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-faint)' }}>
        Scheduled: {ppd} pt{ppd === '1' ? '' : 's'}/day across {load.workingDays} working day{load.workingDays === 1 ? '' : 's'} — within ideal load.
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 6,
      display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '6px 8px', borderRadius: 4,
      background: 'var(--blocked-bg)', color: 'var(--blocked)',
      fontSize: 11.5, fontWeight: 500,
    }}>
      <Icon name="alert" size={12} />
      <span>
        Overworked: {ppd} pts/day across {load.workingDays} working day{load.workingDays === 1 ? '' : 's'}
        {' '}({overloadX}× the {IDEAL_POINTS_PER_DAY}/day ideal).
        {' '}Lengthen the bar on the Gantt to bring the load down.
      </span>
    </div>
  );
}

function ClearDateButton({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="btn btn-ghost btn-sm"
      style={{ padding: '0 6px', height: 20, fontSize: 11 }}
      aria-label={label}
    >
      <Icon name="x" size={11} /> Clear
    </button>
  );
}

/**
 * Inline person reference — name styled to read like body text in muted
 * surroundings (e.g. "opened by …") and underline on hover so it's
 * obviously clickable. Email is encoded so `@` and `.` survive routing
 * in case any environment is picky.
 */
function MemberLink({ tenant, workspace, name, email }: { tenant: string; workspace: string; name: string; email: string }) {
  return (
    <Link
      to={`/${tenant}/${workspace}/u/${encodeURIComponent(email)}`}
      style={{ color: 'var(--fg)', fontWeight: 500, textDecoration: 'none' }}
      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
    >
      {name}
    </Link>
  );
}

/**
 * Inline-editable issue description.
 *
 * View mode renders the saved value through `renderRichText` (so triple-
 * backtick code blocks survive); empty state offers an "Add a description"
 * affordance. Edit mode is a textarea with Save / Cancel + ⌘+Enter / Esc.
 *
 * State is local to this mount — saving updates what the user sees but does
 * not write back to the fixture. The parent passes `key={issue.key}` so
 * navigating to a different issue resets the editor cleanly.
 */
function EditableDescription({
  initial,
  attachments = [],
}: {
  initial: string;
  attachments?: RenderAttachment[];
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Selection to restore after `setDraft` commits — toolbar/shortcut ops
  // mutate the value through state, which would otherwise reset the caret.
  const pendingSelection = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!editing) return;
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    // Bind Escape at the window level so it cancels even if the user has
    // clicked outside the textarea (focus on a button, body, etc.). The
    // textarea's own onKeyDown can't see those.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  useEffect(() => {
    if (!editing || !pendingSelection.current) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const [s, e] = pendingSelection.current;
    pendingSelection.current = null;
    ta.focus();
    ta.setSelectionRange(s, e);
  }, [draft, editing]);

  const applyEdit = (
    op: (v: string, s: number, e: number) => { value: string; selStart: number; selEnd: number },
  ) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const result = op(ta.value, ta.selectionStart, ta.selectionEnd);
    pendingSelection.current = [result.selStart, result.selEnd];
    setDraft(result.value);
  };

  // Toggle inline wrap. If the selection is already enclosed by the markers,
  // strip them; otherwise insert them around the selection.
  const wrap = (open: string, close: string = open) => applyEdit((v, s, e) => {
    const already =
      s >= open.length && e + close.length <= v.length &&
      v.slice(s - open.length, s) === open &&
      v.slice(e, e + close.length) === close;
    if (already) {
      return {
        value: v.slice(0, s - open.length) + v.slice(s, e) + v.slice(e + close.length),
        selStart: s - open.length,
        selEnd: e - open.length,
      };
    }
    return {
      value: v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e),
      selStart: s + open.length,
      selEnd: e + open.length,
    };
  });

  // Toggle a per-line prefix across every line touched by the selection.
  // If every line already has the prefix, remove it; otherwise add it.
  const linePrefix = (prefix: string) => applyEdit((v, s, e) => {
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const eolIdx = v.indexOf('\n', e);
    const lineEnd = eolIdx === -1 ? v.length : eolIdx;
    const block = v.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const allHavePrefix = lines.length > 0 && lines.every((l) => l.startsWith(prefix));
    const next = allHavePrefix
      ? lines.map((l) => l.slice(prefix.length)).join('\n')
      : lines.map((l) => prefix + l).join('\n');
    return {
      value: v.slice(0, lineStart) + next + v.slice(lineEnd),
      selStart: lineStart,
      selEnd: lineEnd + (next.length - block.length),
    };
  });

  const insertCodeBlock = () => applyEdit((v, s, e) => {
    const sel = v.slice(s, e);
    const fence = '```\n' + sel + '\n```';
    return {
      value: v.slice(0, s) + fence + v.slice(e),
      selStart: s + 4,
      selEnd: s + 4 + sel.length,
    };
  });

  const insertLink = () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    applyEdit((v, s, e) => {
      const sel = v.slice(s, e) || 'link';
      const md = `[${sel}](${url})`;
      return {
        value: v.slice(0, s) + md + v.slice(e),
        selStart: s + 1,
        selEnd: s + 1 + sel.length,
      };
    });
  };

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = () => {
    setValue(draft);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 22, marginBottom: 8 }}>
        <span className="label-section">Description</span>
        <div style={{ flex: 1 }} />
        {!editing && value.trim() && (
          <button
            type="button"
            onClick={startEdit}
            className="btn btn-ghost btn-sm"
            data-tip="Edit description"
            aria-label="Edit description"
            style={{ width: 26, height: 22, padding: 0 }}
          >
            <Icon name="edit" size={12} color="var(--fg-muted)" />
          </button>
        )}
      </div>

      {editing ? (
        <>
          {/*
            No `overflow: hidden` here — the toolbar's data-tip tooltips
            sit above the buttons via a CSS pseudo-element, and clipping
            the wrapper would chop them off (see CLAUDE.md tooltip note).
          */}
          <div style={{
            border: '1px solid var(--accent)',
            borderRadius: 8,
            background: 'var(--bg)',
            boxShadow: '0 0 0 3px var(--accent-muted)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
              padding: '5px 8px',
              borderBottom: '1px solid var(--border-muted)',
              borderRadius: '7px 7px 0 0',
              background: 'var(--bg-subtle)',
            }}>
              <FmtBtn label="B" tip="Bold (⌘B)" onPress={() => wrap('**')} fontWeight={700} />
              <FmtBtn label="I" tip="Italic (⌘I)" onPress={() => wrap('_')} fontStyle="italic" />
              <FmtBtn label="S" tip="Strike (⌘⇧X)" onPress={() => wrap('~')} textDecoration="line-through" />
              <FmtBtn label="<>" tip="Inline code (⌘⇧C)" onPress={() => wrap('`')} mono />
              <FmtBtn icon="link" tip="Link (⌘K)" onPress={insertLink} />
              <FmtSep />
              <FmtBtn label="H1" tip="Heading 1" onPress={() => linePrefix('# ')} />
              <FmtBtn label="H2" tip="Heading 2" onPress={() => linePrefix('## ')} />
              <FmtBtn label="H3" tip="Heading 3" onPress={() => linePrefix('### ')} />
              <FmtSep />
              <FmtBtn icon="list" tip="Bulleted list" onPress={() => linePrefix('- ')} />
              <FmtBtn label="1." tip="Numbered list" onPress={() => linePrefix('1. ')} mono />
              <FmtBtn label={'“ ”'} tip="Quote" onPress={() => linePrefix('> ')} />
              <FmtBtn label="```" tip="Code block" onPress={insertCodeBlock} mono />
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  save();
                  return;
                }
                if (e.metaKey || e.ctrlKey) {
                  const k = e.key.toLowerCase();
                  if (!e.shiftKey && k === 'b') { e.preventDefault(); wrap('**'); return; }
                  if (!e.shiftKey && k === 'i') { e.preventDefault(); wrap('_'); return; }
                  if (!e.shiftKey && k === 'k') { e.preventDefault(); insertLink(); return; }
                  if (e.shiftKey && k === 'x') { e.preventDefault(); wrap('~'); return; }
                  if (e.shiftKey && k === 'c') { e.preventDefault(); wrap('`'); return; }
                }
                // Escape is handled at the window level so it works even when
                // focus has moved off the textarea.
              }}
              rows={Math.max(8, draft.split('\n').length + 1)}
              placeholder="Describe the issue. Markdown: **bold**, _italic_, ~strike~, `code`, # heading, > quote, - list, ```fence```."
              style={{
                width: '100%', display: 'block',
                border: 'none',
                padding: '12px 14px',
                fontSize: 14, color: 'var(--fg)', background: 'transparent',
                fontFamily: 'var(--font-sans)', lineHeight: 1.65,
                outline: 'none', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              Save
            </button>
            <button type="button" className="btn btn-sm" onClick={cancel}>
              Cancel
            </button>
            <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--fg-faint)' }}>
              ⌘+Enter to save · Esc to cancel
            </span>
          </div>
        </>
      ) : value.trim() ? (
        <>
          <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.65 }}>
            {renderRichText(value)}
          </div>
          {attachments.length > 0 && (
            <RenderedAttachmentRow attachments={attachments} />
          )}
        </>
      ) : attachments.length > 0 ? (
        // Description body is empty but attachments were uploaded with the
        // issue — surface them so the files are still reachable, with an
        // edit affordance for adding prose later.
        <RenderedAttachmentRow attachments={attachments} />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '14px 16px',
            border: '1px dashed var(--border)', borderRadius: 8,
            background: 'transparent', color: 'var(--fg-muted)',
            fontSize: 13, cursor: 'pointer', textAlign: 'left',
            transition: 'background .12s, border-color .12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-subtle)';
            e.currentTarget.style.borderColor = 'var(--fg-faint)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <Icon name="plus" size={13} />Add a description
        </button>
      )}
    </section>
  );
}

// Slack-style toolbar button. `onMouseDown.preventDefault()` keeps focus in
// the textarea so the current selection survives the click.
function FmtBtn({
  label,
  icon,
  tip,
  onPress,
  fontWeight,
  fontStyle,
  textDecoration,
  mono,
}: {
  label?: string;
  icon?: string;
  tip: string;
  onPress: () => void;
  fontWeight?: number;
  fontStyle?: string;
  textDecoration?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      data-tip={tip}
      aria-label={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 26, height: 24, padding: '0 6px', borderRadius: 4,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--fg-muted)',
        fontSize: 12, fontWeight, fontStyle, textDecoration,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-muted)';
        e.currentTarget.style.color = 'var(--fg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--fg-muted)';
      }}
    >
      {icon ? <Icon name={icon} size={13} /> : label}
    </button>
  );
}

function FmtSep() {
  return (
    <span
      aria-hidden="true"
      style={{ width: 1, height: 16, background: 'var(--border-muted)', margin: '0 4px' }}
    />
  );
}

/**
 * JIRA-style copy-link affordance. The icon swaps to a check for ~1.5s
 * after a successful copy so the user gets passive confirmation without
 * a toast system.
 */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard requires a secure context; fail silently in dev
      // edge cases (file://, http://, etc.). The button stays usable.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-ghost btn-sm"
      data-tip={copied ? 'Copied!' : 'Copy link to issue'}
      aria-label="Copy link to issue"
      style={{ width: 22, height: 22, padding: 0 }}
    >
      <Icon
        name={copied ? 'check' : 'copy'}
        size={12}
        color={copied ? 'var(--done)' : 'var(--fg-muted)'}
      />
    </button>
  );
}

/**
 * A single issue rendered as a Link with type chip + key + title. Falls back
 * to plain text if the referenced issue isn't in the workspace cache (would
 * only happen if a relation went stale or the cache hasn't yet hydrated).
 */
function IssueLink({ id }: { id: string }) {
  const { tenant, workspace } = useTenantContext();
  const { getProjectById } = useProjects();
  const { getIssue } = useIssues();
  const target = getIssue(id);
  if (!target) {
    return <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{id}</span>;
  }
  const projectSlug = getProjectById(target.projectId)?.slug ?? '';
  return (
    <Link
      to={`/${tenant}/${workspace}/${projectSlug}/issue/${target.key}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
        color: 'var(--fg)', fontSize: 12, textDecoration: 'none',
      }}
    >
      <TypeChip type={target.type} />
      <span className="mono" style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{target.key}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {target.title}
      </span>
    </Link>
  );
}

/**
 * Trigger + dropdown for "Create new issue" / "Link existing issue".
 * Owns its own open/close state so it can be dropped into multiple
 * surfaces (inspector, main-column linked-issues panel) without the
 * parent juggling refs.
 *
 * `variant="compact"` matches the inspector's tighter row chrome;
 * the default is a normal `btn btn-sm`.
 */
function AddChildMenu({
  onCreate,
  onLink,
  variant = 'default',
}: {
  onCreate: () => void;
  onLink: () => void;
  variant?: 'default' | 'compact';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const triggerProps = variant === 'compact'
    ? {
        className: 'btn btn-ghost btn-sm',
        style: { padding: '0 6px', height: 20, fontSize: 11 } as const,
        iconSize: 11,
      }
    : {
        className: 'btn btn-sm',
        style: undefined,
        iconSize: 12,
      };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerProps.className}
        style={triggerProps.style}
        aria-label="Add child issue"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="plus" size={triggerProps.iconSize} /> Add
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            minWidth: 200, zIndex: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 6, boxShadow: 'var(--shadow-md)', overflow: 'hidden',
          }}
        >
          <ChildMenuItem icon="plus" onClick={() => { setOpen(false); onCreate(); }}>
            Create new issue
          </ChildMenuItem>
          <ChildMenuItem icon="link" onClick={() => { setOpen(false); onLink(); }}>
            Link existing issue
          </ChildMenuItem>
        </div>
      )}
    </div>
  );
}

/**
 * Main-column block that surfaces hierarchy + relates without forcing
 * the user into the inspector. Children section only appears for issue
 * types that *can* have children (Epic, Story); Related is universal.
 */
function LinkedIssuesPanel({
  issue,
  childIds,
  relatedIds,
  dependsOnIds,
  dependedOnByIds,
  relatedError,
  dependsOnError,
  onCreateChild,
  onLinkChild,
  onLinkRelated,
  onLinkDependency,
  onRemoveRelated,
  onRemoveDependency,
  onRemoveBlocked,
}: {
  issue: Issue;
  childIds: string[];
  relatedIds: string[];
  dependsOnIds: string[];
  dependedOnByIds: string[];
  /** Inline error for the relates section — failed add/remove. */
  relatedError?: string;
  /** Inline error covering both "Depends on" + "Blocks" (same edge type). */
  dependsOnError?: string;
  onCreateChild: () => void;
  onLinkChild: () => void;
  onLinkRelated: () => void;
  onLinkDependency: () => void;
  onRemoveRelated: (id: string) => void;
  onRemoveDependency: (id: string) => void;
  /** Remove a successor from the OTHER end (the dependent's row). */
  onRemoveBlocked: (id: string) => void;
}) {
  const showChildren = issue.type === 'E' || issue.type === 'S';
  const childEmpty = issue.type === 'E'
    ? 'No child issues yet. Break this epic down into stories, tasks, or bugs.'
    : 'No child issues yet. Add the tasks or bugs that make up this story.';
  // Depends-on / Blocks are Task-only — Stories and Epics roll up to leaves
  // and don't carry their own dependency edges.
  const showDependencies = issue.type === 'T';
  const showBlocks = issue.type === 'T' && dependedOnByIds.length > 0;
  return (
    <section style={{ marginTop: 28 }}>
      {showChildren && (
        <LinkedSection
          label="Child issues"
          count={childIds.length}
          ids={childIds}
          emptyText={childEmpty}
          action={<AddChildMenu onCreate={onCreateChild} onLink={onLinkChild} />}
        />
      )}
      {showDependencies && (
        <LinkedSection
          label="Depends on"
          count={dependsOnIds.length}
          ids={dependsOnIds}
          emptyText="Nothing blocking — this task is ready to start once scheduled."
          error={dependsOnError}
          onRemove={onRemoveDependency}
          action={
            <button
              type="button"
              onClick={onLinkDependency}
              className="btn btn-sm"
              aria-label="Add a dependency"
            >
              <Icon name="link" size={12} /> Add dependency
            </button>
          }
        />
      )}
      {showBlocks && (
        <LinkedSection
          label="Blocks"
          count={dependedOnByIds.length}
          ids={dependedOnByIds}
          emptyText=""
          // Same error key — Depends-on and Blocks both surface
          // dependency-mutation failures, but only one section renders an
          // error at a time (the one most recently mutated). Keying off
          // a single `dependsOnError` keeps the contract simple.
          onRemove={onRemoveBlocked}
        />
      )}
      <LinkedSection
        label="Related issues"
        count={relatedIds.length}
        ids={relatedIds}
        emptyText="No related issues linked yet."
        error={relatedError}
        onRemove={onRemoveRelated}
        action={
          <button
            type="button"
            onClick={onLinkRelated}
            className="btn btn-sm"
            aria-label="Link a related issue"
          >
            <Icon name="link" size={12} /> Link issue
          </button>
        }
      />
    </section>
  );
}

function LinkedSection({
  label,
  count,
  ids,
  emptyText,
  action,
  error,
  onRemove,
}: {
  label: string;
  count: number;
  ids: string[];
  emptyText: string;
  action?: ReactNode;
  /** Inline error rendered beneath the action row — covers add + remove failures. */
  error?: string;
  /** When provided, each card shows a × that calls this with the id. */
  onRemove?: (id: string) => void;
}) {
  // Hide the section entirely if there's nothing to show and no empty-state
  // copy — used by "Blocks" which is read-only and should disappear when
  // empty rather than render a placeholder card.
  if (ids.length === 0 && !emptyText && !action) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span className="label-section">{label}</span>
        <span
          className="tnum"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
            fontSize: 10, fontWeight: 600,
            background: 'var(--bg-muted)', color: 'var(--fg-muted)',
          }}
        >{count}</span>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 8, fontSize: 11.5, color: 'var(--blocked)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Icon name="alert" size={11} />{error}
        </div>
      )}
      {ids.length === 0 ? (
        emptyText ? (
          <div style={{
            padding: '14px 12px', textAlign: 'center',
            fontSize: 12.5, color: 'var(--fg-muted)',
            border: '1px dashed var(--border-muted)', borderRadius: 6,
          }}>{emptyText}</div>
        ) : null
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ids.map((id) => (
            <LinkedIssueCard
              key={id}
              id={id}
              onRemove={onRemove ? () => onRemove(id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkedIssueCard({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const { tenant, workspace } = useTenantContext();
  const { getProjectById } = useProjects();
  const { getUser } = useUsers();
  const { getIssue } = useIssues();
  const target = getIssue(id);
  if (!target) {
    return (
      <div style={{
        padding: '8px 10px',
        border: '1px solid var(--border-muted)', borderRadius: 6,
        fontSize: 12, color: 'var(--fg-muted)',
      }}>
        <span className="mono">{id}</span> — not found
      </div>
    );
  }
  const projectSlug = getProjectById(target.projectId)?.slug ?? '';
  const targetAssigneeName = target.assigneeUserId
    ? (getUser(target.assigneeUserId)?.displayName ?? UNKNOWN_USER_LABEL)
    : '';
  // Card is a div with the body content wrapped in a Link; the optional ×
  // sits as a sibling of the link so a click on it doesn't navigate.
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', minWidth: 0,
        border: '1px solid var(--border-muted)', borderRadius: 6,
        background: 'var(--bg)',
        transition: 'border-color .12s, background .12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.background = 'var(--bg-subtle)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-muted)';
        e.currentTarget.style.background = 'var(--bg)';
      }}
    >
      <Link
        to={`/${tenant}/${workspace}/${projectSlug}/issue/${target.key}`}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
          padding: '8px 10px', color: 'var(--fg)', textDecoration: 'none',
        }}
      >
        <StatusDot status={target.status} size={10} />
        <TypeChip type={target.type} />
        <span className="mono" style={{ color: 'var(--fg-muted)', flexShrink: 0, fontSize: 12 }}>{target.key}</span>
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 13,
        }}>{target.title}</span>
        {targetAssigneeName && <Avatar name={targetAssigneeName} size={20} />}
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${target.key}`}
          data-tip="Remove"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, marginRight: 4, padding: 0, borderRadius: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--fg-faint)', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-faint)'; }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

function ChildMenuItem({ icon, onClick, children }: { icon: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '8px 10px', textAlign: 'left',
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 12.5, color: 'var(--fg)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon name={icon} size={12} color="var(--fg-muted)" />
      <span>{children}</span>
    </button>
  );
}

// --- Activity feed with All / Comments tab filter (JIRA-style) ---
//
// Comments come from the BE — list/create/update/delete via `/api/comments`.
// Events (status changes, label edits, etc.) are still fixture flavour for
// now; the audit-log slice will replace them. The two streams are merged
// in the All tab; the Comments tab shows only the API-backed list.
//
// Comment cache lives in component state, keyed implicitly by the issue
// (the parent re-keys on `:key`). Mutations call the API, then patch the
// local cache; failures roll back. When the user navigates away the cache
// is dropped and a fresh fetch runs on re-entry — matches the
// per-issue-ephemeral pattern used elsewhere on this screen.

type FeedItem =
  | { kind: 'comment'; comment: Comment }
  | { kind: 'event'; who: string; when: string; verb: string; from?: string; to?: string; detail?: ReactNode; icon?: string };

// Best-effort relative timestamp. Caps at "1w ago" then falls back to a
// short date. Mirrors the language used by the fixture stream so the
// Comments + All tabs read consistently.
function formatRelative(iso: string): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  if (day < 14) return '1w ago';
  // For older comments fall through to a short date.
  const d = new Date(ts);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Fixture events kept as flavour until the audit-log slice replaces them.
// Comment items used to live here too; they've moved to the BE-backed list.
const FIXTURE_EVENTS: FeedItem[] = [
  { kind: 'event', who: 'Jordan Lee', when: '3h ago', verb: 'moved this from', from: 'In Progress', to: 'In Review' },
  {
    kind: 'event', who: 'Sam Park', when: 'yesterday', verb: 'added the label', icon: 'tag',
    detail: <span className="pill" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: 4 }}>regression</span>,
  },
];

type FeedTab = 'all' | 'comments';

function ActivityFeed() {
  const { tenant, workspace, project } = useTenantContext();
  const { key } = useParams<{ key: string }>();
  const [tab, setTab] = useState<FeedTab>('comments');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch on (tenant, workspace, project, key) — when the user navigates
  // to a different issue the cache is dropped and a fresh fetch runs. The
  // `cancelled` flag prevents stale responses from racing a newer fetch.
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listComments(tenant, workspace, project, key)
      .then((items) => { if (!cancelled) setComments(items); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenant, workspace, project, key]);

  // Optimistic update helpers used by row-level edit / delete + composer.
  const handleCreated = (c: Comment) => setComments((prev) => [...prev, c]);
  const handleUpdated = (c: Comment) =>
    setComments((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  const handleDeleted = (id: string) =>
    setComments((prev) => prev.filter((x) => x.id !== id));

  const commentItems: FeedItem[] = comments.map((c) => ({
    kind: 'comment' as const, comment: c,
  }));
  const feedItems: FeedItem[] = [...commentItems, ...FIXTURE_EVENTS];

  const counts = {
    all: feedItems.length,
    comments: commentItems.length,
  };
  const filtered = tab === 'comments' ? commentItems : feedItems;

  return (
    <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-muted)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
      }}>
        <span className="label-section">Activity</span>
        <div style={{
          display: 'inline-flex', padding: 2, borderRadius: 6,
          background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
        }}>
          <FeedTabBtn active={tab === 'comments'} onClick={() => setTab('comments')}>
            Comments
            <FeedCount n={counts.comments} active={tab === 'comments'} />
          </FeedTabBtn>
          <FeedTabBtn active={tab === 'all'} onClick={() => setTab('all')}>
            All
            <FeedCount n={counts.all} active={tab === 'all'} />
          </FeedTabBtn>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Newest first</span>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          <SkeletonRow width="80%" height={36} />
          <SkeletonRow width="60%" height={36} />
        </div>
      )}

      {!loading && error && (
        <div style={{
          padding: '12px 14px', marginBottom: 14,
          fontSize: 12.5, color: 'var(--canceled)',
          border: '1px solid var(--canceled-muted, var(--border-muted))',
          borderRadius: 6, background: 'var(--bg-subtle)',
        }}>
          Couldn’t load comments: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          fontSize: 12.5, color: 'var(--fg-muted)',
          border: '1px dashed var(--border-muted)', borderRadius: 6,
        }}>
          No comments yet. Start the conversation below.
        </div>
      )}

      {!loading && !error && filtered.map((item, i) =>
        item.kind === 'comment' ? (
          <CommentRow
            key={item.comment.id}
            comment={item.comment}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ) : (
          <ActivityEvent
            key={`event-${i}`}
            who={item.who}
            when={item.when}
            verb={item.verb}
            from={item.from}
            to={item.to}
            detail={item.detail}
            icon={item.icon}
          />
        )
      )}

      <CommentComposer onCreated={handleCreated} />
    </div>
  );
}

// Single comment row. Renders the resolved author (UUID → display name),
// the relative timestamp, the body via `CommentBody` (so mention tokens
// turn into chips), and inline edit/delete affordances when the viewer
// is the author or a workspace admin (mirrors the BE authorisation rule).
function CommentRow({
  comment, onUpdated, onDeleted,
}: {
  comment: Comment;
  onUpdated: (c: Comment) => void;
  onDeleted: (id: string) => void;
}) {
  const { tenant, workspace } = useTenantContext();
  const { user: currentUser } = useAuth();
  const { getMemberByUserId } = useWorkspaceMembers();

  // Author may not be in the workspace directory (former member, never
  // joined this workspace). `useResolvedUser` falls back to the tenant-
  // scoped fetch so historical content stays readable.
  const author = useResolvedUser(comment.authorUserId);
  const authorName = author?.displayName ?? UNKNOWN_USER_LABEL;
  const isSelf = !!currentUser && comment.authorUserId === currentUser.id;

  // Effective role drives the admin override for delete. The BE will
  // re-check on the wire; this is a UX gate so non-admin viewers don't
  // see actions they can't take.
  const role = currentUser
    ? getMemberByUserId(currentUser.id)?.effectiveRole
    : undefined;
  const isAdmin = role === 'admin';
  const canEdit = isSelf;
  const canDelete = isSelf || isAdmin;

  const when = formatRelative(comment.createdAt);
  const editedWhen = comment.updatedAt ? formatRelative(comment.updatedAt) : undefined;
  const edited = !!comment.updatedAt;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline edit form. Lives entirely inside the row — no portal, no
  // floating panel — so it composes with the existing list layout.
  // The composer hook owns body + attachments; we seed it from the saved
  // comment on `beginEdit` and reset on `cancelEdit`.
  const editComposer = useComposer({ tenantSlug: tenant, workspaceSlug: workspace });
  const [editMentionQuery, setEditMentionQuery] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Original attachment ids + body — used to detect "no-op edit" (skip the
  // PATCH) and to seed the composer when entering edit mode.
  const originalIdsKey = comment.attachmentIds.join('|');

  const beginEdit = () => {
    editComposer.reset({
      value: comment.body,
      existing: comment.attachments,
    });
    setEditError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditMentionQuery(null);
    setEditError(null);
    // Drop the draft state so we don't keep stale uploads referenced.
    editComposer.reset();
  };
  const saveEdit = async () => {
    const draft = editComposer.value;
    if (!draft.trim() || savingEdit) return;
    if (editComposer.hasInflight) return;
    const nextIdsKey = editComposer.attachmentIds.join('|');
    const bodyUnchanged = draft === comment.body;
    const attachmentsUnchanged = nextIdsKey === originalIdsKey;
    if (bodyUnchanged && attachmentsUnchanged) { cancelEdit(); return; }
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateComment(tenant, workspace, comment.id, {
        // Only send what changed so the BE's "at least one field" guard
        // matches the surface the user actually edited.
        ...(bodyUnchanged ? {} : { body: draft }),
        ...(attachmentsUnchanged ? {} : { attachmentIds: editComposer.attachmentIds }),
      });
      onUpdated(updated);
      setEditing(false);
      setEditMentionQuery(null);
      editComposer.reset();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update comment');
    } finally {
      setSavingEdit(false);
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const performDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteComment(tenant, workspace, comment.id);
      onDeleted(comment.id);
      setConfirmDelete(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete comment');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <Avatar name={authorName} size={24} />
      <div style={{
        flex: 1,
        border: `1px solid ${isSelf ? 'var(--accent-muted)' : 'var(--border-muted)'}`,
        borderRadius: 8, overflow: 'hidden',
      }}>
        <div style={{
          padding: '6px 12px',
          background: isSelf ? 'var(--accent-muted)' : 'var(--bg-subtle)',
          borderBottom: `1px solid ${isSelf ? 'var(--accent-muted)' : 'var(--border-muted)'}`,
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
        }}>
          <strong style={{ color: isSelf ? 'var(--accent-active)' : 'var(--fg)' }}>{authorName}</strong>
          {isSelf && (
            <span className="pill" style={{
              background: 'var(--bg)', color: 'var(--accent-active)',
              fontSize: 10, padding: '1px 5px', fontWeight: 600,
              border: '1px solid var(--accent-muted)',
            }}>You</span>
          )}
          <span style={{ color: isSelf ? 'var(--accent-active)' : 'var(--fg-muted)', opacity: isSelf ? 0.75 : 1 }}>· {when}</span>
          {edited && (
            <span
              className="pill"
              data-tip={editedWhen ? `Edited ${editedWhen}` : 'This comment was edited'}
              style={{
                background: 'var(--bg-muted)', color: 'var(--fg-muted)',
                fontSize: 10, padding: '1px 5px', fontWeight: 500,
                fontStyle: 'italic', letterSpacing: 0.1,
              }}
            >edited</span>
          )}
          {(canEdit || canDelete) && !editing && (
            <>
              <div style={{ flex: 1 }} />
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-tip="Edit"
                  onClick={beginEdit}
                  style={{
                    width: 22, height: 22, padding: 0,
                    color: isSelf ? 'var(--accent-active)' : 'var(--fg-muted)',
                    background: 'transparent', borderColor: 'transparent',
                  }}
                >
                  <Icon name="edit" size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-tip="Delete"
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    width: 22, height: 22, padding: 0,
                    color: isSelf ? 'var(--accent-active)' : 'var(--fg-muted)',
                    background: 'transparent', borderColor: 'transparent',
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '10px 12px' }}>
          {editing ? (
            <div style={{ position: 'relative' }}>
              {editMentionQuery !== null && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100 }}>
                  <MentionPicker
                    query={editMentionQuery}
                    onSelect={(hit: MentionableHit) => {
                      const ta = editComposer.textareaRef.current;
                      const draftValue = editComposer.value;
                      const cursor = ta?.selectionStart ?? draftValue.length;
                      const before = draftValue.slice(0, cursor);
                      const after = draftValue.slice(cursor);
                      const replaced = before.replace(/@([^\s@]*)$/, `@[${hit.type}:${hit.id}]`);
                      editComposer.setValue(replaced + after);
                      setEditMentionQuery(null);
                      ta?.focus();
                    }}
                    onDismiss={() => setEditMentionQuery(null)}
                  />
                </div>
              )}
              <div
                onDragOver={editComposer.handleDragOver}
                onDragLeave={editComposer.handleDragLeave}
                onDrop={editComposer.handleDrop}
                style={{
                  border: `1px solid ${editComposer.dragOver ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  background: 'var(--bg)',
                  boxShadow: editComposer.dragOver ? '0 0 0 3px var(--accent-muted)' : 'none',
                }}
              >
                <textarea
                  ref={editComposer.textareaRef}
                  value={editComposer.value}
                  onChange={(e) => {
                    editComposer.setValue(e.target.value);
                    const cursor = e.target.selectionStart ?? e.target.value.length;
                    const before = e.target.value.slice(0, cursor);
                    const m = before.match(/@([^\s@]*)$/);
                    setEditMentionQuery(m ? m[1] : null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void saveEdit();
                    }
                  }}
                  onPaste={editComposer.handlePaste}
                  rows={3}
                  autoFocus
                  style={{
                    width: '100%', display: 'block',
                    border: 'none', outline: 'none', resize: 'vertical',
                    padding: '8px 10px', minHeight: 60,
                    fontSize: 13, color: 'var(--fg)', background: 'transparent',
                    fontFamily: 'var(--font-sans)', lineHeight: 1.55,
                    boxSizing: 'border-box',
                  }}
                />
                <AttachmentRow
                  attachments={editComposer.attachments}
                  onRemove={editComposer.removeAttachment}
                  onRetry={editComposer.retry}
                />
                <div style={{
                  padding: '4px 6px', borderTop: '1px solid var(--border-muted)',
                  display: 'flex', alignItems: 'center', gap: 2,
                }}>
                  <button
                    type="button"
                    onClick={editComposer.openFilePicker}
                    className="btn btn-ghost btn-sm"
                    style={{ width: 24, padding: 0 }}
                    data-tip="Attach file"
                  >
                    <Icon name="paperclip" size={12} />
                  </button>
                  <input
                    ref={editComposer.fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={editComposer.handleFileChange}
                  />
                  {editComposer.hasInflight && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
                      Uploading…
                    </span>
                  )}
                </div>
              </div>
              {editError && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--canceled)' }}>
                  {editError}
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={cancelEdit}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={saveEdit}
                  disabled={
                    savingEdit
                    || !editComposer.value.trim()
                    || editComposer.hasInflight
                    || (editComposer.value === comment.body
                      && editComposer.attachmentIds.join('|') === originalIdsKey)
                  }
                  data-tip={editComposer.hasInflight ? 'Wait for uploads to finish' : undefined}
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
              <CommentBody body={comment.body} />
              {comment.attachments.length > 0 && (
                <RenderedAttachmentRow
                  attachments={comment.attachments as RenderAttachment[]}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <Modal
          onClose={() => { if (!deleting) { setConfirmDelete(false); setDeleteError(null); } }}
          maxWidth={400}
          label="Delete comment"
        >
          <ModalHeader title="Delete comment?" onClose={() => { if (!deleting) { setConfirmDelete(false); setDeleteError(null); } }} />
          <ModalBody>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
              This comment will be permanently removed. You can’t undo this.
            </p>
            {deleteError && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--canceled)' }}>
                {deleteError}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={performDelete}
              disabled={deleting}
              style={{ background: 'var(--canceled)', color: 'var(--bg)', borderColor: 'var(--canceled)' }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

function CommentComposer({ onCreated }: { onCreated: (c: Comment) => void }) {
  const { tenant, workspace, project } = useTenantContext();
  const c = useComposer({ tenantSlug: tenant, workspaceSlug: workspace });
  const { key } = useParams<{ key: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  // Submit is gated on `hasInflight` so the BE never sees an attachmentIds
  // list missing one of the user's still-uploading files. Failed uploads
  // are visible inline; the user can retry or remove before sending.
  const handleSubmit = async () => {
    if (!c.value.trim() || submitting || !key) return;
    if (c.hasInflight) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const comment = await createComment(tenant, workspace, project, key, {
        body: c.value,
        attachmentIds: c.attachmentIds.length ? c.attachmentIds : undefined,
      });
      onCreated(comment);
      c.setValue('');
      // Drop the attachments — fresh composer for the next comment.
      for (const a of c.attachments) c.removeAttachment(a.localId);
      setMentionQuery(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'relative', marginTop: 16 }}>
      {mentionQuery !== null && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 100 }}>
          <MentionPicker
            query={mentionQuery}
            onSelect={(hit: MentionableHit) => {
              const cursor = c.textareaRef.current?.selectionStart ?? c.value.length;
              const before = c.value.slice(0, cursor);
              const after = c.value.slice(cursor);
              const replaced = before.replace(/@([^\s@]*)$/, `@[${hit.type}:${hit.id}]`);
              c.setValue(replaced + after);
              setMentionQuery(null);
              c.textareaRef.current?.focus();
            }}
            onDismiss={() => setMentionQuery(null)}
          />
        </div>
      )}
      <div
        onDragOver={c.handleDragOver}
        onDragLeave={c.handleDragLeave}
        onDrop={c.handleDrop}
        style={{
          border: `1px solid ${c.dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8,
          background: 'var(--bg)',
          boxShadow: c.dragOver ? '0 0 0 3px var(--accent-muted)' : 'none',
          transition: 'border-color .12s, box-shadow .12s',
        }}
      >
        <textarea
          ref={c.textareaRef}
          value={c.value}
          onChange={(e) => {
            c.setValue(e.target.value);
            const cursor = e.target.selectionStart ?? e.target.value.length;
            const before = e.target.value.slice(0, cursor);
            const m = before.match(/@([^\s@]*)$/);
            setMentionQuery(m ? m[1] : null);
          }}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits; Shift+Enter is the textarea default
            // (newline). The picker swallows its own keys via useDismiss.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          onPaste={c.handlePaste}
          placeholder="Leave a comment… paste or drop an image, or use the code button to add a snippet"
          rows={3}
          style={{
            width: '100%', display: 'block',
            border: 'none', outline: 'none', resize: 'vertical',
            padding: '10px 12px', minHeight: 60,
            fontSize: 13, color: 'var(--fg)', background: 'transparent',
            fontFamily: 'var(--font-sans)', lineHeight: 1.55,
            boxSizing: 'border-box',
          }}
        />
        <AttachmentRow
          attachments={c.attachments}
          onRemove={c.removeAttachment}
          onRetry={c.retry}
        />
        <div style={{
          padding: '6px 8px', borderTop: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Bold"><Icon name="bold" size={13} /></button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Italic"><Icon name="italic" size={13} /></button>
          <button type="button" onClick={c.insertCodeBlock} className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Code block"><Icon name="code" size={13} /></button>
          <button type="button" onClick={c.openFilePicker} className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Attach file"><Icon name="paperclip" size={13} /></button>
          <input
            ref={c.fileInputRef}
            type="file"
            multiple
            hidden
            onChange={c.handleFileChange}
          />
          <div style={{ flex: 1 }} />
          {c.hasInflight && (
            <span style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginRight: 8 }}>
              Uploading…
            </span>
          )}
          {submitError && (
            <span style={{ fontSize: 12, color: 'var(--canceled)', marginRight: 8 }}>
              {submitError}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleSubmit}
            disabled={submitting || !c.value.trim() || c.hasInflight}
            data-tip={c.hasInflight ? 'Wait for uploads to finish' : undefined}
          >
            {submitting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 4,
        background: active ? 'var(--bg)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        fontWeight: active ? 600 : 500, fontSize: 12,
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        transition: 'background .12s, color .12s',
      }}
    >
      {children}
    </button>
  );
}

function FeedCount({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className="tnum"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
        fontSize: 10, fontWeight: 600,
        background: active ? 'var(--accent-muted)' : 'var(--bg-muted)',
        color: active ? 'var(--accent-active)' : 'var(--fg-muted)',
      }}
    >{n}</span>
  );
}

interface ActivityEventProps {
  who: string;
  when: string;
  verb: string;
  from?: string;
  to?: string;
  detail?: ReactNode;
  icon?: string;
  iconColor?: string;
}
function ActivityEvent({ who, when, verb, from, to, detail, icon, iconColor }: ActivityEventProps) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', paddingLeft: 7 }}>
      <div style={{
        width: 18, height: 18, borderRadius: 9, background: 'var(--bg-muted)',
        color: iconColor || 'var(--fg-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon || 'rotate'} size={11} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', flex: 1 }}>
        <strong style={{ color: 'var(--fg)' }}>{who}</strong> {verb}{' '}
        {from && to && (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status={from === 'In Progress' ? 'in-progress' : 'todo'} size={9} />{from}
            </span> to{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status={to === 'In Review' ? 'in-review' : 'done'} size={9} />{to}
            </span>
          </>
        )}
        {detail}
        <span style={{ marginLeft: 8, color: 'var(--fg-faint)' }}>· {when}</span>
      </div>
    </div>
  );
}

export { IssueDetail };
