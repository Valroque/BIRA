// Settings: workspace-level (general, members) + tenant-level (general,
// members) + user profile, all hosted under one /settings tree so users
// only ever click "Settings" to find any of these surfaces. Sections live
// as nested routes so each is deep-linkable.
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Avatar, Chip, useTenantBreadcrumbs, useTenantContext } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Field, Hint, DangerRow } from '../components/forms';
import { Section } from '../components/section';
import { EmptyState } from '../components/states';
import { useDismiss } from '../components/use-dismiss';
import type { Role } from '../fixtures';
import { useWorkspaces } from '../state/workspaces';
import { useAuth } from '../state/auth';
import { useUsers } from '../state/users';
import { useWorkspaceMembers } from '../state/workspace-members';
import type { WorkspaceMember } from '../api/adapters/workspaceMember.adapter';
import { updateProfile, changePassword } from '../api/auth';
import { adminResetPassword, deactivateUser, reactivateUser } from '../api/userAdmin';
import {
  listTokens,
  createToken,
  revokeToken,
  type PersonalAccessToken,
  type PatExpiresIn,
} from '../api/personalAccessTokens';

// --- Outer layout (header + grouped left-nav + outlet) ---

interface SettingsNavItem {
  id: string;
  to: string;
  label: string;
  icon: string;
}
interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export function SettingsLayout() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { pathname } = useLocation();
  const base = `/${tenant}/${workspace}/settings`;
  const groups: SettingsNavGroup[] = [
    {
      label: 'Workspace',
      items: [
        { id: 'general', to: `${base}/general`, label: 'General', icon: 'settings' },
        { id: 'members', to: `${base}/members`, label: 'Members', icon: 'users' },
      ],
    },
    {
      label: 'Tenant',
      items: [
        { id: 'tenant-general', to: `${base}/tenant/general`, label: 'General', icon: 'building' },
        { id: 'tenant-members', to: `${base}/tenant/members`, label: 'Members', icon: 'users' },
      ],
    },
    {
      label: 'Account',
      items: [
        { id: 'profile', to: `${base}/profile`, label: 'Profile', icon: 'user' },
      ],
    },
  ];

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Settings',
      ]} />
      <div style={{
        padding: '20px 28px 16px', borderBottom: '1px solid var(--border-muted)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
          Workspace, tenant, and account preferences in one place.
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav
          className="scroll"
          style={{
            width: 220, flexShrink: 0, borderRight: '1px solid var(--border-muted)',
            overflow: 'auto', padding: '18px 12px',
          }}
        >
          {groups.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                color: 'var(--fg-faint)', padding: '0 10px 6px',
              }}>{g.label}</div>
              {g.items.map((s) => {
                const active = pathname === s.to || pathname.startsWith(s.to + '/');
                return (
                  <NavLink
                    key={s.id}
                    to={s.to}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      height: 30, padding: '0 10px', borderRadius: 6,
                      fontSize: 13, fontWeight: active ? 600 : 500,
                      color: active ? 'var(--accent-active)' : 'var(--fg-muted)',
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                      textDecoration: 'none',
                    }}
                  >
                    <Icon name={s.icon} size={14} />
                    {s.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ maxWidth: 720 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- General (workspace) ---

export function GeneralSettings() {
  const { workspace: workspaceSlug } = useTenantContext();
  const { getWorkspace, updateWorkspace } = useWorkspaces();
  const currentWorkspace = getWorkspace(workspaceSlug);

  const [name, setName] = useState(currentWorkspace?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const slug = currentWorkspace?.slug ?? workspaceSlug;

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await updateWorkspace(slug, { name });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section title="Workspace details" subtitle="How your workspace appears to its members." card>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug">
          <input
            className="input mono"
            value={slug}
            disabled
          />
          <Hint>Workspace slugs cannot be changed.</Hint>
        </Field>
        {saveError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {saveError}
          </div>
        )}
        <SaveBar onSave={handleSave} saving={saving} />
      </Section>

      <Section title="Logo" card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 24, fontFamily: 'var(--font-mono)',
          }}>{name[0] ?? 'B'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-sm"><Icon name="upload" size={13} />Upload logo</button>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>PNG/SVG up to 1 MB. Square recommended.</span>
          </div>
        </div>
      </Section>

      <Section
        title="Danger zone"
        subtitle="These actions are irreversible. Make sure you've exported anything important."
        danger
        card
      >
        <DangerRow
          label="Archive workspace"
          description="Hide the workspace and freeze all data. Members lose access until restored."
          actionLabel="Archive…"
        />
        <DangerRow
          label="Delete workspace"
          description="Permanently delete the workspace and all its issues, projects, comments, and members."
          actionLabel="Delete…"
        />
      </Section>
    </>
  );
}

// --- Members ---

export function MembersSettings() {
  const { tenant, workspace } = useTenantContext();
  const { getWorkspace } = useWorkspaces();
  const { user: currentUser } = useAuth();
  const { members, loading, error, refresh, invite, setRole, remove } = useWorkspaceMembers();
  const { users } = useUsers();

  const ws = getWorkspace(workspace);
  // Effective role of the acting user in this workspace. Drives gating for
  // the "admin actions" dropdown — only workspace admins (or tenant admins
  // who inherit) see destructive controls.
  const isAdmin = ws?.role === 'admin';

  const [filter, setFilter] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [rowError, setRowError] = useState<{ membershipId: string; msg: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; password: string } | null>(null);

  const filtered = useMemo(() => {
    if (!filter) return members;
    const f = filter.toLowerCase();
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(f) || m.email.toLowerCase().includes(f),
    );
  }, [members, filter]);

  // Candidates for invite: tenant users not yet in the workspace.
  const inviteCandidates = useMemo(() => {
    const existing = new Set(members.map((m) => m.userId));
    return users.filter((u) => !existing.has(u.id));
  }, [users, members]);

  const handleSetRole = async (m: WorkspaceMember, role: Role) => {
    setRowError(null);
    try {
      await setRole(m.membershipId, role);
    } catch (err) {
      setRowError({
        membershipId: m.membershipId,
        msg: err instanceof Error ? err.message : 'Failed to update role',
      });
    }
  };

  const handleRemove = async (m: WorkspaceMember) => {
    if (!window.confirm(
      `Remove ${m.displayName} from this workspace? They'll lose access immediately.`,
    )) return;
    setRowError(null);
    try {
      await remove(m.membershipId);
    } catch (err) {
      setRowError({
        membershipId: m.membershipId,
        msg: err instanceof Error ? err.message : 'Failed to remove member',
      });
    }
  };

  const handleAdminReset = async (m: WorkspaceMember) => {
    if (!window.confirm(
      `Reset password for ${m.displayName}? A temporary password will be generated and shown to you once.`,
    )) return;
    setRowError(null);
    try {
      const result = await adminResetPassword(tenant, m.userId);
      setResetResult({ name: m.displayName, password: result.temporaryPassword });
    } catch (err) {
      setRowError({
        membershipId: m.membershipId,
        msg: err instanceof Error ? err.message : 'Failed to reset password',
      });
    }
  };

  const handleDeactivate = async (m: WorkspaceMember) => {
    if (!window.confirm(
      `Deactivate ${m.displayName}? They will be signed out and unable to log in to any tenant until reactivated.\n\n`
      + `Deactivation freezes login but leaves project, team, and workspace access in place. If this is a security action, revoke the user's access from those scopes separately before reactivating.`,
    )) return;
    setRowError(null);
    try {
      await deactivateUser(tenant, m.userId);
      await refresh();
    } catch (err) {
      setRowError({
        membershipId: m.membershipId,
        msg: err instanceof Error ? err.message : 'Failed to deactivate user',
      });
    }
  };

  const handleReactivate = async (m: WorkspaceMember) => {
    if (!window.confirm(
      `Reactivate ${m.displayName}? They will be able to log in again.\n\n`
      + `This user's prior project, team, and workspace access is being restored. Review their grants if circumstances have changed.`,
    )) return;
    setRowError(null);
    try {
      await reactivateUser(tenant, m.userId);
      await refresh();
    } catch (err) {
      setRowError({
        membershipId: m.membershipId,
        msg: err instanceof Error ? err.message : 'Failed to reactivate user',
      });
    }
  };

  const handleInvite = async (userId: string, role: Role) => {
    await invite({ userId, role });
    setShowInvite(false);
  };

  return (
    <>
      <Section
        title={`Members${loading ? '' : ` · ${members.length}`}`}
        subtitle="Anyone with direct access to this workspace. Tenant admins automatically have manager access in every workspace."
        card
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
              <Icon name="search" size={13} />
            </span>
            <input
              className="input input-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or email"
              style={{ paddingLeft: 28 }}
            />
          </div>
          <button
            onClick={() => setShowInvite(true)}
            disabled={!isAdmin}
            data-tip={!isAdmin ? 'Only workspace managers can add members.' : undefined}
            className="btn btn-primary btn-sm"
          >
            <Icon name="plus" size={13} />Add member
          </button>
        </div>

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            Loading members…
          </div>
        )}

        {error && !loading && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginBottom: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => void refresh()} className="btn btn-sm">Retry</button>
          </div>
        )}

        {!loading && !error && members.length === 0 && (
          <EmptyState
            size="inline"
            icon="users"
            title="No members yet"
            description="Add a tenant member to grant them direct access to this workspace."
          />
        )}

        {!loading && filtered.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((m, i) => (
              <MemberRow
                key={m.membershipId}
                member={m}
                first={i === 0}
                isAdmin={isAdmin}
                isSelf={currentUser?.id === m.userId}
                rowError={rowError?.membershipId === m.membershipId ? rowError.msg : null}
                onSetRole={(role) => handleSetRole(m, role)}
                onRemove={() => handleRemove(m)}
                onAdminReset={() => handleAdminReset(m)}
                onDeactivate={() => handleDeactivate(m)}
                onReactivate={() => handleReactivate(m)}
              />
            ))}
          </div>
        )}

        {!loading && !error && members.length > 0 && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            No members match "{filter}".
          </div>
        )}
      </Section>

      {showInvite && (
        <InviteModal
          candidates={inviteCandidates}
          onSend={handleInvite}
          onClose={() => setShowInvite(false)}
        />
      )}

      {resetResult && (
        <ResetPasswordResultModal
          name={resetResult.name}
          password={resetResult.password}
          onClose={() => setResetResult(null)}
        />
      )}
    </>
  );
}

