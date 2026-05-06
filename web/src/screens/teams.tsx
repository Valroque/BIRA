// /:tenant/:workspace/teams + /:tenant/:workspace/teams/:teamSlug
//
// Teams group workspace members. Adding a team to a project grants every
// team member access to that project's board / list / workflow.
//
// Slice 3 FE (2026-05-05) — switched off the `TEAMS` fixture and onto the
// API via `useTeams()` (`web/src/state/teams.tsx`). Membership is loaded
// eagerly: the BE list endpoint returns each team with `members[]` already
// hydrated, so the detail page reads from the cached list and just calls
// `refreshTeam` on mount as a revalidation. Mutations (create / rename /
// delete / add-member / remove-member) flow through the provider.
//
// Admin gating: every mutation surface is hidden / disabled unless the
// acting user has `role === 'admin'` on this workspace
// (`useWorkspaces().getWorkspace(workspace).role`). The BE enforces it
// independently — the FE gate is just to keep the surface honest.
//
// `MemberRow`, `AddMembersModal`, `AvatarStack`, `TeamBadge` are exported
// for `screens/project-members.tsx` (slice 4 territory) which is still
// fixture-driven; those exports keep speaking the fixture `TenantMember`
// shape so we don't pre-empt slice 4.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Avatar, useTenantContext, useTenantBreadcrumbs } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Section } from '../components/section';
import { ProjectBadge } from '../components/project-chip';
import { ErrorState, EmptyState } from '../components/states';
import { useDismiss } from '../components/use-dismiss';
import {
  TENANT_MEMBERS,
  type TenantMember,
} from '../fixtures';
import { useProjects } from '../state/projects';
import { useWorkspaces } from '../state/workspaces';
import { useTeams } from '../state/teams';
import { useWorkspaceMembers } from '../state/workspace-members';
import type { Team, TeamMember } from '../api/adapters/team.adapter';

// Small palette for the create form. Color is required by the BE; pick the
// first one as the default and let the user pick another if they care.
// Tokens don't cover this surface (per-team identity tints) so hex is fine —
// matches the existing fixture team colors.
const TEAM_COLORS = [
  '#0891b2', // teal
  '#9333ea', // purple
  '#ea580c', // orange
  '#0ea5e9', // sky
  '#16a34a', // green
  '#e11d48', // rose
  '#a16207', // amber
  '#475569', // slate
] as const;

// ---------------------------------------------------------------------------
// Index — /:tenant/:workspace/teams
// ---------------------------------------------------------------------------

