// /:workspace/:project/list — project-scoped issue list with working
// filter / group-by / sort. The list page is a status-grouped accordion
// by default; groupBy can switch the partition (or flatten to no groups),
// and sort orders items within each group (group order itself stays
// canonical, like the workspace-issues page).

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import {
  TopBar, Tabs, Toolbar, StatusDot, Avatar, Priority, TypeChip,
  STATUSES, projectTabs, useWorkspaceContext,
} from '../components/shell';
import { ListRow } from '../components/issue-row';
import { EmptyState } from '../components/states';
import {
  FilterChip, AddFilterButton, applyFilters, applySortStack, newFilterId,
  SORT_LABELS, SORT_ICONS,
  type Filter, type Sort, type SortField,
} from '../components/issue-filters';
import { ISSUES, ISSUE_TYPE_NAMES, type Issue, type IssueTypeLetter } from '../fixtures';
import { useProjects } from '../state/projects';

type GroupKey = 'none' | 'status' | 'assignee' | 'priority' | 'type';

const GROUP_OPTIONS: { id: GroupKey; label: string; icon: string }[] = [
  { id: 'none',     label: 'None',     icon: 'list' },
  { id: 'status',   label: 'Status',   icon: 'circle' },
  { id: 'assignee', label: 'Assignee', icon: 'user' },
  { id: 'priority', label: 'Priority', icon: 'flag' },
  { id: 'type',     label: 'Type',     icon: 'diamond' },
];

const PRIORITY_ORDER: Issue['priority'][] = ['urgent', 'high', 'med', 'low', 'none'];
const PRIORITY_LABELS: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

// Sort fields the user can pick from this page. `id`/`project` aren't useful
// here (per-project, ids are sequential by definition) and `status` is the
// default groupBy so a separate sort would just duplicate the partition.
const LIST_SORT_FIELDS: SortField[] = ['updated', 'priority', 'title', 'assignee', 'type'];

interface Group {
  id: string;
  label: string;
  swatch?: ReactNode;
  items: Issue[];
}

export function ListPage() {
  return <ListView />;
}

