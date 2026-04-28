import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, TypeChip, IssueId, StatusDot, Priority, Avatar, STATUSES, useTenantContext, useTenantBreadcrumbs } from '../components/shell';
import { AttachmentRow, renderRichText, useComposer, type Attachment } from '../components/composer';
import { IssuePickerModal } from '../components/issue-picker';
import { useDismiss } from '../components/use-dismiss';
import { CURRENT_USER, ISSUES, issueById, themeById, type Issue } from '../fixtures';
import { useProjects } from '../state/projects';

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
  const projectInfo = getProject(project);
  const issue = key ? ISSUES.find((i) => i.id === key) : undefined;

  if (!issue) {
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
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Issue not found</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '6px 0 14px' }}>
              <span className="mono">{key}</span> doesn’t exist in this project. It may have been deleted, or the link is wrong.
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
  const { getProject } = useProjects();
  // Inner detail: drive everything off the issue's owning project rather than
  // the URL slug, so the breadcrumb is right even when this is rendered inside
  // the design-canvas with a default issue.
  const owningProject = getProject(issue.project) ?? getProject(project);
  // Reporter isn't on the fixture model — surface the current user as a
  // mock so the profile link goes somewhere real.
  const reporter = CURRENT_USER.name;
  const reporterEmail = CURRENT_USER.email;
  const blocked = issue.status === 'in-review';

  const [inspectorWidth, setInspectorWidth] = useState<number>(loadInspectorWidth);
  useEffect(() => {
    try { localStorage.setItem(INSPECTOR_KEY, String(inspectorWidth)); } catch { /* ignore */ }
  }, [inspectorWidth]);

  // Session-only relations the user adds via the inspector buttons. Refresh
  // (or navigating to another issue) clears them — there's no issues
  // provider with mutation today, and the prototype's other interactions
  // (board reorders, comment composer) behave the same way.
  const navigate = useNavigate();
  const [addedChildren, setAddedChildren] = useState<string[]>([]);
  const [addedRelated, setAddedRelated] = useState<string[]>([]);
  // undefined = no override, fall through to issue.parent;
  // string     = user picked a new parent;
  // null       = user explicitly cleared the parent.
  const [parentOverride, setParentOverride] = useState<string | null | undefined>(undefined);
  // Picker mode is null when closed; set to 'child', 'related', or 'parent'.
  const [pickerMode, setPickerMode] = useState<null | 'child' | 'related' | 'parent'>(null);

  // Reset session additions when navigating to a different issue.
  useEffect(() => {
    setAddedChildren([]);
    setAddedRelated([]);
    setParentOverride(undefined);
    setPickerMode(null);
  }, [issue.id]);

  const allChildren = [...(issue.children ?? []), ...addedChildren];
  const allRelated = [...(issue.relatedTo ?? []), ...addedRelated];
  const effectiveParent = parentOverride === undefined ? (issue.parent ?? null) : parentOverride;

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
    navigate(`/${tenant}/${workspace}/${project}/issue/new?parent=${issue.id}`);
  };
  const openChildPicker = () => setPickerMode('child');
  const openRelatedPicker = () => setPickerMode('related');
  const openParentPicker = () => setPickerMode('parent');
  const clearParent = () => setParentOverride(null);

  const handlePickerSelect = (target: Issue) => {
    if (pickerMode === 'child') setAddedChildren((prev) => [...prev, target.id]);
    else if (pickerMode === 'related') setAddedRelated((prev) => [...prev, target.id]);
    else if (pickerMode === 'parent') setParentOverride(target.id);
    setPickerMode(null);
  };

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
        issue.id,
      ]} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 760, padding: '24px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TypeChip type={issue.type} />
              <IssueId id={issue.id} />
              <CopyLinkButton
                url={`${window.location.origin}/${tenant}/${workspace}/${issue.project}/issue/${issue.id}`}
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
                    detail={<>You are signed in as <strong>{issue.assignee}</strong> (member). Required role: <strong>admin</strong>.</>}
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
              `key={issue.id}` resets the editor when navigating between issues.
            */}
            <EditableDescription key={issue.id} initial={issue.description ?? ''} />

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
              onCreateChild={goCreateChild}
              onLinkChild={openChildPicker}
              onLinkRelated={openRelatedPicker}
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
          <Meta label="Status">
            <button className="btn btn-sm" style={{
              width: '100%', justifyContent: 'flex-start',
              background: `var(--${issue.status}-bg)`,
              borderColor: `var(--${issue.status})`,
              color: `var(--${issue.status})`,
            }}>
              <StatusDot status={issue.status} size={11} /> {STATUS_LABEL[issue.status]}
              <Icon name="chevronDown" size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {/* Mini transition picker preview */}
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
          <Meta label="Assignee">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={issue.assignee} size={20} /><span>{issue.assignee}</span>
            </span>
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
              {owningProject?.name ?? issue.project}
            </span>
          </Meta>
          {/* Drift fix: removed Sprint and Estimate metas (sprint/velocity out of v1 scope). */}
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
          <Meta label="Start date">
            {issue.startDate
              ? <DateValue iso={issue.startDate} />
              : <NotSet />}
          </Meta>
          <Meta label="Due date">
            {issue.endDate
              ? <DateValue iso={issue.endDate} />
              : <NotSet />}
          </Meta>
          {/* Hierarchy. Epics have no parent (so the Parent Meta is hidden);
              leaves (Task / Bug) cannot have children (so the Children Meta
              is hidden). For others, an empty state explains the gap. */}
          {issue.type !== 'E' && (
            <Meta
              label="Parent"
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
                </span>
              ) : (
                <NotSet />
              )}
            </Meta>
          )}
          {(issue.type === 'E' || issue.type === 'S') && (
            <Meta
              label="Children"
              extras={<AddChildMenu onCreate={goCreateChild} onLink={openChildPicker} variant="compact" />}
            >
              <IssueList ids={allChildren} emptyText="No children yet" />
            </Meta>
          )}
          <Meta
            label="Related"
            extras={
              <button
                type="button"
                onClick={openRelatedPicker}
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 6px', height: 20, fontSize: 11 }}
                aria-label="Link an issue"
              >
                <Icon name="link" size={11} /> Link
              </button>
            }
          >
            <IssueList ids={allRelated} emptyText="No related issues" />
          </Meta>
          <Meta label="Themes">
            {issue.themes && issue.themes.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {issue.themes.map((id) => <ThemeChip key={id} id={id} />)}
              </div>
            ) : (
              <NotSet />
            )}
          </Meta>
          </div>
        </aside>
      </div>
      {pickerMode && (
        <IssuePickerModal
          title={
            pickerMode === 'child' ? 'Link child issue'
              : pickerMode === 'related' ? 'Link related issue'
                : 'Set parent issue'
          }
          subtitle={
            pickerMode === 'child'
              ? `Pick an issue to link as a child of ${issue.id}. ${
                  issue.type === 'E' ? 'Stories, Tasks, and Bugs are valid.' : 'Only Tasks and Bugs are valid children of a Story.'
                }`
              : pickerMode === 'related'
                ? 'Pick any issue to mark as related. Relates is symmetric.'
                : `Pick the parent of ${issue.id}. ${
                    issue.type === 'S' ? 'Only Epics are valid parents of a Story.' : 'Epics and Stories are valid parents of a Task or Bug.'
                  }`
          }
          excludeIds={[
            issue.id,
            ...allChildren,
            ...allRelated,
            ...(effectiveParent ? [effectiveParent] : []),
          ]}
          filter={
            pickerMode === 'child'
              ? (i) => allowedChildTypes.includes(i.type)
              : pickerMode === 'parent'
                ? (i) => allowedParentTypes.includes(i.type)
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
}
function TransOption({ status, label, trigger, blocked, reason }: TransOptionProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      cursor: blocked ? 'not-allowed' : 'pointer',
      opacity: blocked ? 0.6 : 1,
      borderTop: '1px solid var(--border-muted)',
    }}>
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
    </div>
  );
}