interface MemberRowProps {
  member: WorkspaceMember;
  first: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  rowError: string | null;
  onSetRole: (role: Role) => void;
  onRemove: () => void;
  onAdminReset: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}
function MemberRow({
  member, first, isAdmin, isSelf, rowError,
  onSetRole, onRemove, onAdminReset, onDeactivate, onReactivate,
}: MemberRowProps) {
  const m = member;
  const deactivated = !m.userIsActive || m.status === 'deactivated';
  const roleSelectDisabled = !isAdmin || deactivated;

  return (
    <div
      style={{
        display: 'grid',
        // Fixed widths on the source/role columns so pills + selects line
        // up vertically across rows — `auto` would size each row's grid
        // independently and the column would shift per row.
        gridTemplateColumns: '32px 1fr 140px 80px 110px 32px',
        gap: 12, alignItems: 'center',
        padding: '10px 14px',
        borderTop: first ? 'none' : '1px solid var(--border-muted)',
        opacity: deactivated ? 0.55 : 1,
      }}
    >
      <Avatar name={m.displayName} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{m.displayName}</span>
          {isSelf && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
              color: 'var(--fg-muted)', background: 'var(--bg-subtle)',
              padding: '1px 5px', borderRadius: 3,
            }}>You</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{m.email}</div>
        {rowError && (
          <div style={{ fontSize: 11, color: 'var(--blocked)', marginTop: 2 }}>
            {rowError}
          </div>
        )}
      </div>
      <SourcePill tenantAdmin={m.tenantAdmin} />
      {m.tenantAdmin ? (
        // Tenant admins are admin in every workspace by virtue of their
        // tenant role — the workspace row's stored role is irrelevant, so we
        // render a non-editable pill instead of a disabled select. Demote at
        // the tenant level to change this.
        <RolePill role="admin" />
      ) : (
        <RoleSelect
          value={m.effectiveRole}
          disabled={roleSelectDisabled}
          tip={
            !isAdmin ? 'Only workspace managers can change roles.'
            : deactivated ? 'Reactivate the user before changing their role.'
            : undefined
          }
          onChange={onSetRole}
        />
      )}
      <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
        {m.status === 'invited' ? <span style={{ color: 'var(--in-progress)' }}>Invite pending</span>
        : deactivated ? 'Deactivated'
        : (m.lastSeenAt ?? '—')}
      </span>
      {isAdmin && !isSelf ? (
        <RowActionsMenu
          deactivated={deactivated}
          tenantAdmin={m.tenantAdmin}
          onRemove={onRemove}
          onAdminReset={onAdminReset}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      ) : (
        <span />
      )}
    </div>
  );
}

