// /:tenant/:workspace/:project/members
//
// Per-project access management — wired to the BE (slice 4 FE, 2026-05-05).
//
// A project's effective members = the BE-resolved union of:
//   1. team grants (every team member inherits the team's role)
//   2. explicit user grants (overrides team grants in either direction)
//   3. tenant + workspace admins (always implicit admin everywhere)
//
// The BE owns the precedence rule (`explicit-user > tenant-admin >
// workspace-admin > team`) and exposes it as a flat `EffectiveMember[]` via
// `GET .../access/effective-members`. The third section on this page renders
// that list with provenance hints so admins can debug "why does X have role
// Y here".
//
// Hard rules from `.claude/rules/v1-constraints.md` mirrored in this UI:
//   - Team-grant role dropdown does NOT offer `admin` (admin is never
//     inherited via a team — DB CHECK + Zod also enforce it server-side).
//   - User-grant role dropdown DOES offer the full ladder including admin.
//   - Mutations are admin-only at the workspace scope; non-admins see the
//     read-only surfaces but no add/edit/remove controls.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import {
  TopBar, Tabs, Avatar, projectTabs,
  useTenantBreadcrumbs,
} from '../components/shell';
import { Modal, ModalHeader } from '../components/modal';
import { Section } from '../components/section';
import { ErrorState, SkeletonRow } from '../components/states';
import { TeamBadge } from './teams';
import { useTeams } from '../state/teams';
import { useUsers } from '../state/users';
import { useWorkspaces } from '../state/workspaces';
import { useProjects } from '../state/projects';
import {
  ProjectAccessProvider,
  useProjectAccess,
} from '../state/project-access';
import type {
  EffectiveMember, Provenance, TeamAccess, UserAccess,
} from '../api/adapters/projectAccess.adapter';
import type { Role } from '../fixtures';

// ---------------------------------------------------------------------------
// Outer route — mounts the provider keyed on (tenant, workspace, project)
// so navigating between projects remounts cleanly.
// ---------------------------------------------------------------------------

export function ProjectMembersPage() {
  const { tenant, workspace, project } = useTenantBreadcrumbs();
  return (
    <ProjectAccessProvider
      key={`${tenant}/${workspace}/${project}`}
      tenant={tenant}
      workspace={workspace}
      project={project}
    >
      <ProjectMembersInner />
    </ProjectAccessProvider>
  );
}

// ---------------------------------------------------------------------------
// Inner — reads from the provider
// ---------------------------------------------------------------------------

