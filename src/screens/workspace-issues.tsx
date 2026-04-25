// Workspace-level issue lists: My Issues + All Issues. Both share a single
// view that supports grouping by status, project, or assignee, plus a small
// filter strip. Project-scoped lists live in `list.tsx` and don't share this.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../components/icons';
import {
  TopBar, Toolbar, StatusDot, Avatar,
  STATUSES, useWorkspaceContext,
} from '../components/shell';
import {
  ListRow, buildRowColumns, useColumnLayout, MIN_WIDTHS, COLUMN_LABELS,
  ALL_COLUMNS, DEFAULT_LAYOUT,
  type ColumnId, type ColumnLayout,
} from '../components/issue-row';
import {
  FilterChip, AddFilterButton, applyFilters, newFilterId,
  applySortStack, cycleSort, COLUMN_SORT_FIELD,
  type Filter, type Sort,
} from '../components/issue-filters';
import { EmptyState } from '../components/states';
import { ISSUES, PROJECT_INFO, CURRENT_USER, type Issue, type ProjectSlug } from '../fixtures';

type GroupKey = 'status' | 'project' | 'assignee';

interface Group {
  id: string;
  label: string;
  swatch?: ReactNode;
  items: Issue[];
}

interface WorkspaceIssuesViewProps {
  breadcrumbs: import('../components/shell').Crumb[];
  /** Used in the breadcrumb / title context. */
  pageTitle: string;
  /** Subtitle / description shown under the title row. */
  pageDescription: string;
  /**
   * Initial filters seeded into the toolbar. A `locked` filter (e.g. "Assignee:
   * Me" on My Issues) cannot be removed and represents the page's identity.
   */
  initialFilters: Filter[];
  /** Default grouping when the page first renders. */
  defaultGroup: GroupKey;
}

function WorkspaceIssuesView(props: WorkspaceIssuesViewProps) {
  const { workspace } = useWorkspaceContext();
  const [groupBy, setGroupBy] = useState<GroupKey>(props.defaultGroup);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState<Filter[]>(props.initialFilters);
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

  // Filtering and sorting are kept separate. Group derivation must NOT depend
  // on the sort stack — otherwise changing "sort by assignee" would shuffle
  // the project group order, which is disorienting. Items within each group
  // do honour the sort.
  const filteredIssues = useMemo(() => applyFilters(ISSUES, filters), [filters]);
  const sortedIssues = useMemo(
    () => applySortStack(filteredIssues, sortStack),
    [filteredIssues, sortStack],
  );
  // What the header pill / select-all / "no matches" empty state care about.
  const visibleIssues = filteredIssues;

  const onHeaderSort = (colId: ColumnId) => {
    const field = COLUMN_SORT_FIELD[colId];
    if (!field) return; // not-sortable column (e.g. labels)
    setSortStack((prev) => cycleSort(prev, field));
  };
  const allVisibleIds = visibleIssues.map((i) => i.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allVisibleIds.some((id) => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allVisibleIds));
  };

  // Hide the Project column when rows are already grouped by project — the
  // group header conveys the project, repeating it on every row is noise.
  const showProject = groupBy !== 'project';
  const gridColumns = buildRowColumns(widths, order, visible, showProject);

  const groups = useMemo<Group[]>(() => {
    // Group keys come from `filteredIssues` (canonical order, sort-independent).
    // Group items come from `sortedIssues` so the user's sort applies inside.
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
      // Iterate PROJECT_INFO in its declaration order rather than reading the
      // first-seen slug from filtered/sorted issues — that's what kept the
      // group order shifting when the sort changed.
      const slugs = (Object.keys(PROJECT_INFO) as ProjectSlug[])
        .filter((slug) => filteredIssues.some((i) => i.project === slug));
      return slugs.map<Group>((slug) => {
        const p = PROJECT_INFO[slug];
        return {
          id: slug, label: p.name,
          swatch: (
            <span style={{
              width: 14, height: 14, borderRadius: 3,
              background: p.bg, color: p.color,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
            }}>{p.letter}</span>
          ),
          items: sortedIssues.filter((i) => i.project === slug),
        };
      });
    }
    // assignee — alphabetical, also sort-independent
    const names = Array.from(new Set(filteredIssues.map((i) => i.assignee))).sort();
    return names.map<Group>((n) => ({
      id: n, label: n,
      swatch: <Avatar name={n} size={16} />,
      items: sortedIssues.filter((i) => i.assignee === n),
    }));
  }, [groupBy, filteredIssues, sortedIssues]);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={props.breadcrumbs} />

      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{props.pageTitle}</h1>
          <span className="pill" style={{ background: 'var(--bg-muted)' }}>
            <span className="tnum">{visibleIssues.length}</span>
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0', maxWidth: 720 }}>
          {props.pageDescription}
        </p>
      </div>

      <Toolbar
        right={
          <>
            <GroupSelect value={groupBy} onChange={setGroupBy} />
            <ColumnsMenu layout={layout} onLayoutChange={setLayout} />
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
          activeTypes={filters.map((f) => f.type)}
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
        {groups.length === 0 && (
          <EmptyState
            icon="list"
            title="No issues match these filters"
            description="Adjust the filters above or change the grouping to see something here."
          />
        )}
        {groups.map((g) => {
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
        })}
      </div>
    </div>
  );
}

