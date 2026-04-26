// Multi-select filter chips + "Add filter" picker for the workspace issue
// lists. Each chip owns its own popover; the parent owns the filter array
// and applies it via `applyFilters`.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { Avatar, StatusDot, STATUSES } from './shell';
import { useDismiss } from './use-dismiss';
import { ProjectBadge } from './project-chip';
import {
  CURRENT_USER, ISSUES, type Issue, type Project,
} from '../fixtures';
import { useProjects } from '../state/projects';

export type FilterType = 'status' | 'project' | 'assignee' | 'label' | 'priority' | 'type';

export interface Filter {
  id: string;
  type: FilterType;
  /** Raw values matched against the corresponding issue field. Empty = "Any" (no-op). */
  values: string[];
  /** When true, the chip is non-interactive — the page semantics depend on this filter (e.g. "My Issues"). */
  locked?: boolean;
}

let _filterIdSeq = 0;
export const newFilterId = () => `f${++_filterIdSeq}`;

export function matchFilter(f: Filter, issue: Issue): boolean {
  if (f.values.length === 0) return true;
  switch (f.type) {
    case 'status':   return f.values.includes(issue.status);
    case 'project':  return f.values.includes(issue.project);
    case 'assignee': return f.values.includes(issue.assignee);
    case 'label':    return issue.labels.some((l) => f.values.includes(l));
    case 'priority': return f.values.includes(issue.priority);
    case 'type':     return f.values.includes(issue.type);
  }
}

export function applyFilters(issues: Issue[], filters: Filter[]): Issue[] {
  if (filters.length === 0) return issues;
  return issues.filter((i) => filters.every((f) => matchFilter(f, i)));
}

// ----- Filter type metadata + per-type option lists -----

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

const TYPE_LABELS: Record<string, string> = {
  T: 'Task', B: 'Bug', S: 'Story', E: 'Epic',
};

interface Option {
  value: string;
  label: ReactNode;
  /** Plain searchable text — `label` may include JSX, so use this for filtering by typed query. */
  searchText: string;
}

interface FilterDef {
  type: FilterType;
  label: string;
  icon: string;
  options: () => Option[];
  /** Compact representation of one selected value for the chip preview. */
  renderValue: (value: string) => ReactNode;
}

export const FILTER_DEFS: Record<FilterType, FilterDef> = {
  status: {
    type: 'status', label: 'Status', icon: 'circle',
    options: () => STATUSES.map((s) => ({
      value: s.id,
      searchText: s.name,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={s.id} size={10} />{s.name}
        </span>
      ),
    })),
    renderValue: (v) => STATUSES.find((s) => s.id === v)?.name ?? v,
  },
  project: {
    // Project options are computed per render by `FilterChip` so newly-created
    // projects show up automatically. The empty list here is just a fallback.
    type: 'project', label: 'Project', icon: 'folder',
    options: () => [],
    renderValue: (v) => v,
  },
  assignee: {
    type: 'assignee', label: 'Assignee', icon: 'user',
    options: () => Array.from(new Set(ISSUES.map((i) => i.assignee))).sort().map((a) => ({
      value: a,
      searchText: a,
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Avatar name={a} size={18} />{a}
        </span>
      ),
    })),
    renderValue: (v) => v,
  },
  label: {
    type: 'label', label: 'Label', icon: 'tag',
    options: () => Array.from(new Set(ISSUES.flatMap((i) => i.labels))).sort().map((l) => ({
      value: l, searchText: l,
      label: (
        <span style={{
          display: 'inline-block', padding: '1px 6px', borderRadius: 3,
          background: 'var(--bg-muted)', color: 'var(--fg-muted)', fontSize: 11.5,
        }}>{l}</span>
      ),
    })),
    renderValue: (v) => v,
  },
  priority: {
    type: 'priority', label: 'Priority', icon: 'flag',
    options: () => ['urgent', 'high', 'med', 'low', 'none'].map((p) => ({
      value: p, searchText: PRIORITY_LABELS[p],
      label: PRIORITY_LABELS[p],
    })),
    renderValue: (v) => PRIORITY_LABELS[v] ?? v,
  },
  type: {
    type: 'type', label: 'Type', icon: 'diamond',
    options: () => ['T', 'B', 'S', 'E'].map((t) => ({
      value: t, searchText: TYPE_LABELS[t],
      label: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className={`tchip tchip-${t}`} style={{ width: 18, height: 18, fontSize: 10 }}>{t}</span>
          {TYPE_LABELS[t]}
        </span>
      ),
    })),
    renderValue: (v) => TYPE_LABELS[v] ?? v,
  },
};