function Meta({ label, extras, children }: { label: string; extras?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 18, marginBottom: 6 }}>
        <div className="label-section">{label}</div>
        {extras && <><div style={{ flex: 1 }} />{extras}</>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg)' }}>{children}</div>
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
 * not write back to the fixture. The parent passes `key={issue.id}` so
 * navigating to a different issue resets the editor cleanly.
 */
function EditableDescription({ initial }: { initial: string }) {
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
        <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.65 }}>
          {renderRichText(value)}
        </div>
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
 * A single issue rendered as a Link with type chip + id + title. Falls back
 * to plain text if the referenced issue isn't in the fixture (would only
 * happen if a relation went stale).
 */
function IssueLink({ id }: { id: string }) {
  const { tenant, workspace } = useTenantContext();
  const target = issueById(id);
  if (!target) {
    return <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{id}</span>;
  }
  return (
    <Link
      to={`/${tenant}/${workspace}/${target.project}/issue/${target.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
        color: 'var(--fg)', fontSize: 12, textDecoration: 'none',
      }}
    >
      <TypeChip type={target.type} />
      <span className="mono" style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{target.id}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {target.title}
      </span>
    </Link>
  );
}

function IssueList({ ids, emptyText }: { ids: string[]; emptyText: string }) {
  if (ids.length === 0) {
    return <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{emptyText}</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ids.map((id) => <IssueLink key={id} id={id} />)}
    </div>
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
  onCreateChild,
  onLinkChild,
  onLinkRelated,
}: {
  issue: Issue;
  childIds: string[];
  relatedIds: string[];
  onCreateChild: () => void;
  onLinkChild: () => void;
  onLinkRelated: () => void;
}) {
  const showChildren = issue.type === 'E' || issue.type === 'S';
  const childEmpty = issue.type === 'E'
    ? 'No child issues yet. Break this epic down into stories, tasks, or bugs.'
    : 'No child issues yet. Add the tasks or bugs that make up this story.';
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
      <LinkedSection
        label="Related issues"
        count={relatedIds.length}
        ids={relatedIds}
        emptyText="No related issues linked yet."
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
}: {
  label: string;
  count: number;
  ids: string[];
  emptyText: string;
  action: ReactNode;
}) {
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
      {ids.length === 0 ? (
        <div style={{
          padding: '14px 12px', textAlign: 'center',
          fontSize: 12.5, color: 'var(--fg-muted)',
          border: '1px dashed var(--border-muted)', borderRadius: 6,
        }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ids.map((id) => <LinkedIssueCard key={id} id={id} />)}
        </div>
      )}
    </div>
  );
}

function LinkedIssueCard({ id }: { id: string }) {
  const { tenant, workspace } = useTenantContext();
  const target = issueById(id);
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
  return (
    <Link
      to={`/${tenant}/${workspace}/${target.project}/issue/${target.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
        padding: '8px 10px',
        border: '1px solid var(--border-muted)', borderRadius: 6,
        background: 'var(--bg)',
        color: 'var(--fg)', textDecoration: 'none',
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
      <StatusDot status={target.status} size={10} />
      <TypeChip type={target.type} />
      <span className="mono" style={{ color: 'var(--fg-muted)', flexShrink: 0, fontSize: 12 }}>{target.id}</span>
      <span style={{
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: 13,
      }}>{target.title}</span>
      <Avatar name={target.assignee} size={20} />
    </Link>
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

function ThemeChip({ id }: { id: string }) {
  const t = themeById(id);
  if (!t) {
    return <span className="pill" style={{ background: 'var(--bg-muted)', color: 'var(--fg-muted)' }}>{id}</span>;
  }
  return (
    <span
      className="pill"
      data-tip={t.description}
      style={{ background: t.bg, color: t.color, fontWeight: 600 }}
    >
      {t.name}
    </span>
  );
}

// --- Activity feed with All / Comments tab filter (JIRA-style) ---

type FeedItem =
  | { kind: 'comment'; who: string; when: string; body: ReactNode; edited?: boolean; editedWhen?: string }
  | { kind: 'event'; who: string; when: string; verb: string; from?: string; to?: string; detail?: ReactNode; icon?: string };

// Tiny inline SVG used as a demo screenshot in the seeded comment, so the
// attached-image affordance is visible without uploading anything.
const DEMO_SCREENSHOT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200">
      <rect width="360" height="200" fill="#0f172a"/>
      <rect x="0" y="0" width="360" height="22" fill="#1e293b"/>
      <circle cx="12" cy="11" r="3.5" fill="#64748b"/>
      <circle cx="24" cy="11" r="3.5" fill="#64748b"/>
      <circle cx="36" cy="11" r="3.5" fill="#64748b"/>
      <rect x="60" y="6" width="120" height="11" rx="2" fill="#334155"/>
      <rect x="20" y="40" width="90" height="10" rx="2" fill="#a78bfa"/>
      <rect x="20" y="58" width="220" height="6" rx="2" fill="#cbd5e1"/>
      <rect x="20" y="70" width="180" height="6" rx="2" fill="#94a3b8"/>
      <rect x="20" y="82" width="140" height="6" rx="2" fill="#94a3b8"/>
      <rect x="20" y="106" width="60" height="10" rx="2" fill="#fbbf24"/>
      <rect x="20" y="124" width="200" height="6" rx="2" fill="#cbd5e1"/>
      <rect x="20" y="136" width="160" height="6" rx="2" fill="#94a3b8"/>
      <rect x="20" y="148" width="240" height="6" rx="2" fill="#94a3b8"/>
      <rect x="20" y="170" width="80" height="14" rx="3" fill="#6366f1"/>
    </svg>`,
  );

const DEMO_ATTACHMENTS: Attachment[] = [
  { id: 'demo-att-1', name: 'workflow-filter-bug.png', dataUrl: DEMO_SCREENSHOT, size: 0 },
];

const FEED_ITEMS: FeedItem[] = [
  {
    kind: 'comment', who: 'Maya Chen', when: '2h ago',
    edited: true, editedWhen: '1h ago',
    body: (
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
        Pushed a fix that gates persistence on the unfiltered set. Want a second pair of eyes on the
        migration path for existing dirty state.
        {renderRichText(`\nThe write-through path now looks like:\n\n\`\`\`ts\nconst persist = debounce((view) => {\n  // Drift fix: reorder over the *full* set, not the filtered subset.\n  const next = mergeOrder(allNodes, view.visibleOrder);\n  storage.set('workflow:order', next);\n}, 250);\n\`\`\``)}
        <AttachmentRow attachments={DEMO_ATTACHMENTS} bordered={false} />
      </div>
    ),
  },
  {
    kind: 'comment', who: CURRENT_USER.name, when: '2h ago',
    body: (
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
        Looks right. I'll take another pass on the migration once the staging deploy lands —
        if any in-flight workflows still have orphaned slot orders we should null them out
        rather than reconstruct.
      </div>
    ),
  },
  { kind: 'event', who: 'Jordan Lee', when: '3h ago', verb: 'moved this from', from: 'In Progress', to: 'In Review' },
  {
    kind: 'event', who: 'Sam Park', when: 'yesterday', verb: 'added the label', icon: 'tag',
    detail: <span className="pill" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: 4 }}>regression</span>,
  },
  {
    kind: 'comment', who: 'Sam Park', when: 'yesterday',
    body: (
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
        Confirmed repro on staging. Marking as urgent — this drops nodes silently which is hard for users to notice.
      </div>
    ),
  },
];

