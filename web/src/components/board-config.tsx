// Per-project board column configuration. Each column has a custom title and
// owns one or more statuses; the board renders the union of issues across the
// column's statuses. Persisted to localStorage so demos survive a refresh.
//
// A status can live in at most one column at a time (otherwise issues would
// duplicate across columns). Statuses that aren't in any column are hidden
// from the board — surfaced as a small warning in the config panel.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from './icons';
import { STATUSES, StatusDot, type StatusId } from './shell';
import { StatusPill } from './status-pill';

export interface BoardColumn {
  id: string;
  title: string;
  statuses: StatusId[];
}

export type GroupBy = 'none' | 'assignee' | 'priority' | 'type' | 'label';

export const GROUP_BY_OPTIONS: { id: GroupBy; label: string; icon: string }[] = [
  { id: 'none', label: 'None', icon: 'layers' },
  { id: 'assignee', label: 'Assignee', icon: 'user' },
  { id: 'priority', label: 'Priority', icon: 'flag' },
  { id: 'type', label: 'Type', icon: 'diamond' },
  { id: 'label', label: 'Label', icon: 'tag' },
];

const VALID_GROUP_BYS = new Set<GroupBy>(GROUP_BY_OPTIONS.map((g) => g.id));

export interface BoardConfig {
  columns: BoardColumn[];
  groupBy: GroupBy;
}

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export function defaultBoardConfig(): BoardConfig {
  return {
    columns: [
      { id: newId(), title: 'Backlog', statuses: ['backlog'] },
      { id: newId(), title: 'Todo', statuses: ['todo'] },
      { id: newId(), title: 'In Progress', statuses: ['in-progress'] },
      { id: newId(), title: 'In Review', statuses: ['in-review'] },
      // Demonstrates the grouped-column feature out of the box.
      { id: newId(), title: 'Closed', statuses: ['done', 'canceled'] },
    ],
    groupBy: 'none',
  };
}

const storageKey = (tenant: string, workspace: string, project: string) =>
  `bira:board-columns:${tenant}:${workspace}:${project}`;

function loadConfig(tenant: string, workspace: string, project: string): BoardConfig {
  try {
    const raw = localStorage.getItem(storageKey(tenant, workspace, project));
    if (!raw) return defaultBoardConfig();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.columns)) return defaultBoardConfig();
    // Filter out unknown statuses defensively in case the status set has changed.
    const allStatusIds = new Set(STATUSES.map((s) => s.id));
    const cleaned: BoardConfig = {
      columns: parsed.columns
        .filter((c: BoardColumn) => c && typeof c.id === 'string' && Array.isArray(c.statuses))
        .map((c: BoardColumn) => ({
          id: c.id,
          title: typeof c.title === 'string' ? c.title : 'Untitled',
          statuses: c.statuses.filter((s: string): s is StatusId => allStatusIds.has(s as StatusId)),
        })),
      groupBy: VALID_GROUP_BYS.has(parsed.groupBy) ? parsed.groupBy : 'none',
    };
    return cleaned.columns.length ? cleaned : defaultBoardConfig();
  } catch {
    return defaultBoardConfig();
  }
}

export function useBoardConfig(tenant: string, workspace: string, project: string) {
  const [config, setConfig] = useState<BoardConfig>(() => loadConfig(tenant, workspace, project));

  // Reload when navigating between projects/workspaces/tenants.
  useEffect(() => {
    setConfig(loadConfig(tenant, workspace, project));
  }, [tenant, workspace, project]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(tenant, workspace, project), JSON.stringify(config));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [tenant, workspace, project, config]);

  const reset = useCallback(() => setConfig(defaultBoardConfig()), []);

  return { config, setConfig, reset };
}

// ---------------------------------------------------------------------------
// Configuration panel UI

interface PanelProps {
  config: BoardConfig;
  onChange: (next: BoardConfig) => void;
  onReset: () => void;
  onClose: () => void;
}