const ALL_FILTER_TYPES: FilterType[] = ['status', 'project', 'assignee', 'label', 'priority', 'type'];

/** Build the option list for the project filter from the live projects list. */
function projectFilterOptions(projects: Project[]): Option[] {
  return projects.map((p) => ({
    value: p.slug,
    searchText: p.name,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ProjectBadge project={p} />
        {p.name}
      </span>
    ),
  }));
}

// ===========================================================================
// Sort
// ===========================================================================

export type SortField =
  | 'priority' | 'status' | 'updated' | 'title' | 'id' | 'assignee' | 'type' | 'project';
export type SortDir = 'asc' | 'desc';

export interface Sort { field: SortField; dir: SortDir; }

export const SORT_LABELS: Record<SortField, string> = {
  priority: 'Priority',
  status: 'Status',
  updated: 'Updated',
  title: 'Title',
  id: 'ID',
  assignee: 'Assignee',
  type: 'Type',
  project: 'Project',
};

export const SORT_ICONS: Record<SortField, string> = {
  priority: 'flag',
  status: 'circle',
  updated: 'clock',
  title: 'list',
  id: 'hash',
  assignee: 'user',
  type: 'diamond',
  project: 'folder',
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, med: 2, low: 3, none: 4 };
const STATUS_RANK: Record<string, number> = {
  backlog: 0, todo: 1, 'in-progress': 2, 'in-review': 3, done: 4, canceled: 5,
};
const TYPE_RANK: Record<string, number> = { T: 0, B: 1, S: 2, E: 3 };

/** Parse a fixture "updated" string like "2h ago" / "yesterday" / "1w ago"
 * into a coarse minutes-ago number. Lower = more recent. */
function freshnessMinutes(updated: string): number {
  const u = updated.toLowerCase().trim();
  if (u === 'just now') return 0;
  const mMin = u.match(/^(\d+)\s*min/);
  if (mMin) return parseInt(mMin[1], 10);
  const mH = u.match(/^(\d+)h/);
  if (mH) return parseInt(mH[1], 10) * 60;
  if (u.startsWith('yesterday')) return 24 * 60;
  const mD = u.match(/^(\d+)d/);
  if (mD) return parseInt(mD[1], 10) * 24 * 60;
  const mW = u.match(/^(\d+)w/);
  if (mW) return parseInt(mW[1], 10) * 7 * 24 * 60;
  return Number.MAX_SAFE_INTEGER; // unknown formats sort to the end
}

/**
 * Build a comparator for one field + direction. IMPORTANT: returns 0 when the
 * compared field is equal — the *stack* is responsible for falling through to
 * the next criterion. (An earlier version used issue id as a per-field stable
 * key, which made the first comparator always decisive and broke stacking.)
 */
export function makeComparator(field: SortField, dir: SortDir) {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: Issue, b: Issue): number => {
    let cmp = 0;
    switch (field) {
      case 'priority':
        cmp = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
        break;
      case 'status':
        cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
        break;
      case 'updated':
        cmp = freshnessMinutes(a.updated) - freshnessMinutes(b.updated);
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'id': {
        const an = parseInt(a.id.split('-')[1] ?? '0', 10);
        const bn = parseInt(b.id.split('-')[1] ?? '0', 10);
        cmp = an - bn;
        break;
      }
      case 'assignee':
        cmp = a.assignee.localeCompare(b.assignee);
        break;
      case 'type':
        cmp = (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99);
        break;
      case 'project':
        cmp = a.project.localeCompare(b.project);
        break;
    }
    return sign * cmp;
  };
}