/**
 * Sticky column-headers row for the workspace issue lists. Mirrors the
 * `gridTemplateColumns` used by ListRow so the labels line up with the cells
 * below. Each data cell:
 *   • is `draggable` — drop on another header to reorder columns
 *   • renders a thin drag handle on its right edge to resize the column
 * Both widths and order persist via `useColumnLayout`.
 */
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

  // Render data-column headers in the user's chosen order, hiding `project`
  // when the rows are grouped by project anyway, plus any columns the user
  // has hidden via the Columns menu.
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
      {/* Spacer — kept empty; absorbs leftover viewport width. */}
      <span aria-hidden="true" />
    </div>
  );
}

const headerCellStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 600, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: 0.5,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  pointerEvents: 'none', // so drag/click events hit the parent
};

interface HeaderCellProps {
  label: string;
  colId: ColumnId;
  sortable: boolean;
  sortDir: 'asc' | 'desc' | null;
  /** Position in the sort stack (1-indexed) when 2+ columns are sorted. */
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
        // Native drag is auto-suppressed on draggable=false elements. Click is
        // also stopped here so resizing the column doesn't trigger a sort.
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

// ----- Columns menu -----

function ColumnsMenu({
  layout, onLayoutChange,
}: { layout: ColumnLayout; onLayoutChange: (next: ColumnLayout) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visibleCount = ALL_COLUMNS.filter((c) => layout.visible[c]).length;
  const isLastVisible = (id: ColumnId) => visibleCount === 1 && layout.visible[id];

  const toggle = (id: ColumnId) => {
    if (isLastVisible(id)) return; // never let the user hide all columns
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
          {visibleCount}/{ALL_COLUMNS.length}
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
          <div style={{
            padding: '8px 12px', borderBottom: '1px solid var(--border-muted)',
            fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>Display columns</div>
          <div style={{ padding: 4 }}>
            {ALL_COLUMNS.map((id) => {
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

function GroupSelect({ value, onChange }: { value: GroupKey; onChange: (v: GroupKey) => void }) {
  return (
    <label className="btn btn-sm" style={{ paddingRight: 4, cursor: 'pointer' }}>
      <Icon name="layers" size={13} />
      Group:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as GroupKey)}
        style={{
          appearance: 'none', border: 'none', background: 'transparent',
          fontSize: 12, fontWeight: 600, color: 'var(--fg)',
          padding: '0 2px', cursor: 'pointer', outline: 'none',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <option value="status">Status</option>
        <option value="project">Project</option>
        <option value="assignee">Assignee</option>
      </select>
      <Icon name="chevronDown" size={11} color="var(--fg-faint)" />
    </label>
  );
}

// --- Two thin pages on top of the shared view ---

export function MyIssuesPage() {
  return (
    <WorkspaceIssuesView
      breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        'My issues',
      ]}
      pageTitle="My issues"
      pageDescription="Issues assigned to you across every project in this workspace."
      defaultGroup="status"
      // Locked "Assignee: Me" — defines the page; user can layer more filters on top.
      initialFilters={[{
        id: 'me', type: 'assignee', values: [CURRENT_USER.name], locked: true,
      }]}
    />
  );
}

export function AllIssuesPage() {
  return (
    <WorkspaceIssuesView
      breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        'All issues',
      ]}
      pageTitle="All issues"
      pageDescription="Every issue across every project. Group, filter, and bulk-edit from here."
      defaultGroup="project"
      initialFilters={[]}
    />
  );
}