export function BoardConfigPanel({ config, onChange, onReset, onClose }: PanelProps) {
  const assignedStatuses = new Set<StatusId>(config.columns.flatMap((c) => c.statuses));
  const unassigned = STATUSES.filter((s) => !assignedStatuses.has(s.id));

  const updateColumn = (id: string, patch: Partial<BoardColumn>) =>
    onChange({
      ...config,
      columns: config.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

  // Move `status` to `targetColumnId`, removing it from any other column it's in.
  const assignStatus = (status: StatusId, targetColumnId: string) =>
    onChange({
      ...config,
      columns: config.columns.map((c) => {
        const without = c.statuses.filter((s) => s !== status);
        return c.id === targetColumnId
          ? { ...c, statuses: [...without, status] }
          : { ...c, statuses: without };
      }),
    });

  const removeStatusFromColumn = (status: StatusId, columnId: string) =>
    onChange({
      ...config,
      columns: config.columns.map((c) =>
        c.id === columnId ? { ...c, statuses: c.statuses.filter((s) => s !== status) } : c,
      ),
    });

  const moveColumn = (id: string, direction: -1 | 1) => {
    const idx = config.columns.findIndex((c) => c.id === id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= config.columns.length) return;
    const next = [...config.columns];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onChange({ ...config, columns: next });
  };

  const removeColumn = (id: string) => {
    if (config.columns.length <= 1) return;
    onChange({ ...config, columns: config.columns.filter((c) => c.id !== id) });
  };

  const addColumn = () =>
    onChange({
      ...config,
      columns: [...config.columns, { id: newId(), title: 'New column', statuses: [] }],
    });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.18)', zIndex: 50,
        }}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Configure board columns"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, zIndex: 51,
          background: 'var(--bg)', borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 32px rgba(15,23,42,.12)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="board" size={14} color="var(--fg-muted)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Configure columns</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            data-tip="Close"
            style={{ width: 26, padding: 0 }}
          >
            <Icon name="x" size={13} />
          </button>
        </header>

        <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>
            Group multiple statuses into a single column. Each status can live in
            one column at a time. Changes apply live and are saved to your browser.
          </p>

          {config.columns.map((col, idx) => (
            <ColumnEditor
              key={col.id}
              column={col}
              index={idx}
              total={config.columns.length}
              onTitleChange={(title) => updateColumn(col.id, { title })}
              onRemoveStatus={(s) => removeStatusFromColumn(s, col.id)}
              onAssignStatus={(s) => assignStatus(s, col.id)}
              onMoveUp={() => moveColumn(col.id, -1)}
              onMoveDown={() => moveColumn(col.id, 1)}
              onDelete={() => removeColumn(col.id)}
            />
          ))}

          <button
            type="button"
            onClick={addColumn}
            className="btn btn-sm"
            style={{
              width: '100%', justifyContent: 'center', gap: 6,
              borderStyle: 'dashed', color: 'var(--fg-muted)',
            }}
          >
            <Icon name="plus" size={13} /> Add column
          </button>

          {unassigned.length > 0 && (
            <div style={{
              marginTop: 16, padding: '10px 12px', borderRadius: 6,
              background: '#fef3c7', border: '1px solid #fde68a',
              fontSize: 12, color: '#854d0e',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                <Icon name="alert" size={12} /> {unassigned.length} {unassigned.length === 1 ? 'status is' : 'statuses are'} not on the board
              </div>
              <div style={{ marginBottom: 6 }}>
                Issues in {unassigned.length === 1 ? 'this status' : 'these statuses'} won't appear until added to a column.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {unassigned.map((s) => (
                  <StatusPill key={s.id} status={s.id} />
                ))}
              </div>
            </div>
          )}
        </div>

        <footer style={{
          padding: '10px 16px', borderTop: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button
            type="button"
            onClick={onReset}
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--fg-muted)' }}
          >
            <Icon name="rotate" size={12} /> Reset to defaults
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} className="btn btn-primary btn-sm">Done</button>
        </footer>
      </aside>
    </>
  );
}

interface ColumnEditorProps {
  column: BoardColumn;
  index: number;
  total: number;
  onTitleChange: (title: string) => void;
  onRemoveStatus: (status: StatusId) => void;
  onAssignStatus: (status: StatusId) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}
function ColumnEditor({
  column, index, total,
  onTitleChange, onRemoveStatus, onAssignStatus,
  onMoveUp, onMoveDown, onDelete,
}: ColumnEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const usedHere = new Set(column.statuses);

  return (
    <div style={{
      marginBottom: 10, padding: 10, borderRadius: 8,
      border: '1px solid var(--border-muted)', background: 'var(--bg-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <input
          value={column.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Column title"
          style={{
            flex: 1, border: '1px solid transparent', background: 'transparent',
            padding: '4px 6px', borderRadius: 4, fontSize: 13, fontWeight: 600,
            color: 'var(--fg)', outline: 'none', fontFamily: 'inherit',
            minWidth: 0,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
        />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="btn btn-ghost btn-sm"
          data-tip="Move up"
          style={{ width: 22, padding: 0, opacity: index === 0 ? 0.35 : 1 }}
        >
          <Icon name="chevronUp" size={12} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="btn btn-ghost btn-sm"
          data-tip="Move down"
          style={{ width: 22, padding: 0, opacity: index === total - 1 ? 0.35 : 1 }}
        >
          <Icon name="chevronDown" size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={total === 1}
          className="btn btn-ghost btn-sm"
          data-tip="Remove column"
          style={{ width: 22, padding: 0, color: 'var(--blocked)', opacity: total === 1 ? 0.35 : 1 }}
        >
          <Icon name="trash" size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', position: 'relative' }}>
        {column.statuses.length === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
            No statuses assigned
          </span>
        )}
        {column.statuses.map((s) => {
          const meta = STATUSES.find((x) => x.id === s);
          if (!meta) return null;
          return (
            <StatusPill
              key={s}
              status={s}
              trailing={
                <button
                  type="button"
                  onClick={() => onRemoveStatus(s)}
                  aria-label={`Remove ${meta.name}`}
                  style={{
                    background: 'transparent', border: 'none', padding: 0, marginLeft: 2,
                    cursor: 'pointer', color: 'inherit', opacity: 0.6,
                    display: 'inline-flex', alignItems: 'center',
                  }}
                >
                  <Icon name="x" size={10} />
                </button>
              }
            />
          );
        })}
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="btn btn-ghost btn-sm"
          style={{
            height: 22, padding: '0 6px', fontSize: 11.5,
            color: 'var(--fg-muted)', borderStyle: 'dashed',
          }}
        >
          <Icon name="plus" size={11} /> Status
        </button>

        {pickerOpen && (
          <StatusPicker
            excluded={usedHere}
            onPick={(s) => { onAssignStatus(s); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function StatusPicker({
  excluded, onPick, onClose,
}: {
  excluded: Set<StatusId>;
  onPick: (s: StatusId) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
      <div
        style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 61,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: 'var(--shadow-md)', minWidth: 180, padding: 4,
        }}
      >
        {STATUSES.map((s) => {
          const isHere = excluded.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => !isHere && onPick(s.id)}
              disabled={isHere}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '6px 8px', border: 'none', borderRadius: 4,
                background: 'transparent', cursor: isHere ? 'default' : 'pointer',
                color: 'var(--fg)', fontSize: 12.5, textAlign: 'left',
                opacity: isHere ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (!isHere) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <StatusDot status={s.id} size={10} />
              <span>{s.name}</span>
              {isHere && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--fg-faint)' }}>in this column</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