type FeedTab = 'all' | 'comments';

function ActivityFeed() {
  const [tab, setTab] = useState<FeedTab>('comments');
  const counts = {
    all: FEED_ITEMS.length,
    comments: FEED_ITEMS.filter((i) => i.kind === 'comment').length,
  };
  const filtered = tab === 'comments' ? FEED_ITEMS.filter((i) => i.kind === 'comment') : FEED_ITEMS;

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

      {filtered.length === 0 && (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          fontSize: 12.5, color: 'var(--fg-muted)',
          border: '1px dashed var(--border-muted)', borderRadius: 6,
        }}>
          No comments yet. Start the conversation below.
        </div>
      )}

      {filtered.map((item, i) =>
        item.kind === 'comment' ? (
          <Activity
            key={i}
            who={item.who}
            when={item.when}
            edited={item.edited}
            editedWhen={item.editedWhen}
          >{item.body}</Activity>
        ) : (
          <ActivityEvent
            key={i}
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

      <CommentComposer />
    </div>
  );
}

function CommentComposer() {
  const c = useComposer();
  return (
    <div
      onDragOver={c.handleDragOver}
      onDragLeave={c.handleDragLeave}
      onDrop={c.handleDrop}
      style={{
        marginTop: 16,
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
        onChange={(e) => c.setValue(e.target.value)}
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
      <AttachmentRow attachments={c.attachments} onRemove={c.removeAttachment} />
      <div style={{
        padding: '6px 8px', borderTop: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Bold"><Icon name="bold" size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Italic"><Icon name="italic" size={13} /></button>
        <button type="button" onClick={c.insertCodeBlock} className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Code block"><Icon name="code" size={13} /></button>
        <button type="button" onClick={c.openFilePicker} className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} data-tip="Attach image"><Icon name="paperclip" size={13} /></button>
        <input
          ref={c.fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={c.handleFileChange}
        />
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm">Comment</button>
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

function Activity({
  who, when, edited, editedWhen, children,
}: {
  who: string;
  when: string;
  edited?: boolean;
  editedWhen?: string;
  children: ReactNode;
}) {
  const isSelf = who === CURRENT_USER.name;
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <Avatar name={who} size={24} />
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
          <strong style={{ color: isSelf ? 'var(--accent-active)' : 'var(--fg)' }}>{who}</strong>
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
          {isSelf && (
            <>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" data-tip="Edit" style={{
                width: 22, height: 22, padding: 0, color: 'var(--accent-active)',
                background: 'transparent', borderColor: 'transparent',
              }}>
                <Icon name="edit" size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" data-tip="Delete" style={{
                width: 22, height: 22, padding: 0, color: 'var(--accent-active)',
                background: 'transparent', borderColor: 'transparent',
              }}>
                <Icon name="trash" size={12} />
              </button>
            </>
          )}
        </div>
        <div style={{ padding: '10px 12px' }}>{children}</div>
      </div>
    </div>
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