/**
 * Maps a column id to its corresponding sort field, or null when sorting from
 * the header doesn't make sense (e.g. multi-valued `labels`). The cell click
 * handlers in `TableHeader` use this to decide whether a header is sortable.
 */
export const COLUMN_SORT_FIELD: Record<string, SortField | null> = {
  id: 'id',
  priority: 'priority',
  project: 'project',
  title: 'title',
  status: 'status',
  labels: null,
  updated: 'updated',
  assignee: 'assignee',
};

/**
 * Apply a stack of sort criteria. The stack acts as primary → secondary →
 * tertiary sort: each criterion only matters when all earlier ones tie. Issue
 * id is the final tiebreaker so the order is fully deterministic. Empty stack
 * = no sort (preserves the input order).
 */
export function applySortStack(issues: Issue[], stack: Sort[]): Issue[] {
  if (stack.length === 0) return issues;
  return [...issues].sort((a, b) => {
    for (const s of stack) {
      const c = makeComparator(s.field, s.dir)(a, b);
      if (c !== 0) return c;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Header-click sort cycle: not-sorted → asc → desc → not-sorted again.
 * Newly-sorted columns push onto the end of the stack so they act as
 * secondary criteria, exactly the way the user described.
 */
export function cycleSort(stack: Sort[], field: SortField): Sort[] {
  const idx = stack.findIndex((s) => s.field === field);
  if (idx < 0) return [...stack, { field, dir: 'asc' }];
  const current = stack[idx];
  if (current.dir === 'asc') {
    const next = [...stack];
    next[idx] = { field, dir: 'desc' };
    return next;
  }
  return stack.filter((s) => s.field !== field);
}

// ----- Filter chip -----

interface FilterChipProps {
  filter: Filter;
  onChange: (next: Filter) => void;
  onRemove?: () => void;
}

export function FilterChip({ filter, onChange, onRemove }: FilterChipProps) {
  const def = FILTER_DEFS[filter.type];
  const { projects } = useProjects();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  // Project options are derived from the live projects list; everything else
  // uses the static def. `renderValue` for the chip preview follows the same
  // pattern so newly-added projects render with the right name + chip.
  const options = useMemo(() => {
    if (filter.type === 'project') return projectFilterOptions(projects);
    return def.options();
  }, [def, filter.type, projects]);
  const renderValue = filter.type === 'project'
    ? (v: string) => projects.find((p) => p.slug === v)?.name ?? v
    : def.renderValue;
  const filteredOptions = !search.trim()
    ? options
    : options.filter((o) => o.searchText.toLowerCase().includes(search.toLowerCase()));

  const toggle = (v: string) => {
    const next = filter.values.includes(v)
      ? filter.values.filter((x) => x !== v)
      : [...filter.values, v];
    onChange({ ...filter, values: next });
  };
  const clear = () => onChange({ ...filter, values: [] });

  const activeCount = filter.values.length;
  const valuePreview: ReactNode = activeCount === 0
    ? <span style={{ color: 'var(--fg-muted)' }}>Any</span>
    : activeCount === 1
      ? <strong>{renderValue(filter.values[0])}</strong>
      : (
        <span>
          <strong>{renderValue(filter.values[0])}</strong>
          <span style={{ marginLeft: 4, color: 'var(--fg-muted)' }}>+{activeCount - 1}</span>
        </span>
      );

  const isActive = activeCount > 0;
  const interactive = !filter.locked;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
          padding: interactive && onRemove ? '0 2px 0 8px' : '0 8px',
          border: '1px solid var(--border)', borderRadius: 4,
          background: isActive ? 'var(--accent-subtle)' : 'var(--bg)',
          fontSize: 12, color: 'var(--fg)',
        }}
      >
        <button
          type="button"
          onClick={() => interactive && setOpen((o) => !o)}
          disabled={!interactive}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', padding: 0,
            font: 'inherit', color: 'inherit',
            cursor: interactive ? 'pointer' : 'default',
          }}
        >
          <Icon name={def.icon} size={11} color={isActive ? 'var(--accent)' : 'var(--fg-faint)'} />
          {def.label}:
          <span style={{ marginLeft: 3 }}>{valuePreview}</span>
          {interactive && <Icon name="chevronDown" size={10} color="var(--fg-faint)" style={{ marginLeft: 2 }} />}
        </button>
        {interactive && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            data-tip="Remove filter"
            style={{
              padding: 2, background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--fg-faint)',
              display: 'flex', alignItems: 'center',
            }}
          >
            <Icon name="x" size={11} />
          </button>
        )}
      </span>
      {open && interactive && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          minWidth: 260, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', zIndex: 30, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-muted)' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
                <Icon name="search" size={12} />
              </span>
              <input
                autoFocus
                className="input input-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Filter ${def.label.toLowerCase()}…`}
                style={{ paddingLeft: 26 }}
              />
            </div>
          </div>
          {filter.type === 'assignee' && (
            <div style={{
              padding: '6px 8px', borderBottom: '1px solid var(--border-muted)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <button
                type="button"
                onClick={() => toggle(CURRENT_USER.name)}
                className="btn btn-sm"
                data-tip={CURRENT_USER.name}
                style={{
                  height: 24, padding: '0 8px 0 4px', gap: 5,
                  background: filter.values.includes(CURRENT_USER.name) ? 'var(--accent-subtle)' : 'var(--bg)',
                  borderColor: filter.values.includes(CURRENT_USER.name) ? 'var(--accent)' : 'var(--border)',
                  color: filter.values.includes(CURRENT_USER.name) ? 'var(--accent-active)' : 'var(--fg)',
                  fontWeight: filter.values.includes(CURRENT_USER.name) ? 600 : 500,
                }}
              >
                <Avatar name={CURRENT_USER.name} size={16} />
                Me
              </button>
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>quick pick</span>
            </div>
          )}
          <div className="scroll" style={{ maxHeight: 280, overflow: 'auto', padding: 4 }}>
            {filteredOptions.map((opt) => {
              const checked = filter.values.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <input type="checkbox" className="cb" checked={checked} onChange={() => toggle(opt.value)} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
            {filteredOptions.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
                No matches.
              </div>
            )}
          </div>
          <div style={{
            padding: '6px 10px', borderTop: '1px solid var(--border-muted)',
            display: 'flex', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
              {activeCount} of {options.length} selected
            </span>
            <div style={{ flex: 1 }} />
            {activeCount > 0 && (
              <button onClick={clear} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- Add filter button -----

interface AddFilterButtonProps {
  activeTypes: FilterType[];
  onAdd: (type: FilterType) => void;
}

export function AddFilterButton({ activeTypes, onAdd }: AddFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const available = ALL_FILTER_TYPES.filter((t) => !activeTypes.includes(t));

  if (available.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--fg-faint)' }}
      >
        <Icon name="plus" size={12} />Add filter
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          minWidth: 200, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', zIndex: 30, overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 11, fontWeight: 600,
            color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.4,
          }}>Filter by</div>
          {available.map((type) => {
            const def = FILTER_DEFS[type];
            return (
              <button
                key={type}
                onClick={() => { onAdd(type); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', width: '100%', border: 'none',
                  cursor: 'pointer', background: 'transparent',
                  textAlign: 'left', fontSize: 13, color: 'var(--fg)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name={def.icon} size={13} color="var(--fg-muted)" />
                {def.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