function SourcePill({ tenantAdmin }: { tenantAdmin: boolean }) {
  return (
    <span
      style={{
        fontSize: 11, padding: '2px 7px', borderRadius: 10,
        background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
        color: 'var(--fg-muted)', whiteSpace: 'nowrap',
      }}
      data-tip={
        tenantAdmin
          ? 'Implicit admin via tenant-membership role — manager in every workspace.'
          : 'Direct workspace membership — role applies to this workspace only.'
      }
    >
      {tenantAdmin ? 'Tenant admin' : 'Workspace member'}
    </span>
  );
}

function RolePill({ role }: { role: Role }) {
  return (
    <span className="pill" style={{
      background:
        role === 'admin' ? 'var(--accent-muted)' :
        role === 'write' ? 'var(--done-bg)' :
        'var(--bg-muted)',
      color:
        role === 'admin' ? 'var(--accent-active)' :
        role === 'write' ? 'var(--done)' :
        'var(--fg-muted)',
    }}>{role === 'admin' ? 'manager' : role}</span>
  );
}

interface RoleSelectProps {
  value: Role;
  disabled?: boolean;
  tip?: string;
  onChange: (role: Role) => void;
}
function RoleSelect({ value, disabled, tip, onChange }: RoleSelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      className="input input-sm"
      data-tip={tip}
      onChange={(e) => onChange(e.target.value as Role)}
      style={{ width: 'auto', padding: '0 6px' }}
    >
      {/* Workspace top role displays as "manager" to disambiguate from
          tenant-level admin. DB enum stays `admin`. */}
      <option value="admin">manager</option>
      <option value="write">write</option>
      <option value="read">read</option>
    </select>
  );
}

