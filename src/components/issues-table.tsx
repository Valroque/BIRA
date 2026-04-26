// Shared issues table — used by /:workspace/my-issues + /all-issues AND
// /:workspace/:project/list. Owns: filter chips, sort stack (header-click
// driven), group-by, columns visibility / order / widths, the sticky
// TableHeader, and the grouped accordion body.
//
// Consumers pass the input `issues` + which group keys / filter types are
// allowed for their page. Project-scoped consumers set `projectScoped` so
// the Project column auto-hides and 'project' is dropped from the picker.

import {
  useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { Icon } from './icons';
import {
  Toolbar, StatusDot, Avatar, Priority, TypeChip,
  STATUSES, useWorkspaceContext,
} from './shell';
import {
  ListRow, buildRowColumns, useColumnLayout, MIN_WIDTHS, COLUMN_LABELS,
  ALL_COLUMNS, DEFAULT_LAYOUT,
  type ColumnId, type ColumnLayout,
} from './issue-row';
import {
  FilterChip, AddFilterButton, applyFilters, applySortStack, cycleSort,
  COLUMN_SORT_FIELD, newFilterId,
  type Filter, type Sort,
} from './issue-filters';
import { useDismiss } from './use-dismiss';
import { ProjectBadge } from './project-chip';
import { EmptyState } from './states';
import { ISSUE_TYPE_NAMES, type Issue, type IssueTypeLetter, type Project } from '../fixtures';
import { useProjects } from '../state/projects';

export type IssueGroupKey = 'none' | 'status' | 'project' | 'assignee' | 'priority' | 'type';

const GROUP_LABELS: Record<IssueGroupKey, string> = {
  none: 'None',
  status: 'Status',
  project: 'Project',
  assignee: 'Assignee',
  priority: 'Priority',
  type: 'Type',
};

const PRIORITY_ORDER: Issue['priority'][] = ['urgent', 'high', 'med', 'low', 'none'];
const PRIORITY_LABELS: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

interface Group {
  id: string;
  label: string;
  swatch?: ReactNode;
  items: Issue[];
}

export interface IssuesTableProps {
  issues: Issue[];
  /** Filters seeded into the toolbar. Set `locked: true` so the chip can't be removed. */
  initialFilters?: Filter[];
  /** Filter types hidden from the Add-filter picker (e.g. ['project'] on a project-scoped page). */
  reservedFilterTypes?: Filter['type'][];
  /** Subset of group keys the user can pick. Defaults to all six. */
  groupOptions?: IssueGroupKey[];
  defaultGroup?: IssueGroupKey;
  /** When true, the Project column is always hidden and 'project' is removed from groupOptions. */
  projectScoped?: boolean;
  /** Optional page header above the toolbar — title + description + live filtered-count pill. */
  pageHeader?: { title: string; description: string };
  /** Title for the "input is empty" state. Overridden by the filter-mismatch state when filters are active. */
  emptyTitle?: string;
  /** Description for the "input is empty" state. */
  emptyDescription?: string;
  /** Action button for the "input is empty" state (e.g. "New issue"). */
  emptyAction?: ReactNode;
}

export function IssuesTable(props: IssuesTableProps) {
  const {
    issues,
    initialFilters = [],
    reservedFilterTypes = [],
    defaultGroup = 'status',
    projectScoped = false,
    pageHeader,
    emptyTitle = 'No issues yet',
    emptyDescription = 'Issues you create or that match your filters will appear here.',
    emptyAction,
  } = props;

  // Project-scoped pages drop the 'project' option from the picker so the user
  // can't pick a one-bucket grouping.
  const groupOptions = useMemo<IssueGroupKey[]>(() => {
    const base = props.groupOptions ?? ['none', 'status', 'project', 'assignee', 'priority', 'type'];
    return projectScoped ? base.filter((g) => g !== 'project') : base;
  }, [props.groupOptions, projectScoped]);

  const { workspace } = useWorkspaceContext();
  const { projects } = useProjects();

  const [groupBy, setGroupBy] = useState<IssueGroupKey>(defaultGroup);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [sortStack, setSortStack] = useState<Sort[]>([]);
  const [layout, setLayout] = useColumnLayout();
  const { widths, order, visible } = layout;

  const toggleCollapsed = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelect = (id: string) => setSelectedIds((prev) => {
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
  const clearUnlockedFilters = () =>
    setFilters((fs) => fs.filter((f) => f.locked));

  // Filtering and sorting are kept separate. Group derivation must NOT depend
  // on the sort stack — otherwise changing "sort by assignee" would shuffle
  // the group order, which is disorienting. Items within each group do honour
  // the sort.
  const filteredIssues = useMemo(() => applyFilters(issues, filters), [issues, filters]);
  const sortedIssues = useMemo(
    () => applySortStack(filteredIssues, sortStack),
    [filteredIssues, sortStack],
  );

  const onHeaderSort = (colId: ColumnId) => {
    const field = COLUMN_SORT_FIELD[colId];
    if (!field) return;
    setSortStack((prev) => cycleSort(prev, field));
  };
  const allVisibleIds = filteredIssues.map((i) => i.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds));
  };

  // Hide the Project column when the page is single-project, OR when rows are
  // grouped by project (the group header already conveys it; repeating it on
  // every row is noise).
  const showProject = !projectScoped && groupBy !== 'project';
  const gridColumns = buildRowColumns(widths, order, visible, showProject);

  const groups = useMemo<Group[]>(
    () => deriveGroups(filteredIssues, sortedIssues, groupBy, projects),
    [filteredIssues, sortedIssues, groupBy, projects],
  );

  const hasUnlockedFilters = filters.some((f) => !f.locked);
  const inputIsEmpty = issues.length === 0;
  const filtersYieldEmpty = !inputIsEmpty && filteredIssues.length === 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {pageHeader && (
        <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{pageHeader.title}</h1>
            <span className="pill" style={{ background: 'var(--bg-muted)' }}>
              <span className="tnum">{filteredIssues.length}</span>
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0', maxWidth: 720 }}>
            {pageHeader.description}
          </p>
        </div>
      )}

      <Toolbar
        right={
          <>
            <GroupSelect value={groupBy} onChange={setGroupBy} options={groupOptions} />
            <ColumnsMenu layout={layout} onLayoutChange={setLayout} projectScoped={projectScoped} />
            {sortStack.length > 0 && (
              <button
                type="button"
                onClick={() => setSortStack([])}
                className="btn btn-sm"
                data-tip="Clear sort"
              >
                <Icon name="rotate" size={12} />
                Clear sort
                <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 2 }}>
                  {sortStack.length}
                </span>
              </button>
            )}
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
        <TableHeader
          showProject={showProject}
          gridColumns={gridColumns}
          layout={layout}
          onLayoutChange={setLayout}
          sortStack={sortStack}
          onSortColumn={onHeaderSort}
          allSelected={allSelected}
          someSelected={someSelected}
          onSelectAll={toggleSelectAll}
        />
        {filtersYieldEmpty ? (
          <EmptyState
            icon="list"
            title="No issues match these filters"
            description="Adjust the filters above or change the grouping to see something here."
            action={hasUnlockedFilters ? (
              <button type="button" onClick={clearUnlockedFilters} className="btn btn-sm">
                <Icon name="x" size={13} />Clear filters
              </button>
            ) : undefined}
          />
        ) : inputIsEmpty ? (
          <EmptyState
            icon="list"
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          groups.map((g) => {
            const isFlat = groupBy === 'none';
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id}>
                {!isFlat && (
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
                )}
                {(isFlat || !isCollapsed) && g.items.map((i) => (
                  <ListRow
                    key={i.id}
                    issue={i}
                    workspace={workspace}
                    selected={selectedIds.has(i.id)}
                    onToggleSelect={toggleSelect}
                    showProject={showProject}
                    columns={gridColumns}
                    order={order}
                    visible={visible}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group derivation — one place per group key.
// ---------------------------------------------------------------------------

function deriveGroups(
  filteredIssues: Issue[],
  sortedIssues: Issue[],
  groupBy: IssueGroupKey,
  projects: Project[],
): Group[] {
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
  if (groupBy === 'project') {
    // Project declaration order — sort-independent.
    return projects
      .filter((p) => filteredIssues.some((i) => i.project === p.slug))
      .map<Group>((p) => ({
        id: p.slug, label: p.name,
        swatch: <ProjectBadge project={p} />,
        items: sortedIssues.filter((i) => i.project === p.slug),
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
  if (groupBy === 'type') {
    return TYPE_ORDER
      .filter((t) => filteredIssues.some((i) => i.type === t))
      .map<Group>((t) => ({
        id: t, label: ISSUE_TYPE_NAMES[t],
        swatch: <TypeChip type={t} />,
        items: sortedIssues.filter((i) => i.type === t),
      }));
  }
  // assignee — alphabetical
  const names = Array.from(new Set(filteredIssues.map((i) => i.assignee))).sort();
  return names.map<Group>((n) => ({
    id: n, label: n,
    swatch: <Avatar name={n} size={16} />,
    items: sortedIssues.filter((i) => i.assignee === n),
  }));
}

// ---------------------------------------------------------------------------
// TableHeader (sortable + drag-resize + drag-reorder)
// ---------------------------------------------------------------------------

interface TableHeaderProps {
  showProject: boolean;
  gridColumns: string;
  layout: ColumnLayout;
  onLayoutChange: (next: ColumnLayout) => void;
  sortStack: Sort[];
  onSortColumn: (colId: ColumnId) => void;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: () => void;
}
function TableHeader({
  showProject, gridColumns, layout, onLayoutChange, sortStack, onSortColumn,
  allSelected, someSelected, onSelectAll,
}: TableHeaderProps) {
  const { order } = layout;

  // Live ref so the resize/drag handlers don't see stale closure snapshots.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [dragId, setDragId] = useState<ColumnId | null>(null);
  const [overId, setOverId] = useState<ColumnId | null>(null);

  const startResize = (id: ColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = layoutRef.current.widths[id];
    const min = MIN_WIDTHS[id];

    const move = (ev: MouseEvent) => {
      const next = Math.max(min, Math.round(startWidth + (ev.clientX - startX)));
      if (next === layoutRef.current.widths[id]) return;
      onLayoutChange({
        ...layoutRef.current,
        widths: { ...layoutRef.current.widths, [id]: next },
      });
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

  const onColDragStart = (id: ColumnId, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDragId(id);
  };
  const onColDragOver = (id: ColumnId, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  };
  const onColDragLeave = (id: ColumnId) => {
    if (overId === id) setOverId(null);
  };
  const onColDrop = (id: ColumnId, e: React.DragEvent) => {
    e.preventDefault();
    const source = (dragId ?? e.dataTransfer.getData('text/plain')) as ColumnId | '';
    setDragId(null);
    setOverId(null);
    if (!source || source === id) return;
    const next = order.filter((c) => c !== source);
    const targetIdx = next.indexOf(id);
    if (targetIdx < 0) return;
    next.splice(targetIdx, 0, source);
    onLayoutChange({ ...layoutRef.current, order: next });
  };
  const onColDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };

  const { visible } = layout;
  const visibleOrder = order.filter((c) => visible[c] && (c !== 'project' || showProject));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: 10, alignItems: 'center', padding: '8px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 2,
      }}
    >
      <input
        type="checkbox"
        className={`cb${someSelected ? ' cb-indet' : ''}`}
        checked={allSelected}
        onChange={onSelectAll}
        aria-label={allSelected ? 'Deselect all' : 'Select all'}
      />
      {visibleOrder.map((colId) => {
        const sortField = COLUMN_SORT_FIELD[colId];
        const sortIndex = sortField ? sortStack.findIndex((s) => s.field === sortField) : -1;
        const isSorted = sortIndex >= 0;
        return (
          <HeaderCell
            key={colId}
            colId={colId}
            label={COLUMN_LABELS[colId]}
            sortable={!!sortField}
            sortDir={isSorted ? sortStack[sortIndex].dir : null}
            sortRank={isSorted && sortStack.length > 1 ? sortIndex + 1 : null}
            onSortClick={onSortColumn}
            isDragging={dragId === colId}
            isDropTarget={overId === colId && dragId !== null && dragId !== colId}
            onResizeStart={startResize}
            onDragStart={onColDragStart}
            onDragOver={onColDragOver}
            onDragLeave={onColDragLeave}
            onDrop={onColDrop}
            onDragEnd={onColDragEnd}
          />
        );
      })}
      <span aria-hidden="true" />
    </div>
  );
}

const headerCellStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: 0.5,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

interface HeaderCellProps {
  label: string;
  colId: ColumnId;
  sortable: boolean;
  sortDir: 'asc' | 'desc' | null;
  sortRank: number | null;
  onSortClick: (colId: ColumnId) => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onResizeStart: (id: ColumnId, e: React.MouseEvent) => void;
  onDragStart: (id: ColumnId, e: React.DragEvent) => void;
  onDragOver: (id: ColumnId, e: React.DragEvent) => void;
  onDragLeave: (id: ColumnId) => void;
  onDrop: (id: ColumnId, e: React.DragEvent) => void;
  onDragEnd: () => void;
}
function HeaderCell({
  label, colId, sortable, sortDir, sortRank, onSortClick,
  isDragging, isDropTarget,
  onResizeStart, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: HeaderCellProps) {
  const isSorted = sortDir !== null;
  return (
    <span
      draggable
      onClick={() => sortable && onSortClick(colId)}
      onDragStart={(e) => onDragStart(colId, e)}
      onDragOver={(e) => onDragOver(colId, e)}
      onDragLeave={() => onDragLeave(colId)}
      onDrop={(e) => onDrop(colId, e)}
      onDragEnd={onDragEnd}
      title={sortable ? 'Click to sort. Click another column to add a secondary sort.' : undefined}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0,
        cursor: sortable ? 'pointer' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        background: isDropTarget ? 'var(--accent-subtle)' : isSorted ? 'var(--accent-subtle)' : 'transparent',
        boxShadow: isDropTarget ? 'inset 2px 0 0 var(--accent)' : 'none',
        transition: 'background .1s, box-shadow .1s, opacity .1s',
        userSelect: 'none', borderRadius: 3,
      }}
    >
      <span style={{
        ...headerCellStyle,
        color: isSorted ? 'var(--accent-active)' : 'var(--fg-muted)',
      }}>{label}</span>
      {isSorted && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 1,
          marginLeft: 4, fontSize: 11, color: 'var(--accent)', fontWeight: 700,
          pointerEvents: 'none',
        }}>
          {sortDir === 'asc' ? '↑' : '↓'}
          {sortRank != null && (
            <sup style={{ fontSize: 9, marginLeft: 1 }}>{sortRank}</sup>
          )}
        </span>
      )}
      <span
        draggable={false}
        onMouseDown={(e) => onResizeStart(colId, e)}
        onClick={(e) => e.stopPropagation()}
        aria-hidden="true"
        style={{
          position: 'absolute', right: -7, top: -4, bottom: -4, width: 14,
          cursor: 'col-resize', zIndex: 3,
          display: 'flex', justifyContent: 'center',
        }}
        onMouseEnter={(e) => {
          const line = e.currentTarget.firstChild as HTMLSpanElement | null;
          if (line) line.style.background = 'var(--accent)';
        }}
        onMouseLeave={(e) => {
          const line = e.currentTarget.firstChild as HTMLSpanElement | null;
          if (line) line.style.background = 'var(--border-muted)';
        }}
      >
        <span style={{ width: 1, height: '100%', background: 'var(--border-muted)', transition: 'background .12s' }} />
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Columns menu — show / hide / reset.
// ---------------------------------------------------------------------------

interface ColumnsMenuProps {
  layout: ColumnLayout;
  onLayoutChange: (next: ColumnLayout) => void;
  /** Hide the Project entry on project-scoped pages — toggling it is a no-op there. */
  projectScoped?: boolean;
}
function ColumnsMenu({ layout, onLayoutChange, projectScoped = false }: ColumnsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const togglableColumns = projectScoped
    ? ALL_COLUMNS.filter((c) => c !== 'project')
    : ALL_COLUMNS;
  const visibleCount = togglableColumns.filter((c) => layout.visible[c]).length;
  const isLastVisible = (id: ColumnId) => visibleCount === 1 && layout.visible[id];

  const toggle = (id: ColumnId) => {
    if (isLastVisible(id)) return;
    onLayoutChange({
      ...layout,
      visible: { ...layout.visible, [id]: !layout.visible[id] },
    });
  };
  const reset = () => onLayoutChange({ ...DEFAULT_LAYOUT });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-sm"
      >
        <Icon name="layout" size={13} />
        Columns
        <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 2 }}>
          {visibleCount}/{togglableColumns.length}
        </span>
        <Icon name="chevronDown" size={11} color="var(--fg-faint)" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 240, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', zIndex: 30, overflow: 'hidden',
        }}>
          <div className="label-section" style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border-muted)',
          }}>Display columns</div>
          <div style={{ padding: 4 }}>
            {togglableColumns.map((id) => {
              const checked = !!layout.visible[id];
              const last = isLastVisible(id);
              return (
                <label
                  key={id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5, fontSize: 13,
                    cursor: last ? 'not-allowed' : 'pointer',
                    color: last ? 'var(--fg-muted)' : 'var(--fg)',
                  }}
                  onMouseEnter={(e) => { if (!last) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <input
                    type="checkbox"
                    className="cb"
                    checked={checked}
                    disabled={last}
                    onChange={() => toggle(id)}
                  />
                  <span style={{ flex: 1 }}>{COLUMN_LABELS[id]}</span>
                  {last && (
                    <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>required</span>
                  )}
                </label>
              );
            })}
          </div>
          <div style={{
            padding: '6px 8px', borderTop: '1px solid var(--border-muted)',
            display: 'flex', gap: 6,
          }}>
            <button
              type="button"
              onClick={reset}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              <Icon name="rotate" size={12} />Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group select
// ---------------------------------------------------------------------------

function GroupSelect({
  value, onChange, options,
}: {
  value: IssueGroupKey;
  onChange: (v: IssueGroupKey) => void;
  options: IssueGroupKey[];
}) {
  return (
    <label className="btn btn-sm" style={{ paddingRight: 4, cursor: 'pointer' }}>
      <Icon name="layers" size={13} />
      Group:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as IssueGroupKey)}
        style={{
          appearance: 'none', border: 'none', background: 'transparent',
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
          padding: '0 2px', cursor: 'pointer', outline: 'none',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{GROUP_LABELS[o]}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={11} color="var(--fg-faint)" />
    </label>
  );
}
