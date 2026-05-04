// Shared list-row layout. Used by /list, project overview, and the workspace-level
// My Issues / All Issues views. The link target always reflects `issue.project`
// so the row works regardless of which page is rendering it.
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Issue, Project } from '../fixtures';
import { useProjects } from '../state/projects';
import { Avatar, Priority as PriorityIcon, StatusDot, STATUSES, TypeChip } from './shell';
import { ProjectChip } from './project-chip';

// ---------------------------------------------------------------------------
// Shared layout (widths + order)
// ---------------------------------------------------------------------------
//
// Both the per-column width AND the order of data columns are user-adjustable
// and persist to localStorage. Multiple ListRow consumers and the workspace
// TableHeader share the same layout, kept in sync via a custom event.

export interface ColumnWidths {
  id: number;
  priority: number;
  project: number;
  title: number;
  status: number;
  labels: number;
  updated: number;
  assignee: number;
}

export type ColumnId = keyof ColumnWidths;

export const ALL_COLUMNS: ColumnId[] = ['id', 'priority', 'project', 'title', 'status', 'labels', 'updated', 'assignee'];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  id: 'ID',
  priority: 'Priority',
  project: 'Project',
  title: 'Title',
  status: 'Status',
  labels: 'Labels',
  updated: 'Updated',
  assignee: 'Assignee',
};

export const DEFAULT_WIDTHS: ColumnWidths = {
  id: 96, priority: 110, project: 110, title: 360, status: 140, labels: 160, updated: 90, assignee: 160,
};

export const MIN_WIDTHS: ColumnWidths = {
  id: 60, priority: 60, project: 70, title: 160, status: 80, labels: 60, updated: 60, assignee: 90,
};

export type ColumnVisibility = Record<ColumnId, boolean>;

export interface ColumnLayout {
  widths: ColumnWidths;
  order: ColumnId[];
  visible: ColumnVisibility;
}

const ALL_VISIBLE: ColumnVisibility = {
  id: true, priority: true, project: true, title: true, status: true, labels: true, updated: true, assignee: true,
};

export const DEFAULT_LAYOUT: ColumnLayout = {
  widths: DEFAULT_WIDTHS,
  order: [...ALL_COLUMNS],
  visible: { ...ALL_VISIBLE },
};

const STORAGE_KEY = 'bira:list-layout';
const SYNC_EVENT = 'bira:list-layout:changed';

/** Sanitise an order list — ensures every column appears exactly once. */
function normalizeOrder(order: unknown): ColumnId[] {
  const arr = Array.isArray(order) ? order.filter((x): x is ColumnId => ALL_COLUMNS.includes(x as ColumnId)) : [];
  for (const c of ALL_COLUMNS) if (!arr.includes(c)) arr.push(c);
  return arr;
}

