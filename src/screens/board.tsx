import { useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import {
  TopBar, Tabs, Toolbar, Chip,
  StatusDot, TypeChip, Priority, Avatar, IssueId, STATUSES,
  projectTabs, useWorkspaceContext,
} from '../components/shell';
import { AvatarStack } from './teams';
import { ISSUES, projectEffectiveMembers, type Issue, type ProjectSlug, PROJECT_INFO } from '../fixtures';

export function BoardPage() {
  return <BoardView />;
}

interface BoardViewProps {
  /** Initial selection (used by the design-canvas reference). */
  selectedCount?: number;
  showBulkBar?: boolean;
}

const DEMO_SELECTED = ['CMT-241', 'CMT-238', 'CMT-237', 'CMT-235', 'CMT-234'];

export function BoardView({ selectedCount, showBulkBar = true }: BoardViewProps) {
  const { workspace, project } = useWorkspaceContext();
  const projectSlug = (project as ProjectSlug) in PROJECT_INFO ? (project as ProjectSlug) : 'comet';
  const members = projectEffectiveMembers(projectSlug);
  const initial = selectedCount != null
    ? new Set(DEMO_SELECTED.slice(0, selectedCount))
    : new Set<string>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initial);

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  // Scope the board to issues that belong to the current project (fixtures
  // now include Orbit and Atlas issues too).
  const projectIssues = ISSUES.filter((i) => i.project === project);
  const byStatus = (s: string) => projectIssues.filter((i) => i.status === s);
  const cols = [
    { id: 'todo', name: 'Todo', count: byStatus('todo').length },
    { id: 'in-progress', name: 'In Progress', count: byStatus('in-progress').length },
    { id: 'in-review', name: 'In Review', count: byStatus('in-review').length },
    { id: 'done', name: 'Done', count: byStatus('done').length },
  ];

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: 'Comet', to: `/${workspace}/${project}` },
        'Board',
      ]} />
      <Tabs active="board" tabs={projectTabs(workspace, project)} />
      {/* Drift fix: removed "Sprint 23" filter chip (sprints out of scope for v1). */}
      <Toolbar
        right={
          <>
            <Link
              to={`/${workspace}/${project}/members`}
              data-tip={`${members.length} members · click to manage`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0 8px 0 4px', height: 24, borderRadius: 5,
                border: '1px solid var(--border)', background: 'var(--bg)',
                textDecoration: 'none', color: 'var(--fg)',
              }}
            >
              <AvatarStack members={members} max={4} size={18} />
              <span className="tnum" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                {members.length}
              </span>
            </Link>
            <button type="button" className="btn btn-sm"><Icon name="filter" size={13} />Filter</button>
            <button type="button" className="btn btn-sm"><Icon name="layers" size={13} />Group: Status</button>
            <Link
              to={`/${workspace}/${project}/settings`}
              className="btn btn-sm"
              data-tip="Project & board settings"
              style={{ textDecoration: 'none' }}
            >
              <Icon name="settings" size={13} />
            </Link>
          </>
        }
      >
        <Chip dim><Icon name="user" size={11} color="var(--fg-faint)" />Assignee: anyone</Chip>
        <Chip dim><Icon name="tag" size={11} color="var(--fg-faint)" />Label: any</Chip>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--fg-faint)' }}>
          <Icon name="plus" size={12} />Add filter
        </button>
      </Toolbar>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="scroll" style={{
          flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex',
          gap: 10, padding: '12px 12px 60px', background: 'var(--bg-subtle)',
        }}>
          {cols.map((col) => (
            <div key={col.id} style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 8px' }}>
                <StatusDot status={col.id} size={11} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{col.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }} className="tnum">{col.count}</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" style={{ width: 22, padding: 0 }}>
                  <Icon name="plus" size={12} />
                </button>
                <button className="btn btn-ghost btn-sm" style={{ width: 22, padding: 0 }}>
                  <Icon name="moreV" size={12} />
                </button>
              </div>
              <div className="scroll" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byStatus(col.id).map((i) => (
                  <BoardCard
                    key={i.id}
                    issue={i}
                    workspace={workspace}
                    project={project}
                    selected={selectedIds.has(i.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {col.id === 'todo' && (
                  <Link
                    to={`/${workspace}/${project}/issue/new`}
                    style={{
                      height: 30, border: '1.5px dashed var(--border)', borderRadius: 6,
                      background: 'transparent', color: 'var(--fg-faint)', fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                    }}
                  >+ New issue</Link>
                )}
                {col.id !== 'todo' && byStatus(col.id).length === 0 && (
                  <div style={{
                    padding: '16px 8px', textAlign: 'center',
                    fontSize: 11.5, color: 'var(--fg-faint)',
                    border: '1px dashed var(--border-muted)', borderRadius: 6,
                  }}>
                    No issues here yet.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {showBulkBar && selectedIds.size > 0 && <BulkBar selectedCount={selectedIds.size} onClear={clearSelection} />}
      </div>
    </div>
  );
}

function BulkBar({ selectedCount, onClear }: { selectedCount: number; onClear?: () => void }) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--fg)', color: 'var(--fg-inverse)', borderRadius: 10,
      padding: '6px 6px 6px 14px', display: 'flex', alignItems: 'center', gap: 4,
      boxShadow: '0 12px 32px rgba(15,23,42,.18), 0 4px 12px rgba(15,23,42,.12)',
      fontSize: 13,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        paddingRight: 12, marginRight: 4, borderRight: '1px solid rgba(255,255,255,.15)',
      }}>
        <span className="tnum" style={{
          width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
        }}>{selectedCount}</span>
        <span style={{ fontWeight: 500 }}>selected</span>
        <button
          onClick={onClear}
          style={{
            background: 'transparent', border: 'none', color: 'rgba(255,255,255,.6)',
            fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
          }}
        >(deselect)</button>
      </span>
      {/* Drift fix: removed "Sprint" bulk action (sprints out of scope for v1). */}
      <BulkBtn icon="rotate" label="Status" tone="primary" />
      <BulkBtn icon="user" label="Assignee" />
      <BulkBtn icon="flag" label="Priority" />
      <BulkBtn icon="tag" label="Labels" />
      <span style={{ width: 1, alignSelf: 'stretch', margin: '0 4px', background: 'rgba(255,255,255,.15)' }} />
      <BulkBtn icon="archive" label="Archive" />
      <BulkBtn icon="trash" label="" tone="danger" tooltip="Delete" />
      <span style={{ width: 1, alignSelf: 'stretch', margin: '0 4px', background: 'rgba(255,255,255,.15)' }} />
      <button
        onClick={onClear}
        data-tip="Clear selection"
        style={{
          background: 'transparent', border: 'none', color: '#fff',
          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

interface BulkBtnProps {
  icon: string;
  label: string;
  tone?: 'primary' | 'danger';
  tooltip?: string;
}
export function BulkBtn({ icon, label, tone, tooltip }: BulkBtnProps) {
  return (
    <button
      data-tip={tooltip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
        borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
        background: tone === 'primary' ? 'var(--accent)' : 'transparent',
        color: tone === 'danger' ? '#fca5a5' : '#fff',
        transition: 'background .12s',
      }}
    >
      <Icon name={icon} size={13} />
      {label && <span>{label}</span>}
      {label && <Icon name="chevronDown" size={11} style={{ opacity: tone === 'primary' ? 0.8 : 0.6 }} />}
    </button>
  );
}

interface BoardCardProps {
  issue: Issue;
  workspace?: string;
  project?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}
export function BoardCard({ issue, workspace, project, selected, onToggleSelect }: BoardCardProps) {
  const stopAndToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(issue.id);
  };
  const linkable = workspace && project;
  const Wrapper: React.ElementType = linkable ? Link : 'div';
  const wrapperProps = linkable
    ? { to: `/${workspace}/${project}/issue/${issue.id}`, style: { textDecoration: 'none', color: 'inherit' } }
    : {};
  return (
    <Wrapper
      {...wrapperProps as object}
      className="card"
      style={{
        padding: 10, position: 'relative', cursor: 'pointer',
        border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border-muted)',
        boxShadow: selected ? '0 0 0 3px rgba(79,70,229,.12)' : 'var(--shadow-sm)',
        background: 'var(--bg)',
        display: 'block', textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <input
          type="checkbox"
          className="cb"
          checked={!!selected}
          onChange={() => onToggleSelect?.(issue.id)}
          onClick={stopAndToggle}
          readOnly={!onToggleSelect}
          style={{ marginLeft: -2 }}
        />
        <TypeChip type={issue.type} />
        <IssueId id={issue.id} />
        <div style={{ flex: 1 }} />
        <Priority p={issue.priority} />
      </div>
      <div style={{
        fontSize: 13, fontWeight: 500, color: 'var(--fg)', lineHeight: 1.4,
        marginBottom: 8, textWrap: 'pretty',
      }}>{issue.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {issue.labels.slice(0, 2).map((l) => (
          <span key={l} style={{
            display: 'inline-block', padding: '1px 6px', borderRadius: 3,
            background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 11,
          }}>{l}</span>
        ))}
        <div style={{ flex: 1 }} />
        {issue.estimate != null && (
          <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{issue.estimate}</span>
        )}
        <Avatar name={issue.assignee} size={18} />
      </div>
    </Wrapper>
  );
}

// --- "Bulk bar with status menu open" — preserved for the design-canvas reference. ---

export function BoardBulkExpanded() {
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        { label: 'Comet', to: '/acme/comet' },
        'Board',
      ]} />
      <Tabs
        active="board"
        tabs={[
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'issues', label: 'Issues', icon: 'list', count: 489 },
          { id: 'workflow', label: 'Workflow', icon: 'workflow' },
        ]}
      />

      <div style={{ flex: 1, position: 'relative', background: 'var(--bg-subtle)', display: 'flex', flexDirection: 'column' }}>
        {/* Faded board behind to show context */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none',
          display: 'flex', gap: 10, padding: '12px',
        }}>
          {STATUSES.slice(1, 5).map((s) => (
            <div key={s.id} style={{ width: 220, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px 8px', fontSize: 12 }}>
                <StatusDot status={s.id} size={10} />
                <span style={{ fontWeight: 600 }}>{s.name}</span>
              </div>
              {ISSUES.filter((i) => i.status === s.id).slice(0, 3).map((i) => (
                <div key={i.id} className="card" style={{ padding: 8, marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <TypeChip type={i.type} />
                    <span className="mono" style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{i.id}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg)' }}>{i.title.slice(0, 60)}…</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Bulk bar with status menu open */}
        <div style={{ position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: 'var(--shadow-lg)', minWidth: 280, padding: 4,
            color: 'var(--fg)', fontSize: 13,
          }}>
            <div style={{
              padding: '6px 10px 8px', fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              Move 7 issues to…
            </div>
            <MenuItem icon={<StatusDot status="todo" size={11} />} label="Todo" />
            <MenuItem icon={<StatusDot status="in-progress" size={11} />} label="In Progress" />
            <MenuItem icon={<StatusDot status="in-review" size={11} />} label="In Review" trigger="open PR" hover />
            <MenuItem
              icon={<StatusDot status="done" size={11} />}
              label="Done"
              trigger="approve"
              warn={<span><strong>4</strong> blocked</span>}
            />
            <MenuItem icon={<StatusDot status="canceled" size={11} />} label="Canceled" />
            <div style={{ borderTop: '1px solid var(--border-muted)', margin: '4px 0' }} />
            <div style={{
              padding: '6px 10px', fontSize: 11.5, color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="alert" size={12} color="var(--in-progress)" />
              Some transitions may run rules. Affected issues will surface inline.
            </div>
          </div>

          <div style={{
            background: 'var(--fg)', color: '#fff', borderRadius: 10, padding: '6px 6px 6px 14px',
            display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: '0 12px 32px rgba(15,23,42,.18)', fontSize: 13,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              paddingRight: 12, marginRight: 4, borderRight: '1px solid rgba(255,255,255,.15)',
            }}>
              <span className="tnum" style={{
                width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
              }}>7</span>
              <span style={{ fontWeight: 500 }}>selected</span>
            </span>
            <BulkBtn icon="rotate" label="Status" tone="primary" />
            <BulkBtn icon="user" label="Assignee" />
            <BulkBtn icon="flag" label="Priority" />
            <BulkBtn icon="tag" label="Labels" />
            <span style={{ width: 1, alignSelf: 'stretch', margin: '0 4px', background: 'rgba(255,255,255,.15)' }} />
            <BulkBtn icon="archive" label="Archive" />
          </div>

          <div style={{
            marginTop: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, boxShadow: 'var(--shadow-md)', maxWidth: 480,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Icon name="alert" size={13} color="var(--in-progress)" />
              <span style={{ fontWeight: 600 }}>4 of 7 issues will be blocked from this transition</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {['CMT-241', 'CMT-238', 'CMT-230', 'CMT-229'].map((id) => (
                <span key={id} className="mono" style={{
                  padding: '1px 6px', background: '#fef2f2', color: '#991b1b', borderRadius: 3, fontSize: 11.5,
                }}>{id}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm">Skip blocked</button>
              <button className="btn btn-primary btn-sm">Apply to remaining 3</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  trigger?: string;
  hover?: boolean;
  warn?: ReactNode;
}
function MenuItem({ icon, label, trigger, hover, warn }: MenuItemProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
      borderRadius: 5, background: hover ? 'var(--accent-subtle)' : 'transparent',
      cursor: 'pointer', fontSize: 13,
    }}>
      {icon}
      <span style={{ fontWeight: hover ? 600 : 500 }}>{label}</span>
      {trigger && (
        <span className="mono" style={{
          fontSize: 10.5, color: 'var(--fg-muted)', background: 'var(--bg-subtle)',
          padding: '1px 5px', borderRadius: 3,
        }}>{trigger}</span>
      )}
      <div style={{ flex: 1 }} />
      {warn && <span style={{ fontSize: 11, color: 'var(--blocked)' }}>{warn}</span>}
    </div>
  );
}