export function ListView() {
  const { workspace, project } = useWorkspaceContext();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);

  const [filters, setFilters] = useState<Filter[]>([]);
  const [groupBy, setGroupBy] = useState<GroupKey>('status');
  const [sort, setSort] = useState<Sort | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleCollapsed = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const updateFilter = (id: string, next: Filter) =>
    setFilters((fs) => fs.map((f) => (f.id === id ? next : f)));
  const removeFilter = (id: string) =>
    setFilters((fs) => fs.filter((f) => f.id !== id));
  const addFilter = (type: Filter['type']) =>
    setFilters((fs) => [...fs, { id: newFilterId(), type, values: [] }]);

  // Hide the "project" filter type — the page is already project-scoped, so
  // it'd always be a no-op here.
  const reservedFilterTypes: Filter['type'][] = ['project'];

  // Filter and sort. Group keys come from the *filtered* set (canonical
  // order, sort-independent); items inside a group come from the *sorted*
  // set so the user's sort applies within each group.
  const projectIssues = useMemo(
    () => ISSUES.filter((i) => i.project === project),
    [project],
  );
  const filteredIssues = useMemo(
    () => applyFilters(projectIssues, filters),
    [projectIssues, filters],
  );
  const sortedIssues = useMemo(
    () => (sort ? applySortStack(filteredIssues, [sort]) : filteredIssues),
    [filteredIssues, sort],
  );

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') {
      return [{ id: '__all__', label: '', items: sortedIssues }];
    }
    if (groupBy === 'status') {
      return STATUSES
        .filter((s) => s.id !== 'canceled')
        .map<Group>((s) => ({
          id: s.id, label: s.name,
          swatch: <StatusDot status={s.id} size={10} />,
          items: sortedIssues.filter((i) => i.status === s.id),
        }))
        .filter((g) => g.items.length > 0);
    }
    if (groupBy === 'assignee') {
      const names = Array.from(new Set(filteredIssues.map((i) => i.assignee))).sort();
      return names.map<Group>((n) => ({
        id: n, label: n,
        swatch: <Avatar name={n} size={16} />,
        items: sortedIssues.filter((i) => i.assignee === n),
      }));
    }
    if (groupBy === 'priority') {
      return PRIORITY_ORDER
        .filter((p) => filteredIssues.some((i) => i.priority === p))
        .map<Group>((p) => ({
          id: p, label: PRIORITY_LABELS[p],
          swatch: <Priority p={p} />,
          items: sortedIssues.filter((i) => i.priority === p),
        }));
    }
    // type
    return TYPE_ORDER
      .filter((t) => filteredIssues.some((i) => i.type === t))
      .map<Group>((t) => ({
        id: t, label: ISSUE_TYPE_NAMES[t],
        swatch: <TypeChip type={t} />,
        items: sortedIssues.filter((i) => i.type === t),
      }));
  }, [groupBy, filteredIssues, sortedIssues]);

  const noResults = filteredIssues.length === 0;
  const hasFilters = filters.length > 0;

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${workspace}/${project}` },
        'Issues',
      ]} />
      <Tabs active="issues" tabs={projectTabs(workspace, project)} />

      <Toolbar
        right={
          <>
            <GroupByMenu value={groupBy} onChange={setGroupBy} />
            <SortMenu value={sort} onChange={setSort} />
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

      <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
        {noResults && (
          <EmptyState
            icon="list"
            title={hasFilters ? 'No issues match these filters' : 'No issues yet'}
            description={hasFilters
              ? 'Try removing a filter, or create an issue that matches.'
              : 'Issues you create or that match your filters will appear here, grouped by status.'}
            action={hasFilters ? (
              <button
                type="button"
                onClick={() => setFilters([])}
                className="btn btn-sm"
              >
                <Icon name="x" size={13} />Clear filters
              </button>
            ) : (
              <Link to={`/${workspace}/${project}/issue/new`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                <Icon name="plus" size={13} />New issue
              </Link>
            )}
          />
        )}
        {!noResults && groups.map((g) => {
          if (groupBy === 'none') {
            // Flat list — no group header, no collapse affordance.
            return (
              <div key={g.id}>
                {g.items.map((i) => (
                  <ListRow key={i.id} issue={i} workspace={workspace} />
                ))}
              </div>
            );
          }
          const isCollapsed = collapsed.has(g.id);
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => toggleCollapsed(g.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', width: '100%',
                  background: 'var(--bg-subtle)',
                  borderBottom: '1px solid var(--border-muted)',
                  border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                  color: 'var(--fg)',
                }}
              >
                <Icon
                  name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                  size={12}
                  color="var(--fg-muted)"
                />
                {g.swatch}
                <span style={{ fontWeight: 600 }}>{g.label}</span>
                <span className="tnum" style={{ color: 'var(--fg-faint)' }}>{g.items.length}</span>
              </button>
              {!isCollapsed && g.items.map((i) => (
                <ListRow key={i.id} issue={i} workspace={workspace} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Group by + Sort menus ----

interface GroupByMenuProps {
  value: GroupKey;
  onChange: (next: GroupKey) => void;
}
function GroupByMenu({ value, onChange }: GroupByMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = GROUP_OPTIONS.find((o) => o.id === value) ?? GROUP_OPTIONS[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-sm"
        data-tip="Group issues"
      >
        <Icon name="layers" size={13} />Group: {current.label}
        <Icon name="chevronDown" size={11} color="var(--fg-faint)" style={{ marginLeft: 2 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 31,
            minWidth: 180, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', padding: 4,
          }}>
            {GROUP_OPTIONS.map((opt) => {
              const active = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                  style={menuItemStyle(active)}
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

interface SortMenuProps {
  value: Sort | null;
  onChange: (next: Sort | null) => void;
}
function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click a field once → asc; same field again → desc; same field a third
  // time → cleared (default order). Different field → asc on that field.
  const cycle = (field: SortField) => {
    if (!value || value.field !== field) {
      onChange({ field, dir: 'asc' });
      return;
    }
    if (value.dir === 'asc') {
      onChange({ field, dir: 'desc' });
      return;
    }
    onChange(null);
  };

  const buttonLabel = value
    ? `Sort: ${SORT_LABELS[value.field]} ${value.dir === 'asc' ? '↑' : '↓'}`
    : 'Sort';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-sm"
        data-tip="Sort issues within each group"
        style={value ? { borderColor: 'var(--accent)', color: 'var(--accent-active)' } : undefined}
      >
        <Icon name="filter" size={13} />{buttonLabel}
        <Icon name="chevronDown" size={11} color="var(--fg-faint)" style={{ marginLeft: 2 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 31,
            minWidth: 220, background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 12px 6px', fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>Sort by</div>
            <div style={{ padding: 4 }}>
              {LIST_SORT_FIELDS.map((field) => {
                const active = value?.field === field;
                const dirIcon: ReactNode = active
                  ? value!.dir === 'asc'
                    ? <Icon name="arrowUp" size={11} color="var(--accent)" />
                    : <Icon name="arrowDown" size={11} color="var(--accent)" />
                  : null;
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => cycle(field)}
                    style={menuItemStyle(active)}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon name={SORT_ICONS[field]} size={13} color={active ? 'var(--accent)' : 'var(--fg-muted)'} />
                    <span style={{ flex: 1 }}>{SORT_LABELS[field]}</span>
                    {dirIcon}
                  </button>
                );
              })}
            </div>
            {value && (
              <>
                <div style={{ borderTop: '1px solid var(--border-muted)' }} />
                <div style={{ padding: 4 }}>
                  <button
                    type="button"
                    onClick={() => { onChange(null); setOpen(false); }}
                    style={menuItemStyle(false)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon name="x" size={13} color="var(--fg-muted)" />
                    <span style={{ flex: 1 }}>Clear sort</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function menuItemStyle(active: boolean) {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '6px 10px', borderRadius: 4,
    border: 'none',
    background: active ? 'var(--accent-subtle)' : 'transparent',
    color: active ? 'var(--accent-active)' : 'var(--fg)',
    cursor: 'pointer', textAlign: 'left' as const, fontSize: 13,
    fontWeight: active ? 600 : 500,
  };
}

