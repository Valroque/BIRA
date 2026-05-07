// Generic, reusable table — used wherever a non-issue page needs a sortable,
// optionally-grouped, optionally-row-as-link table. Issues use the dedicated
// `IssuesTable` (filters + gantt + column layout persistence make sharing
// impractical); everything else (projects, teams, members, …) should reach
// for this component.
//
// The API is intentionally narrow:
//   - `columns` declares header label, render fn, sort accessor, and grid
//     track width. Tracks accept `'1fr'`, `'minmax(160px, 1fr)'`, or a number.
//   - Pass `rows` for a flat list, OR `groups` for a grouped table. The two
//     are mutually exclusive — if both are passed, groups wins.
//   - `rowHref(row)` makes each row a `<Link>`; otherwise rows are plain
//     `<div>`s.
//   - Header-click sort is built in; pass `defaultSort` for an initial sort.
//     Groups are *order-stable* — sort applies within each group only.

import {
  Fragment, useMemo, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './icons';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  /** Grid track width — number (px), or any valid grid-template-columns value. Default `'1fr'`. */
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Value used by header-click sort. Strings sort case-insensitively, numbers numerically. */
  sortValue?: (row: T) => string | number | null | undefined;
}

export interface DataTableGroup<T> {
  id: string;
  label: ReactNode;
  rows: T[];
  /** Render the group at reduced opacity — e.g. archived projects. */
  dim?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows?: T[];
  groups?: DataTableGroup<T>[];
  rowKey: (row: T) => string;
  /** When set, rows render as `<Link to={…}>` and pick up hover styling. */
  rowHref?: (row: T) => string;
  emptyState?: ReactNode;
  defaultSort?: { columnId: string; dir: 'asc' | 'desc' };
  /** Optional className on the outer wrapper. */
  className?: string;
}

interface SortState {
  columnId: string;
  dir: 'asc' | 'desc';
}

function trackFor(width: DataTableColumn<unknown>['width']): string {
  if (width == null) return '1fr';
  if (typeof width === 'number') return `${width}px`;
  return width;
}

function compareSortable(a: unknown, b: unknown): number {
  // Nulls / undefineds sort to the end regardless of direction. They're
  // "missing data," not a value the user wants to scroll past first.
  const aNil = a == null;
  const bNil = b == null;
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable<T>({
  columns, rows, groups, rowKey, rowHref, emptyState, defaultSort, className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);

  const gridTemplate = useMemo(
    () => columns.map((c) => trackFor(c.width)).join(' '),
    [columns],
  );

  const sortColumn = sort ? columns.find((c) => c.id === sort.columnId) ?? null : null;
  const sortRows = (input: T[]): T[] => {
    if (!sort || !sortColumn?.sortValue) return input;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...input].sort((a, b) => dir * compareSortable(sortColumn.sortValue!(a), sortColumn.sortValue!(b)));
  };

  const onHeaderClick = (col: DataTableColumn<T>) => {
    if (!col.sortable || !col.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.columnId !== col.id) return { columnId: col.id, dir: 'asc' };
      if (prev.dir === 'asc') return { columnId: col.id, dir: 'desc' };
      return null; // third click clears
    });
  };

  // Resolve into the unified group form so the renderer has one path.
  const resolvedGroups: DataTableGroup<T>[] = groups
    ?? (rows != null ? [{ id: '__all__', label: null, rows }] : []);

  const totalRows = resolvedGroups.reduce((n, g) => n + g.rows.length, 0);
  if (totalRows === 0 && emptyState) {
    return (
      <div
        className={className}
        style={{
          border: '1px solid var(--border-muted)', borderRadius: 8,
          background: 'var(--bg)',
        }}
      >
        <Header columns={columns} gridTemplate={gridTemplate} sort={sort} onHeaderClick={onHeaderClick} />
        <div style={{ padding: 32 }}>{emptyState}</div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--border-muted)', borderRadius: 8,
        background: 'var(--bg)', overflow: 'hidden',
      }}
    >
      <Header columns={columns} gridTemplate={gridTemplate} sort={sort} onHeaderClick={onHeaderClick} />
      {resolvedGroups.map((group, gi) => {
        const sorted = sortRows(group.rows);
        const showHeader = group.label != null && (resolvedGroups.length > 1 || groups != null);
        return (
          <Fragment key={group.id}>
            {showHeader && (
              <div
                style={{
                  padding: '8px 16px',
                  background: 'var(--bg-subtle)',
                  borderTop: gi === 0 ? 'none' : '1px solid var(--border-muted)',
                  borderBottom: '1px solid var(--border-muted)',
                  fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
                  letterSpacing: 0.5, textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {group.label}
                <span className="tnum" style={{ color: 'var(--fg-faint)', fontWeight: 500 }}>
                  · {group.rows.length}
                </span>
              </div>
            )}
            <div style={{ opacity: group.dim ? 0.65 : 1 }}>
              {sorted.map((row) => (
                <Row
                  key={rowKey(row)}
                  row={row}
                  columns={columns}
                  gridTemplate={gridTemplate}
                  href={rowHref?.(row)}
                />
              ))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

interface HeaderProps<T> {
  columns: DataTableColumn<T>[];
  gridTemplate: string;
  sort: SortState | null;
  onHeaderClick: (col: DataTableColumn<T>) => void;
}
function Header<T>({ columns, gridTemplate, sort, onHeaderClick }: HeaderProps<T>) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        gap: 12, alignItems: 'center', padding: '10px 16px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 1,
      }}
    >
      {columns.map((col) => {
        const isSortable = !!(col.sortable && col.sortValue);
        const isSorted = sort?.columnId === col.id;
        const dir = isSorted ? sort!.dir : null;
        return (
          <span
            key={col.id}
            onClick={isSortable ? () => onHeaderClick(col) : undefined}
            style={{
              ...headerCellStyle,
              justifyContent: alignToJustify(col.align),
              cursor: isSortable ? 'pointer' : 'default',
              color: isSorted ? 'var(--accent-active)' : 'var(--fg-muted)',
              userSelect: 'none',
            }}
            title={isSortable ? 'Click to sort' : undefined}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {col.header}
            </span>
            {isSorted && (
              <Icon
                name={dir === 'asc' ? 'chevronUp' : 'chevronDown'}
                size={11}
                color="var(--accent)"
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

interface RowProps<T> {
  row: T;
  columns: DataTableColumn<T>[];
  gridTemplate: string;
  href?: string;
}
function Row<T>({ row, columns, gridTemplate, href }: RowProps<T>) {
  const inner = columns.map((col) => (
    <span
      key={col.id}
      style={{
        display: 'flex', alignItems: 'center',
        justifyContent: alignToJustify(col.align),
        minWidth: 0, fontSize: 13, color: 'var(--fg)',
      }}
    >
      {col.render(row)}
    </span>
  ));

  const baseStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    gap: 12, alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-muted)',
    textDecoration: 'none', color: 'inherit',
    transition: 'background .08s',
  };

  if (href) {
    return (
      <Link
        to={href}
        style={baseStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {inner}
      </Link>
    );
  }
  return <div style={baseStyle}>{inner}</div>;
}

const headerCellStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  fontSize: 10.5, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 0.5,
  minWidth: 0,
};

function alignToJustify(align: DataTableColumn<unknown>['align']): CSSProperties['justifyContent'] {
  if (align === 'right') return 'flex-end';
  if (align === 'center') return 'center';
  return 'flex-start';
}