export function TeamsPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { teams, loading, error, refresh } = useTeams();
  const { getWorkspace } = useWorkspaces();
  const isAdmin = getWorkspace(workspace)?.role === 'admin';

  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    if (!filter) return teams;
    const f = filter.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(f) || t.slug.includes(f));
  }, [teams, filter]);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Teams',
      ]} />
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Teams</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0', maxWidth: 720 }}>
              Group workspace members so you can grant project access by team. Adding a team to a project gives every member access.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!isAdmin}
            data-tip={!isAdmin ? 'Only workspace admins can create teams.' : undefined}
            className="btn btn-primary"
          >
            <Icon name="plus" size={13} />New team
          </button>
        </div>
        <div style={{ position: 'relative', maxWidth: 320, marginTop: 14 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
            <Icon name="search" size={13} />
          </span>
          <input
            className="input input-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter teams"
            style={{ paddingLeft: 28 }}
          />
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            Loading teams…
          </div>
        )}
        {error && !loading && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => void refresh()} className="btn btn-sm">Retry</button>
          </div>
        )}
        {!loading && !error && teams.length === 0 && (
          <EmptyState
            icon="users"
            title="No teams yet"
            description="Create a team to group workspace members and grant project access in bulk."
            action={isAdmin ? (
              <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />New team
              </button>
            ) : undefined}
          />
        )}
        {!loading && !error && teams.length > 0 && filtered.length === 0 && (
          <div style={{
            padding: 48, textAlign: 'center',
            background: 'var(--bg-subtle)', borderRadius: 8,
            color: 'var(--fg-muted)',
          }}>
            No teams match "{filter}".
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map((t) => <TeamCard key={t.id} team={t} tenant={tenant} workspace={workspace} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function TeamCard({ team, tenant, workspace }: { team: Team; tenant: string; workspace: string }) {
  const { projectsForTeam } = useProjects();
  const projects = projectsForTeam(team.slug);
  return (
    <Link
      to={`/${tenant}/${workspace}/teams/${team.slug}`}
      className="card"
      style={{ padding: 16, textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <TeamBadge team={team} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{team.name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>#{team.slug}</div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.5, minHeight: 36 }}>
        {team.description || <span style={{ color: 'var(--fg-faint)', fontStyle: 'italic' }}>No description</span>}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--fg-muted)' }}>
        <AvatarStack
          members={team.members.map((m) => ({ email: m.email, name: m.displayName }))}
          max={4}
        />
        <span>
          <span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{team.memberCount}</span> member{team.memberCount === 1 ? '' : 's'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="folder" size={11} />
          <span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{projects.length}</span>
          <span>project{projects.length === 1 ? '' : 's'}</span>
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Detail — /:tenant/:workspace/teams/:teamSlug
// ---------------------------------------------------------------------------

export function TeamDetailPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { teamSlug = '' } = useParams<{ teamSlug: string }>();
  const { teams, loading, error, getTeam, refreshTeam, refresh } = useTeams();

  // Revalidate this team on mount, even if the list cache already has it —
  // makes the detail screen authoritative when navigated to from elsewhere.
  // Best-effort: failure surfaces via the list-level error banner.
  useEffect(() => {
    if (!teamSlug) return;
    refreshTeam(teamSlug).catch(() => { /* swallow — error visible via list `error` */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSlug, tenant, workspace]);

  if (loading && teams.length === 0) {
    return (
      <div className="bira" style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
        Loading team…
      </div>
    );
  }

  if (error && teams.length === 0) {
    return (
      <ErrorState
        title="Couldn't load teams"
        description={error}
        action={
          <button onClick={() => void refresh()} className="btn btn-primary btn-sm">
            <Icon name="rotate" size={13} />Retry
          </button>
        }
      />
    );
  }

  const team = getTeam(teamSlug);
  if (!team) {
    return (
      <ErrorState
        code="404"
        title="Team not found"
        description={<>The team <span className="mono">{teamSlug}</span> doesn't exist in this workspace.</>}
        action={
          <Link to={`/${tenant}/${workspace}/teams`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            <Icon name="arrowRight" size={13} />Back to teams
          </Link>
        }
      />
    );
  }

  return (
    <TeamDetail
      team={team}
      tenant={tenant}
      workspace={workspace}
      tenantName={tenantName}
      workspaceName={workspaceName}
    />
  );
}

function TeamDetail({
  team, tenant, workspace, tenantName, workspaceName,
}: {
  team: Team; tenant: string; workspace: string; tenantName: string; workspaceName: string;
}) {
  const navigate = useNavigate();
  const { projectsForTeam } = useProjects();
  const { getWorkspace } = useWorkspaces();
  const { update, remove, addMember, removeMember } = useTeams();
  const isAdmin = getWorkspace(workspace)?.role === 'admin';

  const [showAddMember, setShowAddMember] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const projects = projectsForTeam(team.slug);

  const handleRemove = async (member: TeamMember) => {
    if (!window.confirm(
      `Remove ${member.displayName} from ${team.name}? They'll lose any project access they got through this team.`
    )) return;
    setActionError(null);
    try {
      await removeMember(team.slug, member.userId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleAdd = async (userId: string) => {
    // Errors propagate to the modal, which surfaces them in-context and
    // keeps itself open so the user can retry or pick a different person.
    await addMember(team.slug, userId);
    setShowAddMember(false);
  };

  const handleUpdate = async (patch: { name?: string; description?: string; color?: string }) => {
    setActionError(null);
    try {
      await update(team.slug, patch);
      setShowEdit(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update team');
      // Re-throw so the modal can keep itself open and show the error.
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(
      `Delete ${team.name}? This will remove the team from every project it's been added to. Members keep their workspace access; only the team-based grant goes away.`
    )) return;
    setActionError(null);
    try {
      await remove(team.slug);
      navigate(`/${tenant}/${workspace}/teams`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: 'Teams', to: `/${tenant}/${workspace}/teams` },
        team.name,
      ]} />
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamBadge team={team} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{team.name}</h1>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>#{team.slug}</div>
          </div>
          {isAdmin && (
            <>
              <button
                onClick={() => setShowEdit(true)}
                className="btn btn-sm"
                data-tip="Edit team"
              ><Icon name="edit" size={13} />Edit</button>
              <TeamActionsMenu onDelete={handleDelete} />
            </>
          )}
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '12px 0 0', maxWidth: 720 }}>
          {team.description || <span style={{ color: 'var(--fg-faint)', fontStyle: 'italic' }}>No description</span>}
        </p>
        {actionError && (
          <div style={{
            marginTop: 12,
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
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
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 760 }}>

          <Section
            title={`Members · ${team.members.length}`}
            subtitle="Anyone in this list inherits access to every project this team is added to."
            action={isAdmin ? (
              <button onClick={() => setShowAddMember(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />Add member
              </button>
            ) : undefined}
          >
            {team.members.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                No members yet.{isAdmin && (
                  <> <button onClick={() => setShowAddMember(true)} style={linkBtn}>Add the first one</button>.</>
                )}
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {team.members.map((m, i) => (
                  <TeamMemberRow
                    key={m.userId}
                    member={m}
                    first={i === 0}
                    canRemove={isAdmin}
                    onRemove={() => handleRemove(m)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`Projects · ${projects.length}`}
            subtitle="Projects where this team has been added. Adding/removing happens on each project's Members page."
          >
            {projects.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                Not added to any project yet.
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {projects.map((p, i) => (
                  <Link
                    key={p.slug}
                    to={`/${tenant}/${workspace}/${p.slug}/members`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', textDecoration: 'none', color: 'inherit',
                      borderTop: i === 0 ? 'none' : '1px solid var(--border-muted)',
                    }}
                  >
                    <ProjectBadge project={p} size={28} radius={6} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{p.key}</div>
                    </div>
                    <Icon name="chevronRight" size={13} color="var(--fg-faint)" />
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {showAddMember && (
        <AddTeamMemberModal
          team={team}
          onAdd={handleAdd}
          onClose={() => setShowAddMember(false)}
        />
      )}
      {showEdit && (
        <EditTeamModal
          team={team}
          onSave={handleUpdate}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team-member row (uses the new TeamMember adapter shape)
// ---------------------------------------------------------------------------

function TeamMemberRow({
  member, first, canRemove, onRemove,
}: {
  member: TeamMember;
  first: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto',
      gap: 12, alignItems: 'center', padding: '10px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <Avatar name={member.displayName} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{member.displayName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{member.email}</div>
      </div>
      {canRemove ? (
        <button onClick={onRemove} className="btn btn-ghost btn-sm" data-tip="Remove from team" style={{ width: 28, padding: 0 }}>
          <Icon name="x" size={13} color="var(--fg-muted)" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action-menu for the team header (delete only for now; rename lives on the
// inline Edit button so it doesn't need to go through a menu).
// ---------------------------------------------------------------------------

function TeamActionsMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 28, padding: 0 }}
        onClick={() => setOpen((o) => !o)}
        data-tip="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="moreV" size={14} color="var(--fg-muted)" />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            minWidth: 180, background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 6,
            boxShadow: 'var(--shadow-md)', padding: 4, zIndex: 30,
          }}
        >
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            role="menuitem"
            className="menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 10px', borderRadius: 4,
              border: 'none', background: 'transparent', cursor: 'pointer',
              textAlign: 'left', color: 'var(--blocked)', fontSize: 13,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--blocked) 10%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name="trash" size={13} />Delete team
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-member modal — picks from workspace users not already on the team
// ---------------------------------------------------------------------------

function AddTeamMemberModal({
  team, onAdd, onClose,
}: {
  team: Team;
  onAdd: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { members } = useWorkspaceMembers();
  const [filter, setFilter] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existing = useMemo(() => new Set(team.members.map((m) => m.userId)), [team.members]);
  // Tenant admins without an explicit workspace_memberships row come back
  // from the BE with a sentinel `tenant-admin:<userId>` membershipId. The
  // team-add usecase only accepts users with a real (UUID) row, so we mark
  // them as `addable: false` and render them disabled with a hint instead
  // of letting the user click into a 400.
  const candidates = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return members
      .filter((m) => !existing.has(m.userId))
      .filter((m) => !f || m.displayName.toLowerCase().includes(f) || m.email.toLowerCase().includes(f))
      .map((m) => ({
        member: m,
        addable: !m.membershipId.startsWith('tenant-admin:') && m.status === 'active',
      }));
  }, [members, existing, filter]);

  const onPick = async (userId: string) => {
    setPendingUserId(userId);
    setError(null);
    try {
      await onAdd(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <Modal onClose={onClose} align="top" label={`Add to ${team.name}`}>
      <ModalHeader title={`Add to ${team.name}`} onClose={onClose} />
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
      {error && (
        <div style={{
          margin: '10px 14px 0', padding: '7px 10px', borderRadius: 6, fontSize: 12,
          background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
          border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
          color: 'var(--blocked)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            className="btn btn-sm"
            style={{ padding: '0 6px', height: 22 }}
          >Dismiss</button>
        </div>
      )}
      <div className="scroll" style={{ maxHeight: 360, overflow: 'auto', padding: 6 }}>
        {candidates.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            {filter ? `No matches for "${filter}".` : 'Everyone is already added.'}
          </div>
        )}
        {candidates.map(({ member, addable }) => {
          const pending = pendingUserId === member.userId;
          const disabled = !addable || pending || pendingUserId !== null;
          const isImplicit = member.membershipId.startsWith('tenant-admin:');
          const tip = isImplicit
            ? 'Tenant admin with implicit access only — add explicitly via Settings → Members to put them on a team.'
            : !addable
              ? `Membership is ${member.status} — only active workspace members can join teams.`
              : undefined;
          return (
            <button
              key={member.userId}
              onClick={() => addable && void onPick(member.userId)}
              disabled={disabled}
              data-tip={tip}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px', borderRadius: 6,
                border: 'none',
                cursor: !addable ? 'not-allowed' : pending ? 'progress' : 'pointer',
                background: 'transparent', textAlign: 'left',
                opacity: !addable ? 0.55 : pendingUserId !== null && !pending ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (addable && pendingUserId === null) e.currentTarget.style.background = 'var(--bg-subtle)';
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Avatar name={member.displayName} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{member.displayName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{member.email}</div>
              </div>
              {pending ? (
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Adding…</span>
              ) : !addable ? (
                <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Not in workspace</span>
              ) : (
                <Icon name="plus" size={13} color="var(--fg-muted)" />
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit-team modal — name / description / color
// ---------------------------------------------------------------------------

function EditTeamModal({
  team, onSave, onClose,
}: {
  team: Team;
  onSave: (patch: { name?: string; description?: string; color?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description);
  const [color, setColor] = useState(team.color);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = name !== team.name || description !== team.description || color !== team.color;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) { onClose(); return; }
    setSaving(true);
    setErr(null);
    try {
      const patch: { name?: string; description?: string; color?: string } = {};
      if (name !== team.name) patch.name = name;
      if (description !== team.description) patch.description = description;
      if (color !== team.color) patch.color = color;
      await onSave(patch);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth={460} label="Edit team" onSubmit={submit}>
      <ModalHeader title="Edit team" onClose={onClose} />
      <ModalBody>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={fieldLabel}>Name</div>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={fieldLabel}>Description</div>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </label>
        <div style={{ marginBottom: 4 }}>
          <div style={fieldLabel}>Color</div>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>
        {err && (
          <div style={{
            marginTop: 12,
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            color: 'var(--blocked)',
          }}>
            {err}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm" disabled={saving}>Cancel</button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={saving || !name.trim() || !dirty}
        >
          <Icon name="check" size={13} />{saving ? 'Saving…' : 'Save'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Create-team modal — name / slug / description / color
// ---------------------------------------------------------------------------

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { tenant, workspace } = useTenantContext();
  const { create } = useTeams();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(TEAM_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-derive slug from name until the user types directly into the slug
  // input. After that, manual edits stick.
  const [slugDirty, setSlugDirty] = useState(false);
  const onName = (v: string) => {
    setName(v);
    if (!slugDirty) {
      setSlug(v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };
  const onSlugInput = (v: string) => {
    setSlugDirty(true);
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const created = await create({
        slug,
        name,
        color,
        description: description.trim() ? description.trim() : undefined,
      });
      onClose();
      navigate(`/${tenant}/${workspace}/teams/${created.slug}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to create team');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth={460} label="New team" onSubmit={submit}>
      <ModalHeader title="New team" onClose={onClose} />
      <ModalBody>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={fieldLabel}>Name</div>
          <input autoFocus className="input" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Mobile" required />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={fieldLabel}>Slug</div>
          <input
            className="input mono"
            value={slug}
            onChange={(e) => onSlugInput(e.target.value)}
            placeholder="mobile"
            required
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={fieldLabel}>Description</div>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={3}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </label>
        <div style={{ marginBottom: 4 }}>
          <div style={fieldLabel}>Color</div>
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>
        {err && (
          <div style={{
            marginTop: 12,
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            color: 'var(--blocked)',
          }}>
            {err}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm" disabled={saving}>Cancel</button>
        <button type="submit" disabled={!name || !slug || saving} className="btn btn-primary btn-sm">
          <Icon name="check" size={13} />{saving ? 'Creating…' : 'Create team'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {TEAM_COLORS.map((c) => {
        const selected = c === value;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            data-tip={c}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: c, color: '#fff',
              border: selected ? '2px solid var(--fg)' : '2px solid transparent',
              boxShadow: selected ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {selected && <Icon name="check" size={12} />}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable atoms — kept exported because `screens/project-members.tsx` and
// `screens/board.tsx` consume them. Slice 4 will retire the fixture-shaped
// pieces alongside the project-access rewrite.
// ---------------------------------------------------------------------------

/**
 * Member row used by both team-detail (legacy fixture call sites) and
 * project-members. Speaks the fixture `TenantMember` shape; the new
 * API-backed `TeamMemberRow` lives above and is internal.
 */
export function MemberRow({
  member, first, onRemove, removeTip = 'Remove',
}: {
  member: TenantMember;
  first?: boolean;
  onRemove: () => void;
  removeTip?: string;
}) {
  // Display the tenant role pill — it's the most-true role label at this
  // surface (per-project explicit users). The effective workspace role
  // is shown on Settings → Members instead.
  const role = member.tenantRole;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
      gap: 12, alignItems: 'center', padding: '10px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <Avatar name={member.name} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{member.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{member.email}</div>
      </div>
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
      <button onClick={onRemove} className="btn btn-ghost btn-sm" data-tip={removeTip} style={{ width: 28, padding: 0 }}>
        <Icon name="x" size={13} color="var(--fg-muted)" />
      </button>
    </div>
  );
}

/**
 * Tenant-member picker modal. Slice 4 will replace the call sites with the
 * UUID-keyed equivalent; for now this still speaks tenant emails so
 * `screens/project-members.tsx` keeps working unchanged.
 */
export function AddMembersModal({
  excludeEmails, title, onAdd, onClose,
}: {
  excludeEmails: string[];
  title: string;
  onAdd: (email: string) => void;
  onClose: () => void;
}) {
  const { tenant } = useTenantContext();
  const [filter, setFilter] = useState('');
  const tenantMembers = TENANT_MEMBERS[tenant] ?? [];
  const candidates = tenantMembers.filter((m) =>
    !excludeEmails.includes(m.email) && m.status === 'active'
  ).filter((m) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return m.name.toLowerCase().includes(f) || m.email.toLowerCase().includes(f);
  });

  return (
    <Modal onClose={onClose} align="top" label={title}>
      <ModalHeader title={title} onClose={onClose} />
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
            {filter
              ? `No matches for "${filter}".`
              : 'Everyone is already added.'}
          </div>
        )}
        {candidates.map((m) => (
          <button
            key={m.email}
            onClick={() => onAdd(m.email)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 10px', borderRadius: 6,
              border: 'none', cursor: 'pointer', background: 'transparent',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Avatar name={m.name} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{m.email}</div>
            </div>
            <Icon name="plus" size={13} color="var(--fg-muted)" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

// `TeamBadge` accepts any object that exposes `name` and `color`. Both the
// fixture `Team` and the API-backed `Team` satisfy this — keeps slice 4
// callers (project-members) compatible without forcing a shape conversion.
export function TeamBadge({ team, size = 24 }: { team: { name: string; color: string }; size?: number }) {
  return (
    <span
      title={team.name}
      style={{
        width: size, height: size, borderRadius: Math.round(size / 4),
        background: team.color, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: Math.round(size * 0.42),
        flexShrink: 0,
      }}
    >
      {team.name[0]}
    </span>
  );
}

export function AvatarStack({ members, max = 5, size = 22 }: { members: Array<{ email: string; name: string }>; max?: number; size?: number }) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <span className="avatar-stack">
      {visible.map((m) => <Avatar key={m.email} name={m.name} size={size} />)}
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

const linkBtn: CSSProperties = {
  background: 'transparent', border: 'none', padding: 0,
  color: 'var(--accent)', cursor: 'pointer', fontSize: 'inherit',
};

const fieldLabel: CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
};