interface RowActionsMenuProps {
  deactivated: boolean;
  tenantAdmin: boolean;
  onRemove: () => void;
  onAdminReset: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}
function RowActionsMenu({
  deactivated, tenantAdmin, onRemove, onAdminReset, onDeactivate, onReactivate,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  const close = () => setOpen(false);
  const click = (fn: () => void) => () => { close(); fn(); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 28, padding: 0 }}
        data-tip="Member actions"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="moreV" size={13} color="var(--fg-muted)" />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            width: 220, background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden',
            padding: 4,
          }}
        >
          <ActionMenuRow
            icon="rotate"
            label="Reset password…"
            onClick={click(onAdminReset)}
            disabled={deactivated}
            tip={deactivated ? 'Reactivate the user first.' : undefined}
          />
          {!deactivated && (
            <ActionMenuRow
              icon="lock"
              label="Deactivate user…"
              onClick={click(onDeactivate)}
              danger
              disabled={tenantAdmin}
              tip={tenantAdmin ? 'Demote at the tenant level before deactivating.' : undefined}
            />
          )}
          {deactivated && (
            <ActionMenuRow
              icon="unlock"
              label="Reactivate user"
              onClick={click(onReactivate)}
            />
          )}
          <div style={{ height: 1, background: 'var(--border-muted)', margin: '4px 0' }} />
          <ActionMenuRow
            icon="trash"
            label="Remove from workspace…"
            onClick={click(onRemove)}
            danger
            disabled={tenantAdmin}
            tip={tenantAdmin ? "Tenant admins can't be removed from a single workspace." : undefined}
          />
        </div>
      )}
    </div>
  );
}