export function loadLayout(): ColumnLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
      return {
        widths: { ...DEFAULT_WIDTHS, ...(parsed.widths ?? {}) },
        order: normalizeOrder(parsed.order),
        visible: { ...ALL_VISIBLE, ...(parsed.visible ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT;
}

export function saveLayout(layout: ColumnLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  } catch { /* ignore */ }
}

/**
 * Hook: read + write column layout, kept in sync across components in the
 * same tab (custom event) and across tabs (native `storage` event).
 */
export function useColumnLayout(): [ColumnLayout, (next: ColumnLayout) => void] {
  const [layout, setLayoutState] = useState<ColumnLayout>(loadLayout);

  useEffect(() => {
    const sync = () => setLayoutState(loadLayout());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setLayout = (next: ColumnLayout) => {
    setLayoutState(next);
    saveLayout(next);
  };
  return [layout, setLayout];
}

/**
 * Build a `grid-template-columns` value. Both `ListRow` and the workspace
 * `TableHeader` use this so headers and cells line up exactly.
 *
 * Layout:  cb · {visible data columns in `order`, project filtered if !showProject} · «1fr spacer»
 */
export function buildRowColumns(
  w: ColumnWidths,
  order: ColumnId[],
  visible: ColumnVisibility,
  showProject: boolean,
): string {
  const parts: string[] = ['24px']; // checkbox only — priority is now a real data column
  for (const id of order) {
    if (!visible[id]) continue;
    if (id === 'project' && !showProject) continue;
    if (id === 'title') {
      parts.push(`minmax(${MIN_WIDTHS.title}px, ${w.title}px)`);
    } else {
      parts.push(`${w[id]}px`);
    }
  }
  parts.push('1fr'); // spacer
  return parts.join(' ');
}

/** Pre-compute the set of columns to actually render in their final order. */
export function visibleColumns(
  order: ColumnId[],
  visible: ColumnVisibility,
  showProject: boolean,
): ColumnId[] {
  return order.filter((c) => visible[c] && (c !== 'project' || showProject));
}

// ---------------------------------------------------------------------------
// Cell renderers
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

function renderCell(
  colId: ColumnId,
  issue: Issue,
  showProject: boolean,
  project: Project | undefined,
): ReactNode {
  switch (colId) {
    case 'id': {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TypeChip type={issue.type} />
          <span className="mono tnum" style={{ fontSize: 11, color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {showProject ? issue.id : issue.id.split('-')[1]}
          </span>
        </span>
      );
    }
    case 'priority': {
      return (
        <span
          title={`Priority: ${PRIORITY_LABELS[issue.priority]}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, color: 'var(--fg-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          <PriorityIcon p={issue.priority} />
          {PRIORITY_LABELS[issue.priority]}
        </span>
      );
    }
    case 'project': {
      if (!project) {
        return (
          <span style={{ fontSize: 11, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
            {issue.project}
          </span>
        );
      }
      return (
        <ProjectChip
          project={project}
          style={{ alignSelf: 'center', justifySelf: 'start' }}
        />
      );
    }
    case 'title': {
      return (
        <span
          title={issue.title}
          style={{ fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
        >
          {issue.title}
        </span>
      );
    }
    case 'status': {
      const status = STATUSES.find((s) => s.id === issue.status);
      return (
        <span
          title={`Status: ${status?.name}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 11.5, color: 'var(--fg-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          <StatusDot status={issue.status} size={10} />
          {status?.name}
        </span>
      );
    }
    case 'labels': {
      return (
        <div style={{ display: 'flex', gap: 4, overflow: 'hidden', minWidth: 0 }}>
          {issue.labels.slice(0, 2).map((l) => (
            <span key={l} style={{
              padding: '1px 6px', borderRadius: 3,
              background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 11,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{l}</span>
          ))}
        </div>
      );
    }
    case 'updated': {
      return (
        <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }} className="tnum">
          {issue.updated}
        </span>
      );
    }
    case 'assignee': {
      return (
        <span title={issue.assignee} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={issue.assignee} size={20} />
          <span style={{ fontSize: 12.5, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {issue.assignee}
          </span>
        </span>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface ListRowProps {
  issue: Issue;
  tenant: string;
  workspace: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  /** When true, render the project chip and the full issue id (CMT-241) instead of just the number. */
  showProject?: boolean;
  /** Override the column order. Defaults to the persisted layout. */
  order?: ColumnId[];
  /** Override which columns are visible. Defaults to the persisted layout. */
  visible?: ColumnVisibility;
  /** Override the grid template. Defaults are computed from the persisted layout. */
  columns?: string;
}

export function ListRow(props: ListRowProps) {
  const { issue, tenant, workspace, selected, onToggleSelect, showProject, order, visible, columns } = props;
  // Always call the hook; props can override its values.
  const [layout] = useColumnLayout();
  const { getProject } = useProjects();
  const project = getProject(issue.project);
  const effectiveOrder = order ?? layout.order;
  const effectiveVisible = visible ?? layout.visible;
  const effectiveColumns = columns ?? buildRowColumns(layout.widths, effectiveOrder, effectiveVisible, !!showProject);

  const visibleOrder = visibleColumns(effectiveOrder, effectiveVisible, !!showProject);

  const stopAndToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(issue.id);
  };

  return (
    <Link
      to={`/${tenant}/${workspace}/${issue.project}/issue/${issue.id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: effectiveColumns,
        gap: 10, alignItems: 'center', padding: '0 16px', height: 36,
        borderBottom: '1px solid var(--border-muted)',
        background: selected ? 'var(--accent-subtle)' : 'transparent',
        cursor: 'pointer', textDecoration: 'none', color: 'inherit',
      }}
    >
      <input
        type="checkbox"
        className="cb"
        checked={!!selected}
        onChange={() => onToggleSelect?.(issue.id)}
        onClick={stopAndToggle}
        readOnly={!onToggleSelect}
      />
      {visibleOrder.map((colId) => (
        <CellWrapper key={colId}>{renderCell(colId, issue, !!showProject, project)}</CellWrapper>
      ))}
      <span aria-hidden="true" />
    </Link>
  );
}

/** Cells are rendered as direct children of the grid; this wrapper exists so
 *  React stable keys map cleanly to the grid columns. */
function CellWrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export type { CSSProperties };
