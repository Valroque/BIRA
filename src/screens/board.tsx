import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import {
  TopBar, Tabs, Toolbar,
  StatusDot, TypeChip, Priority, Avatar, IssueId, STATUSES,
  projectTabs, useWorkspaceContext,
} from '../components/shell';
import {
  BoardConfigPanel, useBoardConfig, GROUP_BY_OPTIONS,
  type BoardColumn, type GroupBy,
} from '../components/board-config';
import {
  FilterChip, AddFilterButton, applyFilters, newFilterId, type Filter,
} from '../components/issue-filters';
import { AvatarStack } from './teams';
import { ISSUES, projectEffectiveMembers, type Issue } from '../fixtures';
import { useProjects } from '../state/projects';

const PRIORITY_LABEL: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};
const TYPE_LABEL: Record<Issue['type'], string> = {
  T: 'Task', B: 'Bug', S: 'Story', E: 'Epic',
};

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
  const { getProject } = useProjects();
  const projectInfo = getProject(project);
  const members = projectInfo ? projectEffectiveMembers(projectInfo) : [];
  const { config, setConfig, reset } = useBoardConfig(workspace, project);
  const [configOpen, setConfigOpen] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
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

  const updateFilter = (id: string, next: Filter) =>
    setFilters((fs) => fs.map((f) => (f.id === id ? next : f)));
  const removeFilter = (id: string) =>
    setFilters((fs) => fs.filter((f) => f.id !== id));
  const addFilter = (type: Filter['type']) =>
    setFilters((fs) => [...fs, { id: newFilterId(), type, values: [] }]);

  // Scope the board to issues that belong to the current project (fixtures
  // now include Orbit and Atlas issues too), then apply user filters.
  const projectIssues = useMemo(
    () => applyFilters(ISSUES.filter((i) => i.project === project), filters),
    [project, filters],
  );
  const issuesIn = (col: BoardColumn) =>
    projectIssues.filter((i) => col.statuses.includes(i.status));

  // Hide the "project" filter type from the picker — the board is already
  // project-scoped, so it would always be a no-op here.
  const reservedFilterTypes: Filter['type'][] = ['project'];

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${workspace}/${project}` },
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
            <GroupByMenu
              value={config.groupBy}
              onChange={(g) => setConfig({ ...config, groupBy: g })}
            />
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="btn btn-sm"
              data-tip="Configure columns"
            >
              <Icon name="board" size={13} />Columns
            </button>
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
        {filters.map((f) => (
          <FilterChip
            key={f.id}
            filter={f}
            onChange={(next) => updateFilter(f.id, next)}
            onRemove={f.locked ? undefined : () => removeFilter(f.id)}
          />
        ))}
        <AddFilterButton
          activeTypes={[...filters.map((f) => f.type), ...reservedFilterTypes]}
          onAdd={addFilter}
        />
      </Toolbar>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {config.groupBy === 'none' ? (
          <div className="scroll" style={{
            flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex',
            gap: 10, padding: '12px 12px 60px', background: 'var(--bg-subtle)',
          }}>
            {config.columns.map((col) => {
              const colIssues = issuesIn(col);
              const grouped = col.statuses.length > 1;
              const hostsTodo = col.statuses.includes('todo');
              return (
                <div key={col.id} style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                  <ColumnHeader col={col} count={colIssues.length} />
                  <div className="scroll" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {colIssues.map((i) => (
                      <BoardCard
                        key={i.id}
                        issue={i}
                        workspace={workspace}
                        project={project}
                        selected={selectedIds.has(i.id)}
                        onToggleSelect={toggleSelect}
                        showStatus={grouped}
                      />
                    ))}
                    {hostsTodo && (
                      <Link
                        to={`/${workspace}/${project}/issue/new`}
                        style={{
                          height: 30, border: '1.5px dashed var(--border)', borderRadius: 6,
                          background: 'transparent', color: 'var(--fg-faint)', fontSize: 12, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                        }}
                      >+ New issue</Link>
                    )}
                    {!hostsTodo && colIssues.length === 0 && (
                      <div style={{
                        padding: '16px 8px', textAlign: 'center',
                        fontSize: 11.5, color: 'var(--fg-faint)',
                        border: '1px dashed var(--border-muted)', borderRadius: 6,
                      }}>
                        {col.statuses.length === 0 ? 'No statuses assigned to this column.' : 'No issues here yet.'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <SwimlaneBoard
            columns={config.columns}
            issues={projectIssues}
            issuesIn={issuesIn}
            groupBy={config.groupBy}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            workspace={workspace}
            project={project}
          />
        )}

        {showBulkBar && selectedIds.size > 0 && <BulkBar selectedCount={selectedIds.size} onClear={clearSelection} />}
      </div>

      {configOpen && (
        <BoardConfigPanel
          config={config}
          onChange={setConfig}
          onReset={reset}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}

function ColumnHeader({ col, count }: { col: BoardColumn; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 8px' }}>
      <ColumnDots statuses={col.statuses} />
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{col.title}</span>
      <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }} className="tnum">{count}</span>
      <div style={{ flex: 1 }} />
      <button className="btn btn-ghost btn-sm" style={{ width: 22, padding: 0 }}>
        <Icon name="plus" size={12} />
      </button>
      <button className="btn btn-ghost btn-sm" style={{ width: 22, padding: 0 }}>
        <Icon name="moreV" size={12} />
      </button>
    </div>
  );
}

// ---------- Group-by menu ----------

interface GroupByMenuProps {
  value: GroupBy;
  onChange: (next: GroupBy) => void;
}
function GroupByMenu({ value, onChange }: GroupByMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = GROUP_BY_OPTIONS.find((g) => g.id === value) ?? GROUP_BY_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-sm"
        data-tip="Group cards into swimlanes"
      >
        <Icon name={current.icon} size={13} />
        Group: {current.label}
        <Icon name="chevronDown" size={11} color="var(--fg-faint)" style={{ marginLeft: 2 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 31,
            minWidth: 180, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 12px', fontSize: 11, fontWeight: 600,
              color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.4,
            }}>Swimlanes by</div>
            {GROUP_BY_OPTIONS.map((opt) => {
              const active = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '6px 12px', border: 'none',
                    background: active ? 'var(--accent-subtle)' : 'transparent',
                    color: active ? 'var(--accent-active)' : 'var(--fg)',
                    cursor: 'pointer', textAlign: 'left', fontSize: 13,
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon name={opt.icon} size={13} color={active ? 'var(--accent)' : 'var(--fg-muted)'} />
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {active && <Icon name="check" size={12} color="var(--accent)" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Swimlane layout ----------

interface Lane {
  key: string;
  label: ReactNode;
  count: number;
}

function deriveLanes(issues: Issue[], groupBy: GroupBy): Lane[] {
  switch (groupBy) {
    case 'assignee': {
      const names = Array.from(new Set(issues.map((i) => i.assignee))).sort();
      return names.map((name) => ({
        key: name,
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Avatar name={name} size={18} />{name}
          </span>
        ),
        count: issues.filter((i) => i.assignee === name).length,
      }));
    }
    case 'priority': {
      const order: Issue['priority'][] = ['urgent', 'high', 'med', 'low', 'none'];
      return order
        .filter((p) => issues.some((i) => i.priority === p))
        .map((p) => ({
          key: p,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Priority p={p} />{PRIORITY_LABEL[p]}
            </span>
          ),
          count: issues.filter((i) => i.priority === p).length,
        }));
    }
    case 'type': {
      const order: Issue['type'][] = ['T', 'B', 'S', 'E'];
      return order
        .filter((t) => issues.some((i) => i.type === t))
        .map((t) => ({
          key: t,
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TypeChip type={t} />{TYPE_LABEL[t]}
            </span>
          ),
          count: issues.filter((i) => i.type === t).length,
        }));
    }
    case 'label': {
      const all = Array.from(new Set(issues.flatMap((i) => i.labels))).sort();
      const lanes: Lane[] = all.map((l) => ({
        key: l,
        label: (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 3,
            background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 12,
          }}>{l}</span>
        ),
        count: issues.filter((i) => i.labels.includes(l)).length,
      }));
      const noneCount = issues.filter((i) => i.labels.length === 0).length;
      if (noneCount > 0) {
        lanes.push({
          key: '__none__',
          label: <span style={{ color: 'var(--fg-faint)', fontStyle: 'italic' }}>No label</span>,
          count: noneCount,
        });
      }
      return lanes;
    }
    default:
      return [];
  }
}

function isInLane(issue: Issue, groupBy: GroupBy, key: string): boolean {
  switch (groupBy) {
    case 'assignee': return issue.assignee === key;
    case 'priority': return issue.priority === key;
    case 'type':     return issue.type === key;
    case 'label':    return key === '__none__' ? issue.labels.length === 0 : issue.labels.includes(key);
    default:         return true;
  }
}

interface SwimlaneBoardProps {
  columns: BoardColumn[];
  issues: Issue[];
  issuesIn: (col: BoardColumn) => Issue[];
  groupBy: GroupBy;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  workspace: string;
  project: string;
}
function SwimlaneBoard({
  columns, issues, issuesIn, groupBy,
  selectedIds, onToggleSelect, workspace, project,
}: SwimlaneBoardProps) {
  const lanes = useMemo(() => deriveLanes(issues, groupBy), [issues, groupBy]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleLane = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const colWidth = 280;
  const gap = 10;
  const totalWidth = columns.length * colWidth + (columns.length - 1) * gap;

  return (
    <div className="scroll" style={{
      flex: 1, overflow: 'auto', background: 'var(--bg-subtle)', padding: '0 0 60px',
    }}>
      <div style={{ minWidth: totalWidth + 24, padding: '0 12px' }}>
        {/* Sticky column-header row */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 4, background: 'var(--bg-subtle)',
          paddingTop: 12, paddingBottom: 8,
          display: 'flex', gap,
        }}>
          {columns.map((col) => (
            <div key={col.id} style={{ width: colWidth, flexShrink: 0 }}>
              <ColumnHeader col={col} count={issuesIn(col).length} />
            </div>
          ))}
        </div>

        {lanes.length === 0 ? (
          <div style={{
            margin: '24px 0', padding: '20px',
            textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13,
            border: '1px dashed var(--border-muted)', borderRadius: 8,
          }}>
            No issues match the current filters.
          </div>
        ) : (
          lanes.map((lane) => {
            const isCollapsed = collapsed.has(lane.key);
            return (
              <div
                key={lane.key}
                style={{
                  marginBottom: 12, border: '1px solid var(--border-muted)',
                  borderRadius: 8, overflow: 'hidden', background: 'var(--bg)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleLane(lane.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'var(--bg-subtle)',
                    border: 'none', borderBottom: isCollapsed ? 'none' : '1px solid var(--border-muted)',
                    cursor: 'pointer', textAlign: 'left',
                    position: 'sticky', left: 12, // keep header aligned when scrolled horizontally
                  }}
                >
                  <Icon
                    name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                    size={12}
                    color="var(--fg-muted)"
                  />
                  {lane.label}
                  <span className="tnum" style={{
                    fontSize: 11, color: 'var(--fg-faint)',
                    background: 'var(--bg-muted)', padding: '1px 6px', borderRadius: 8,
                  }}>{lane.count}</span>
                </button>
                {!isCollapsed && (
                  <div style={{ display: 'flex', gap, padding: 10 }}>
                    {columns.map((col) => {
                      const cards = issuesIn(col).filter((i) => isInLane(i, groupBy, lane.key));
                      const grouped = col.statuses.length > 1;
                      return (
                        <div
                          key={col.id}
                          style={{
                            width: colWidth, flexShrink: 0,
                            display: 'flex', flexDirection: 'column', gap: 6,
                          }}
                        >
                          {cards.map((i) => (
                            <BoardCard
                              key={i.id}
                              issue={i}
                              workspace={workspace}
                              project={project}
                              selected={selectedIds.has(i.id)}
                              onToggleSelect={onToggleSelect}
                              showStatus={grouped}
                            />
                          ))}
                          {cards.length === 0 && (
                            <div style={{
                              minHeight: 30, border: '1px dashed var(--border-muted)',
                              borderRadius: 6, opacity: 0.5,
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Stack of small status dots for a column header. With one status we get the
// familiar single dot; grouped columns show all member dots so you can tell at
// a glance which statuses live there.
function ColumnDots({ statuses }: { statuses: string[] }) {
  if (statuses.length === 0) {
    return (
      <span style={{
        width: 11, height: 11, borderRadius: 6,
        background: 'transparent', border: '1.5px dashed var(--border-strong)',
        display: 'inline-block',
      }} />
    );
  }
  if (statuses.length === 1) {
    return <StatusDot status={statuses[0]} size={11} />;
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {statuses.map((s) => <StatusDot key={s} status={s} size={9} />)}
    </span>
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
  /** Show a small status indicator. Useful when the column groups multiple statuses. */
  showStatus?: boolean;
}
export function BoardCard({ issue, workspace, project, selected, onToggleSelect, showStatus }: BoardCardProps) {
  const statusMeta = STATUSES.find((s) => s.id === issue.status);
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
        {showStatus && statusMeta && (
          <span
            data-tip={statusMeta.name}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '1px 6px 1px 5px', borderRadius: 10,
              background: `var(--${issue.status}-bg)`, color: `var(--${issue.status})`,
              fontSize: 10.5, fontWeight: 500,
            }}
          >
            <StatusDot status={issue.status} size={8} />
            {statusMeta.name}
          </span>
        )}
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