interface ActionMenuRowProps {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  tip?: string;
}
function ActionMenuRow({ icon, label, onClick, danger, disabled, tip }: ActionMenuRowProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      data-tip={tip}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        width: '100%', borderRadius: 5, border: 'none', background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', fontSize: 13,
        color: danger ? 'var(--blocked)' : disabled ? 'var(--fg-faint)' : 'var(--fg)',
        opacity: disabled ? 0.65 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon name={icon} size={13} color={danger ? 'var(--blocked)' : 'var(--fg-muted)'} />
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

interface InviteModalProps {
  candidates: { id: string; displayName: string; email: string }[];
  onSend: (userId: string, role: Role) => Promise<void>;
  onClose: () => void;
}
function InviteModal({ candidates, onSend, onClose }: InviteModalProps) {
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('write');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 20);
    return candidates
      .filter((u) =>
        u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [candidates, query]);

  const submit = async () => {
    if (!userId) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSend(userId, role);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      label="Add a workspace member"
    >
      <ModalHeader title="Add a workspace member" onClose={onClose} />
      <ModalBody>
        <Field label="Tenant member">
          <input
            autoFocus
            type="search"
            className="input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setUserId(null); }}
            placeholder="Search by name or email"
          />
        </Field>
        <div style={{
          maxHeight: 220, overflow: 'auto',
          border: '1px solid var(--border)', borderRadius: 6,
          marginBottom: 12,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
              {candidates.length === 0
                ? 'Every active tenant member is already in this workspace.'
                : `No matches for "${query}".`}
            </div>
          ) : (
            filtered.map((u) => {
              const selected = userId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUserId(u.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '8px 10px', textAlign: 'left',
                    border: 'none', background: selected ? 'var(--bg-subtle)' : 'transparent',
                    cursor: 'pointer', fontSize: 13, color: 'var(--fg)',
                  }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar name={u.displayName} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{u.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{u.email}</div>
                  </div>
                  {selected && <Icon name="check" size={14} color="var(--accent-active)" />}
                </button>
              );
            })
          )}
        </div>
        <Field label="Role">
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="read">read — view-only access</option>
            <option value="write">write — view and edit issues, projects, workflows</option>
            <option value="admin">manager — also manage settings, members, and roles</option>
          </select>
        </Field>
        <Hint>
          Members must already exist in the tenant. To create a brand-new user, use the Tenant settings → Members tab.
        </Hint>
        {errorMsg && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginTop: 8,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {errorMsg}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
        <button type="submit" disabled={!userId || submitting} className="btn btn-primary btn-sm">
          <Icon name="plus" size={13} />
          {submitting ? 'Adding…' : 'Add member'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

interface ResetPasswordResultProps {
  name: string;
  password: string;
  onClose: () => void;
}
function ResetPasswordResultModal({ name, password, onClose }: ResetPasswordResultProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard might be unavailable (e.g. http context); fall back to selection prompt.
      setCopied(false);
    }
  };
  return (
    <Modal onClose={onClose} label="Temporary password">
      <ModalHeader title="Temporary password" onClose={onClose} />
      <ModalBody>
        <p style={{ fontSize: 13, color: 'var(--fg)', margin: '0 0 12px' }}>
          Share this password with <strong>{name}</strong> over a secure channel. They'll be required to set a new password on next login. This password will not be shown again.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
        }}>
          <code style={{
            flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13,
            wordBreak: 'break-all',
          }}>
            {password}
          </code>
          <button onClick={copy} className="btn btn-sm">
            <Icon name="copy" size={13} />{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <Hint warning>Store it briefly and discard. BIRA never logs the temporary password.</Hint>
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-primary btn-sm">Done</button>
      </ModalFooter>
    </Modal>
  );
}

// --- Profile ---

export function ProfileSettings() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const displayName = `${firstName} ${lastName}`.trim() || (user?.displayName ?? 'Account');

  const handleProfileSave = async () => {
    setProfileError(null);
    setProfileSaving(true);
    try {
      const updated = await updateProfile({ firstName, lastName, email });
      updateUser(updated);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwSuccess(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/tenants');
  };

  return (
    <>
      <Section title="Account" subtitle="Information about you, visible to other members of this workspace." card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Avatar name={displayName} size={56} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-sm"><Icon name="upload" size={13} />Upload avatar</button>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>JPG/PNG up to 1 MB. Initials are used by default.</span>
          </div>
        </div>
        <Field label="First name">
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Hint>Changing your email requires re-verification.</Hint>
        </Field>
        {profileError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {profileError}
          </div>
        )}
        <SaveBar onSave={handleProfileSave} saving={profileSaving} />
      </Section>

      <Section title="Password" card>
        <Field label="Current password">
          <input
            type="password" className="input"
            autoComplete="current-password"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <input
            type="password" className="input"
            autoComplete="new-password" minLength={8}
            value={newPw} onChange={(e) => setNewPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password" className="input"
            autoComplete="new-password"
            value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
          />
        </Field>
        {pwError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--done) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--done) 30%, transparent)',
            color: 'var(--done)',
          }}>
            Password updated successfully.
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            onClick={handlePasswordUpdate}
          >
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </Section>

      <ApiTokensSection />

      <Section title="Sign out" subtitle="Sign out of this device. You can sign back in any time." card>
        <button onClick={handleSignOut} className="btn">
          <Icon name="power" size={13} />Sign out
        </button>
      </Section>
    </>
  );
}