function ProjectMembersInner() {
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);
  const { getWorkspace } = useWorkspaces();
  const isAdmin = getWorkspace(workspace)?.role === 'admin';

  const {
    access, effective, loading, saving, error, refresh,
    grantTeam, updateTeam, revokeTeam,
    grantUser, updateUser, revokeUser,
  } = useProjectAccess();

  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleErr = (err: unknown, fallback: string) => {
    setActionError(err instanceof Error ? err.message : fallback);
  };

  const onAddTeam = async (teamId: string, role: 'write' | 'read') => {
    setActionError(null);
    try {
      await grantTeam(teamId, role);
      setShowAddTeam(false);
    } catch (err) {
      handleErr(err, 'Failed to add team');
    }
  };

  const onUpdateTeam = async (teamId: string, role: 'write' | 'read') => {
    setActionError(null);
    try { await updateTeam(teamId, role); }
    catch (err) { handleErr(err, 'Failed to update team grant'); }
  };

  const onRevokeTeam = async (team: TeamAccess) => {
    if (!window.confirm(
      `Revoke ${team.teamName}'s access to this project? Members of this team will lose project access unless they have an explicit grant or workspace/tenant admin role.`
    )) return;
    setActionError(null);
    try { await revokeTeam(team.teamId); }
    catch (err) { handleErr(err, 'Failed to revoke team grant'); }
  };

  const onAddUser = async (userId: string, role: Role) => {
    setActionError(null);
    try {
      await grantUser(userId, role);
      setShowAddUser(false);
    } catch (err) {
      handleErr(err, 'Failed to add user');
    }
  };

  const onUpdateUser = async (userId: string, role: Role) => {
    setActionError(null);
    try { await updateUser(userId, role); }
    catch (err) { handleErr(err, 'Failed to update user grant'); }
  };

  const onRevokeUser = async (user: UserAccess) => {
    if (!window.confirm(
      `Remove ${user.displayName}'s explicit grant on this project? They'll fall back to whatever role their team memberships (or admin status) gives them — possibly no access at all.`
    )) return;
    setActionError(null);
    try { await revokeUser(user.userId); }
    catch (err) { handleErr(err, 'Failed to revoke user grant'); }
  };

  // Sets used by the add-team / add-user modals to filter out current grants.
  const grantedTeamIds = useMemo(
    () => new Set((access?.teams ?? []).map((t) => t.teamId)),
    [access],
  );
  const grantedUserIds = useMemo(
    () => new Set((access?.users ?? []).map((u) => u.userId)),
    [access],
  );

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
        'Members',
      ]} />
      <Tabs active="members" tabs={projectTabs(tenant, workspace, project)} />

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 760 }}>

          {error && !loading && (
            <ErrorState
              title="Couldn't load project access"
              description={error}
              action={
                <button onClick={() => void refresh()} className="btn btn-primary btn-sm">
                  <Icon name="rotate" size={13} />Retry
                </button>
              }
            />
          )}

          {actionError && (
            <div style={{
              marginBottom: 16,
              padding: '8px 10px', borderRadius: 6, fontSize: 12.5,
              background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
              border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
              color: 'var(--blocked)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1 }}>{actionError}</span>
              <button
                onClick={() => setActionError(null)}
                className="btn btn-sm"
                style={{ padding: '0 6px', height: 22 }}
              >Dismiss</button>
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkeletonRow height={48} />
              <SkeletonRow height={48} />
              <SkeletonRow height={48} />
            </div>
          )}

          {!loading && !error && access && (
            <>
              <SummaryCard
                teamCount={access.teams.length}
                userCount={access.users.length}
                effectiveCount={effective.length}
                effective={effective}
              />

              <Section
                title={`Team grants · ${access.teams.length}`}
                subtitle="Adding a team grants every member of that team access to this project. Admin can't be assigned to teams — only individuals can be admins."
                action={isAdmin ? (
                  <button
                    onClick={() => setShowAddTeam(true)}
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                  >
                    <Icon name="plus" size={13} />Add team
                  </button>
                ) : undefined}
              >
                {access.teams.length === 0 ? (
                  <EmptyRow text={isAdmin
                    ? 'No teams added. Click Add team above to grant a whole group access at once.'
                    : 'No team grants on this project yet.'} />
                ) : (
                  <div className="card" style={{ padding: 0 }}>
                    {access.teams.map((t, i) => (
                      <TeamGrantRow
                        key={t.id}
                        grant={t}
                        first={i === 0}
                        canEdit={isAdmin && !saving}
                        tenant={tenant}
                        workspace={workspace}
                        onUpdate={(role) => void onUpdateTeam(t.teamId, role)}
                        onRevoke={() => void onRevokeTeam(t)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                title={`User overrides · ${access.users.length}`}
                subtitle="Explicit per-user grants. These win over team-derived roles in either direction — use them to elevate a single user (e.g. project admin) or to downgrade them below their team's role."
                action={isAdmin ? (
                  <button
                    onClick={() => setShowAddUser(true)}
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                  >
                    <Icon name="plus" size={13} />Add user override
                  </button>
                ) : undefined}
              >
                {access.users.length === 0 ? (
                  <EmptyRow text={isAdmin
                    ? 'No user overrides. Most members get access via team grants — add an override here only when you need to deviate from the team default.'
                    : 'No user overrides on this project yet.'} />
                ) : (
                  <div className="card" style={{ padding: 0 }}>
                    {access.users.map((u, i) => (
                      <UserGrantRow
                        key={u.id}
                        grant={u}
                        first={i === 0}
                        canEdit={isAdmin && !saving}
                        onUpdate={(role) => void onUpdateUser(u.userId, role)}
                        onRevoke={() => void onRevokeUser(u)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                title={`Effective members · ${effective.length}`}
                subtitle="The resolved per-user role used by the rest of the app. Source explains how the user got the role — useful when debugging unexpected access."
              >
                {effective.length === 0 ? (
                  <EmptyRow text="No one has access to this project yet. Add a team or user grant above." />
                ) : (
                  <div className="card" style={{ padding: 0 }}>
                    {effective.map((m, i) => (
                      <EffectiveRow key={m.userId} member={m} first={i === 0} />
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>

      {showAddTeam && (
        <AddTeamModal
          excludeTeamIds={grantedTeamIds}
          saving={saving}
          onAdd={onAddTeam}
          onClose={() => setShowAddTeam(false)}
        />
      )}
      {showAddUser && (
        <AddUserModal
          excludeUserIds={grantedUserIds}
          saving={saving}
          onAdd={onAddUser}
          onClose={() => setShowAddUser(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card at the top — count + avatar stack
// ---------------------------------------------------------------------------

function SummaryCard({
  teamCount, userCount, effectiveCount, effective,
}: {
  teamCount: number; userCount: number; effectiveCount: number;
  effective: EffectiveMember[];
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: 14, marginBottom: 22,
      background: 'var(--bg-subtle)', borderRadius: 8,
      border: '1px solid var(--border-muted)',
    }}>
      <EffectiveAvatarStack members={effective} max={6} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {effectiveCount} effective {effectiveCount === 1 ? 'member' : 'members'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
          Across {teamCount} team{teamCount === 1 ? '' : 's'} and {userCount} user override{userCount === 1 ? '' : 's'}.
        </div>
      </div>
    </div>
  );
}

function EffectiveAvatarStack({
  members, max = 5, size = 22,
}: { members: EffectiveMember[]; max?: number; size?: number }) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <span className="avatar-stack">
      {visible.map((m) => <Avatar key={m.userId} name={m.displayName} size={size} />)}
      {overflow > 0 && (
        <span
          className="avatar"
          style={{
            width: size, height: size, fontSize: size * 0.42,
            background: 'var(--bg-muted)', color: 'var(--fg-muted)',
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Team-grant row
// ---------------------------------------------------------------------------

function TeamGrantRow({
  grant, first, canEdit, tenant, workspace, onUpdate, onRevoke,
}: {
  grant: TeamAccess;
  first: boolean;
  canEdit: boolean;
  tenant: string;
  workspace: string;
  onUpdate: (role: 'write' | 'read') => void;
  onRevoke: () => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto auto auto',
      gap: 12, alignItems: 'center', padding: '12px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <TeamBadge team={{ name: grant.teamName, color: grant.teamColor }} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{grant.teamName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          <span className="tnum">{grant.memberCount}</span> member{grant.memberCount === 1 ? '' : 's'}
        </div>
      </div>
      {canEdit ? (
        <select
          value={grant.role}
          onChange={(e) => {
            const next = e.target.value as 'write' | 'read';
            if (next !== grant.role) onUpdate(next);
          }}
          className="input input-sm"
          style={{ width: 'auto' }}
          aria-label={`${grant.teamName} role`}
        >
          {/* admin intentionally absent — admin is never inherited via a team. */}
          <option value="write">Write</option>
          <option value="read">Read</option>
        </select>
      ) : (
        <RolePill role={grant.role} />
      )}
      <Link
        to={`/${tenant}/${workspace}/teams/${grant.teamSlug}`}
        className="btn btn-ghost btn-sm"
        style={{ textDecoration: 'none' }}
        data-tip="View team"
      >
        <Icon name="external" size={12} />
      </Link>
      {canEdit ? (
        <button onClick={onRevoke} className="btn btn-ghost btn-sm" data-tip="Revoke team grant" style={{ width: 28, padding: 0 }}>
          <Icon name="x" size={13} color="var(--fg-muted)" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// User-grant row
// ---------------------------------------------------------------------------

function UserGrantRow({
  grant, first, canEdit, onUpdate, onRevoke,
}: {
  grant: UserAccess;
  first: boolean;
  canEdit: boolean;
  onUpdate: (role: Role) => void;
  onRevoke: () => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
      gap: 12, alignItems: 'center', padding: '10px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <Avatar name={grant.displayName} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{grant.displayName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{grant.email}</div>
      </div>
      {canEdit ? (
        <select
          value={grant.role}
          onChange={(e) => {
            const next = e.target.value as Role;
            if (next !== grant.role) onUpdate(next);
          }}
          className="input input-sm"
          style={{ width: 'auto' }}
          aria-label={`${grant.displayName} role`}
        >
          {/* User overrides accept the full ladder — admin is fine here. */}
          <option value="admin">Admin</option>
          <option value="write">Write</option>
          <option value="read">Read</option>
        </select>
      ) : (
        <RolePill role={grant.role} />
      )}
      {canEdit ? (
        <button onClick={onRevoke} className="btn btn-ghost btn-sm" data-tip="Revoke override" style={{ width: 28, padding: 0 }}>
          <Icon name="x" size={13} color="var(--fg-muted)" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Effective-member row — read-only, shows provenance
// ---------------------------------------------------------------------------

const PROVENANCE_LABEL: Record<Provenance, string> = {
  'explicit-user': 'User override',
  'tenant-admin': 'Tenant admin',
  'workspace-admin': 'Workspace admin',
  team: 'Team',
};

function EffectiveRow({
  member, first,
}: {
  member: EffectiveMember;
  first: boolean;
}) {
  const teamSummary = member.viaTeams.length > 0
    ? member.viaTeams.map((t) => t.name).join(', ')
    : null;
  const sourceLabel = member.provenance === 'team' && teamSummary
    ? `Team: ${teamSummary}`
    : PROVENANCE_LABEL[member.provenance];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
      gap: 12, alignItems: 'center', padding: '10px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <Avatar name={member.displayName} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{member.displayName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{member.email}</div>
      </div>
      <span
        style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 10,
          background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
          color: 'var(--fg-muted)',
        }}
        data-tip={
          member.provenance === 'team'
            ? `Inherited from team grant${member.viaTeams.length > 1 ? 's' : ''}: ${teamSummary}`
            : member.provenance === 'explicit-user'
              ? 'Explicit per-user grant — wins over any team grants'
              : member.provenance === 'tenant-admin'
                ? 'Implicit admin from tenant-membership role'
                : 'Implicit admin from workspace-membership role'
        }
      >
        {sourceLabel}
      </span>
      <RolePill role={member.role} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role pill — non-editable display variant
// ---------------------------------------------------------------------------

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
    }}>{role}</span>
  );
}

// ---------------------------------------------------------------------------
// Add-team modal — pick a team + role (write/read only)
// ---------------------------------------------------------------------------

function AddTeamModal({
  excludeTeamIds, saving, onAdd, onClose,
}: {
  excludeTeamIds: Set<string>;
  saving: boolean;
  onAdd: (teamId: string, role: 'write' | 'read') => Promise<void>;
  onClose: () => void;
}) {
  const { teams } = useTeams();
  const [filter, setFilter] = useState('');
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  // Track per-row role selection. Defaults to 'write' which is the most
  // common project-team grant.
  const [roleFor, setRoleFor] = useState<Record<string, 'write' | 'read'>>({});

  const candidates = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return teams
      .filter((t) => !excludeTeamIds.has(t.id))
      .filter((t) => !f
        || t.name.toLowerCase().includes(f)
        || t.slug.toLowerCase().includes(f));
  }, [teams, excludeTeamIds, filter]);

  const onPick = async (teamId: string) => {
    setPendingTeamId(teamId);
    try {
      await onAdd(teamId, roleFor[teamId] ?? 'write');
    } finally {
      setPendingTeamId(null);
    }
  };

  return (
    <Modal onClose={onClose} align="top" label="Add team to project">
      <ModalHeader title="Add team to project" onClose={onClose} />
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
            <Icon name="search" size={13} />
          </span>
          <input
            autoFocus
            className="input input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter teams"
            style={{ paddingLeft: 28 }}
          />
        </div>
      </div>
      <div className="scroll" style={{ maxHeight: 360, overflow: 'auto', padding: 6 }}>
        {candidates.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            {filter ? `No teams match "${filter}".` : 'All teams already have access.'}
          </div>
        )}
        {candidates.map((t) => {
          const pending = pendingTeamId === t.id;
          const role = roleFor[t.id] ?? 'write';
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                opacity: saving && !pending ? 0.5 : 1,
              }}
            >
              <TeamBadge team={{ name: t.name, color: t.color }} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                  <span className="tnum">{t.memberCount}</span> member{t.memberCount === 1 ? '' : 's'}
                </div>
              </div>
              <select
                value={role}
                disabled={pending || saving}
                onChange={(e) => setRoleFor((prev) => ({ ...prev, [t.id]: e.target.value as 'write' | 'read' }))}
                className="input input-sm"
                style={{ width: 'auto' }}
                aria-label={`Role for ${t.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="write">Write</option>
                <option value="read">Read</option>
              </select>
              <button
                onClick={() => void onPick(t.id)}
                disabled={pending || saving}
                className="btn btn-primary btn-sm"
                style={{ padding: '0 10px' }}
              >
                {pending ? 'Adding…' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add-user modal — pick a workspace user + role (full ladder incl. admin)
// ---------------------------------------------------------------------------

function AddUserModal({
  excludeUserIds, saving, onAdd, onClose,
}: {
  excludeUserIds: Set<string>;
  saving: boolean;
  onAdd: (userId: string, role: Role) => Promise<void>;
  onClose: () => void;
}) {
  const { users } = useUsers();
  const [filter, setFilter] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [roleFor, setRoleFor] = useState<Record<string, Role>>({});

  const candidates = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return users
      .filter((u) => !excludeUserIds.has(u.id))
      .filter((u) => !f
        || u.displayName.toLowerCase().includes(f)
        || u.email.toLowerCase().includes(f));
  }, [users, excludeUserIds, filter]);

  const onPick = async (userId: string) => {
    setPendingUserId(userId);
    try {
      await onAdd(userId, roleFor[userId] ?? 'write');
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <Modal onClose={onClose} align="top" label="Add user override">
      <ModalHeader title="Add user override" onClose={onClose} />
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
            <Icon name="search" size={13} />
          </span>
          <input
            autoFocus
            className="input input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email"
            style={{ paddingLeft: 28 }}
          />
        </div>
      </div>
      <div className="scroll" style={{ maxHeight: 360, overflow: 'auto', padding: 6 }}>
        {candidates.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            {filter ? `No matches for "${filter}".` : 'Everyone with workspace access already has an override.'}
          </div>
        )}
        {candidates.map((u) => {
          const pending = pendingUserId === u.id;
          const role = roleFor[u.id] ?? 'write';
          return (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                opacity: saving && !pending ? 0.5 : 1,
              }}
            >
              <Avatar name={u.displayName} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{u.displayName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{u.email}</div>
              </div>
              <select
                value={role}
                disabled={pending || saving}
                onChange={(e) => setRoleFor((prev) => ({ ...prev, [u.id]: e.target.value as Role }))}
                className="input input-sm"
                style={{ width: 'auto' }}
                aria-label={`Role for ${u.displayName}`}
              >
                <option value="admin">Admin</option>
                <option value="write">Write</option>
                <option value="read">Read</option>
              </select>
              <button
                onClick={() => void onPick(u.id)}
                disabled={pending || saving}
                className="btn btn-primary btn-sm"
                style={{ padding: '0 10px' }}
              >
                {pending ? 'Adding…' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Empty state row — kept local; a full <EmptyState> would be too heavy here.
// ---------------------------------------------------------------------------

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="card" style={{
      padding: '20px 16px', textAlign: 'center',
      color: 'var(--fg-muted)', fontSize: 12.5,
    }}>{text}</div>
  );
}

