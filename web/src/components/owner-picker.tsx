// OwnerPicker — single picker that lets the user pick either a Person or a
// Team as the owner of an Issue. Mutual-exclusion is enforced at the BE
// layer (`assigneeUserId` and `teamId` cannot both be non-null), so the
// caller gets `(assigneeUserId, teamId)` back as a pair on every commit
// and is expected to forward both fields in a single write — picking a
// person sends `{ assigneeUserId: <id>, teamId: null }`, picking a team
// sends `{ teamId: <id>, assigneeUserId: null }`, "Unassign" sends both
// null. The BE auto-clears the other side, but writing both keeps the
// optimistic state consistent with what the BE will return.
//
// Used by:
//   - issue-detail.tsx Owner meta-row (replaces the read-only Assignee row)
//   - create-issue.tsx form (initial state both null)
//
// Reuses `useDismiss` for outside-click + Escape; renders inline via
// `position: absolute`, so the parent must establish `position: relative`.

import { useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { Avatar } from './shell';
import { useUsers } from '../state/users';
import { useTeams } from '../state/teams';
import { useDismiss } from './use-dismiss';

export interface OwnerPickerProps {
  assigneeUserId: string | null;
  /** UUID of the team. Optional/undefined === null === "no team". */
  teamId: string | null | undefined;
  /**
   * Called on every commit (including Unassign). One of the two fields
   * is always null — never both non-null. The caller PATCHes both in a
   * single write so optimistic state matches the BE response.
   */
  onChange: (next: { assigneeUserId: string | null; teamId: string | null }) => void;
  /**
   * Compact trigger — used inline in the inspector meta-row. The default
   * variant is the bigger "btn-like" used by the create-issue form.
   */
  variant?: 'inspector' | 'form';
  /** Disable interaction (used while a mutation is in flight). */
  disabled?: boolean;
}

export function OwnerPicker({
  assigneeUserId, teamId, onChange, variant = 'inspector', disabled,
}: OwnerPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const { getUser } = useUsers();
  const { getTeam } = useTeams();

  const assignee = assigneeUserId ? getUser(assigneeUserId) : undefined;
  const team = teamId ? getTeam(teamId) : undefined;

  const hasOwner = !!assigneeUserId || !!teamId;

  // Trigger content — what shows when the popover is closed.
  const trigger = (() => {
    if (assigneeUserId) {
      const name = assignee?.displayName ?? 'Unknown user';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Avatar name={name} size={20} />
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{name}</span>
        </span>
      );
    }
    if (teamId) {
      const name = team?.name ?? 'Unknown team';
      const color = team?.color ?? 'var(--fg-faint)';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            width: 14, height: 14, borderRadius: 3, background: color, flexShrink: 0,
          }} />
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{name}</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'var(--fg-faint)',
            textTransform: 'uppercase', letterSpacing: 0.4, marginLeft: 2,
          }}>
            Team
          </span>
        </span>
      );
    }
    return (
      <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Unassigned</span>
    );
  })();

  const triggerStyle = variant === 'form'
    ? {
        gap: 5, height: 26, background: 'var(--bg)',
        color: hasOwner ? 'var(--fg)' : 'var(--fg-faint)',
        fontWeight: hasOwner ? 500 : 400,
        borderStyle: hasOwner ? 'solid' as const : 'dashed' as const,
      }
    : {
        // Inspector: full-width, left-aligned, button-shaped to mirror the
        // Status row chrome.
        width: '100%', justifyContent: 'flex-start' as const,
        background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--fg)',
      };

  return (
    <div ref={ref} style={{ position: 'relative', display: variant === 'form' ? 'inline-block' : 'block' }}>
      <button
        type="button"
        className="btn btn-sm"
        style={triggerStyle}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {variant === 'form' && (
          <Icon
            name={teamId ? 'users' : 'user'}
            size={12}
            color={hasOwner ? 'var(--fg-muted)' : 'var(--fg-faint)'}
          />
        )}
        {trigger}
        {variant === 'inspector' && (
          <Icon name="chevronDown" size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
        )}
      </button>
      {open && (
        <OwnerPickerPopover
          assigneeUserId={assigneeUserId}
          teamId={teamId ?? null}
          variant={variant}
          onPick={(next) => { onChange(next); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

function OwnerPickerPopover({
  assigneeUserId, teamId, variant, onPick, onClose,
}: {
  assigneeUserId: string | null;
  teamId: string | null;
  variant: 'inspector' | 'form';
  onPick: (next: { assigneeUserId: string | null; teamId: string | null }) => void;
  onClose: () => void;
}) {
  const { searchUsers } = useUsers();
  const { teams } = useTeams();

  // Default tab: matches the current value. Person when nothing is set, so
  // the most common path is a single click after typing.
  const [tab, setTab] = useState<'person' | 'team'>(teamId ? 'team' : 'person');
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => searchUsers(search), [searchUsers, search]);
  const filteredTeams = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(needle));
  }, [teams, search]);

  // Inspector renders the popover ABOVE its row layout (the inspector lives
  // on the right side and a wide popover would cap; mirror the form variant
  // by anchoring under the trigger). Form variant anchors top-left.
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: variant === 'inspector' ? 0 : undefined,
        zIndex: 30,
        width: variant === 'inspector' ? undefined : 280,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label="Pick owner"
    >
      {/* Segmented Person / Team toggle. Tab key reaches it from the trigger
          via standard tab order; arrow keys are intentionally not wired here
          — mirrors the rest of the BIRA pickers (no roving focus). */}
      <div
        style={{
          display: 'flex',
          padding: 4,
          gap: 2,
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-muted)',
        }}
        role="tablist"
      >
        <SegBtn
          active={tab === 'person'}
          onClick={() => { setTab('person'); setSearch(''); }}
          icon="user"
          label="Person"
        />
        <SegBtn
          active={tab === 'team'}
          onClick={() => { setTab('team'); setSearch(''); }}
          icon="users"
          label="Team"
        />
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px 6px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 8, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--fg-faint)',
          }}>
            <Icon name="search" size={12} />
          </span>
          <input
            autoFocus
            className="input input-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'person' ? 'Search members…' : 'Search teams…'}
            style={{ paddingLeft: 26 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (tab === 'person' && filteredUsers[0]) {
                  onPick({ assigneeUserId: filteredUsers[0].id, teamId: null });
                } else if (tab === 'team' && filteredTeams[0]) {
                  onPick({ assigneeUserId: null, teamId: filteredTeams[0].id });
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
      </div>

      {/* List body */}
      <div className="scroll" style={{ maxHeight: 220, overflow: 'auto', padding: 4 }}>
        {tab === 'person' ? (
          <>
            {filteredUsers.map((u) => {
              const isCurrent = u.id === assigneeUserId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onPick({ assigneeUserId: u.id, teamId: null })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onPick({ assigneeUserId: u.id, teamId: null });
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 8px', borderRadius: 5, fontSize: 13,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--fg)', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar name={u.displayName} size={20} />
                  <span style={{
                    flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.displayName}
                  </span>
                  {isCurrent && <Icon name="check" size={12} color="var(--accent)" />}
                </button>
              );
            })}
            {filteredUsers.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
                No matches.
              </div>
            )}
          </>
        ) : (
          <>
            {filteredTeams.map((t) => {
              const isCurrent = t.id === teamId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onPick({ assigneeUserId: null, teamId: t.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onPick({ assigneeUserId: null, teamId: t.id });
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 8px', borderRadius: 5, fontSize: 13,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--fg)', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: 3,
                    background: t.color, flexShrink: 0,
                  }} />
                  <span style={{
                    flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.name}
                  </span>
                  <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
                    {t.memberCount}
                  </span>
                  {isCurrent && <Icon name="check" size={12} color="var(--accent)" />}
                </button>
              );
            })}
            {filteredTeams.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
                {teams.length === 0 ? 'No teams in this workspace.' : 'No matches.'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Unassign — clears both fields. Only shown when something is set. */}
      {(assigneeUserId || teamId) && (
        <div style={{
          padding: '6px 10px 8px',
          borderTop: '1px solid var(--border-muted)',
        }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onPick({ assigneeUserId: null, teamId: null })}
          >
            <Icon name="x" size={12} /> Unassign
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented toggle button
// ---------------------------------------------------------------------------

function SegBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: 'user' | 'users';
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '5px 8px', borderRadius: 5,
        border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: active ? 600 : 500,
        background: active ? 'var(--bg)' : 'transparent',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
      }}
    >
      <Icon name={icon} size={12} />
      {label}
    </button>
  );
}