// --- API tokens ---
//
// Personal Access Tokens — long-lived Bearer credentials a user can mint to
// authenticate the BIRA MCP server (or any other Bearer client) on their
// behalf. Profile-shaped (per-user, not per-tenant) so it lives next to
// "change my password" in the Profile tab rather than as a top-level
// Settings section.
//
// The plaintext is shown EXACTLY ONCE in `TokenCreatedModal`, kept in
// transient React state, and cleared the moment that modal closes — never
// localStorage, never logged.

function ApiTokensSection() {
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Held only while the post-create modal is open. Cleared on close.
  const [createdPlaintext, setCreatedPlaintext] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const list = await listTokens();
      setTokens(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreated = async (plaintext: string) => {
    setCreatedPlaintext(plaintext);
    // Refetch so the new row is in the list once the user closes the
    // reveal modal. Cheaper to re-list than to mutate locally — the BE
    // also computes ordering (active-first, recently-used-first).
    await refresh();
  };

  const handleRevoke = async (t: PersonalAccessToken) => {
    if (!window.confirm(
      `Revoke token "${t.name}"? Any client using it will stop working immediately.`,
    )) return;
    setRevokeError(null);
    try {
      await revokeToken(t.id);
      await refresh();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  return (
    <>
      <Section
        title="API tokens"
        subtitle="Generate tokens to authenticate the BIRA MCP server or other Bearer-token clients on your behalf. Treat them like passwords — anyone with a token can act as you."
        action={
          tokens.length > 0 && !loading ? (
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary btn-sm"
            >
              <Icon name="plus" size={13} />Generate token
            </button>
          ) : undefined
        }
        card
      >
        {revokeError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginBottom: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {revokeError}
          </div>
        )}

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            Loading tokens…
          </div>
        )}

        {error && !loading && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginBottom: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => void refresh()} className="btn btn-sm">Retry</button>
          </div>
        )}

        {!loading && !error && tokens.length === 0 && (
          <EmptyState
            size="inline"
            icon="lock"
            title="No API tokens yet"
            description="You haven't created any API tokens yet. Generate one to use the BIRA MCP server or other Bearer-token clients."
            action={
              <button
                onClick={() => setShowCreate(true)}
                className="btn btn-primary btn-sm"
              >
                <Icon name="plus" size={13} />Generate token
              </button>
            }
          />
        )}

        {!loading && !error && tokens.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            <ApiTokensHeader />
            {tokens.map((t) => (
              <ApiTokenRow
                key={t.id}
                token={t}
                first={false /* header above already provides the top divider */}
                onRevoke={() => handleRevoke(t)}
              />
            ))}
          </div>
        )}
      </Section>

      {showCreate && (
        <CreateTokenModal
          onClose={() => setShowCreate(false)}
          onCreated={async (plaintext) => {
            setShowCreate(false);
            await handleCreated(plaintext);
          }}
        />
      )}

      {createdPlaintext && (
        <TokenCreatedModal
          plaintext={createdPlaintext}
          // Clear the plaintext from state on close so it can't be reopened
          // or read out of devtools after the user dismisses the reveal.
          onClose={() => setCreatedPlaintext(null)}
        />
      )}
    </>
  );
}

// Column widths shared by the header + each row so they line up exactly.
// Mirrors the pattern used by `MemberRow` further up — fixed widths on the
// chip / date columns keep the action button right-aligned across rows.
const TOKEN_GRID = '1fr 200px 90px 90px 110px 100px';

function ApiTokensHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: TOKEN_GRID,
        gap: 12, alignItems: 'center',
        padding: '8px 14px',
        background: 'var(--bg-subtle)',
        borderBottom: '1px solid var(--border-muted)',
        fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}
    >
      <span>Name</span>
      <span>Token</span>
      <span>Created</span>
      <span>Last used</span>
      <span>Expires</span>
      <span />
    </div>
  );
}

interface ApiTokenRowProps {
  token: PersonalAccessToken;
  first: boolean;
  onRevoke: () => void;
}
function ApiTokenRow({ token, first, onRevoke }: ApiTokenRowProps) {
  const revoked = token.revokedAt !== null;
  const expired = !revoked && isExpired(token.expiresAt);
  // Visually dim revoked / expired rows the same way deactivated members
  // dim — the row stays in the table for audit but it's clearly inert.
  const muted = revoked || expired;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: TOKEN_GRID,
        gap: 12, alignItems: 'center',
        padding: '10px 14px',
        borderTop: first ? 'none' : '1px solid var(--border-muted)',
        opacity: muted ? 0.65 : 1,
      }}
    >
      <div style={{ minWidth: 0, fontSize: 13, fontWeight: 500 }}>{token.name}</div>
      <div>
        <Chip dim style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
          bira_pat_…{token.last4}
        </Chip>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
        {formatShortDate(token.createdAt)}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
        {token.lastUsedAt ? formatShortDate(token.lastUsedAt) : 'Never'}
      </span>
      <ExpiresCell expiresAt={token.expiresAt} expired={expired} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {revoked ? (
          <span
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
              color: 'var(--fg-muted)', background: 'var(--bg-muted)',
              padding: '2px 8px', borderRadius: 10,
            }}
          >
            Revoked
          </span>
        ) : (
          <button onClick={onRevoke} className="btn btn-danger btn-sm">
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}

function ExpiresCell({ expiresAt, expired }: { expiresAt: string | null; expired: boolean }) {
  if (expiresAt === null) {
    return <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>Never</span>;
  }
  if (expired) {
    return (
      <span
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
          color: 'var(--blocked)', background: 'var(--blocked-bg)',
          padding: '2px 8px', borderRadius: 10,
        }}
        data-tip={`Expired ${formatShortDate(expiresAt)}`}
      >
        Expired
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
      {formatShortDate(expiresAt)}
    </span>
  );
}

interface CreateTokenModalProps {
  onClose: () => void;
  onCreated: (plaintext: string) => void | Promise<void>;
}
function CreateTokenModal({ onClose, onCreated }: CreateTokenModalProps) {
  const [name, setName] = useState('');
  const [expiresIn, setExpiresIn] = useState<PatExpiresIn>('never');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createToken({ name: name.trim(), expiresIn });
      // Hand the plaintext up; the parent owns the reveal modal so the
      // plaintext can outlive *this* modal (which closes on success).
      await onCreated(result.plaintext);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      label="Generate API token"
    >
      <ModalHeader title="Generate API token" onClose={onClose} />
      <ModalBody>
        <Field label="Name">
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder="e.g., claude-desktop"
          />
          <Hint>A short label so you can identify this token later (e.g., "claude-desktop").</Hint>
        </Field>
        <Field label="Expiration">
          <select
            className="input"
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value as PatExpiresIn)}
          >
            <option value="never">Never</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
            <option value="1y">1 year</option>
          </select>
        </Field>
        {errorMsg && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginTop: 8,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {errorMsg}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
        <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
          <Icon name="plus" size={13} />
          {submitting ? 'Generating…' : 'Generate'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

interface TokenCreatedModalProps {
  plaintext: string;
  onClose: () => void;
}
function TokenCreatedModal({ plaintext, onClose }: TokenCreatedModalProps) {
  // Mirrors `ResetPasswordResultModal` (this file, ~line 826) — same one-shot
  // reveal shape, copy-button affordance, and warning copy tone. The plaintext
  // is owned by the parent and cleared from state on close.
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal onClose={onClose} label="Token created">
      <ModalHeader title="Token created" onClose={onClose} />
      <ModalBody>
        <p style={{ fontSize: 13, color: 'var(--fg)', margin: '0 0 12px' }}>
          Copy this token now. You won't be able to see it again — if you lose it, you'll need to generate a new one.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-subtle)',
        }}>
          <code style={{
            flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13,
            wordBreak: 'break-all',
          }}>
            {plaintext}
          </code>
          <button onClick={copy} className="btn btn-sm">
            <Icon name="copy" size={13} />{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <Hint warning>Store this token somewhere safe (a password manager). BIRA does not retain a copy.</Hint>
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-primary btn-sm">Done</button>
      </ModalFooter>
    </Modal>
  );
}

// Local date helpers — kept inline since the project doesn't have a shared
// date util module yet (the only formatter, `formatRelative` in
// issue-detail.tsx, is local to that file too). If a future PR extracts a
// shared util, both call sites can collapse onto it.

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatShortDate(iso: string): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const d = new Date(ts);
  const now = new Date();
  // Same year → drop the year for compactness ("Apr 14"); otherwise include it.
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}`
    : `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

// --- Helpers ---

function SaveBar({ onSave, saving }: { onSave?: () => void; saving?: boolean }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// Re-export the layout under a friendlier name when imported by App.tsx.
export { SettingsLayout as SettingsPage };
