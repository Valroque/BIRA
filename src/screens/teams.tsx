// /:workspace/teams + /:workspace/teams/:slug
//
// Teams group workspace members. Adding a team to a project grants every
// team member access to that project's board / list / workflow.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Avatar, useWorkspaceContext } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Section } from '../components/section';
import { ProjectBadge } from '../components/project-chip';
import { ErrorState } from '../components/states';
import {
  TEAMS, MEMBERS,
  teamBySlug, memberByEmail,
  type Member, type Team,
} from '../fixtures';
import { useProjects } from '../state/projects';

// ----- Index -----

export function TeamsPage() {
  const { workspace } = useWorkspaceContext();
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = TEAMS.filter((t) =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
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
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
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
        {filtered.length === 0 ? (
          <div style={{
            padding: 48, textAlign: 'center',
            background: 'var(--bg-subtle)', borderRadius: 8,
            color: 'var(--fg-muted)',
          }}>
            No teams match "{filter}".
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filtered.map((t) => <TeamCard key={t.slug} team={t} workspace={workspace} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function TeamCard({ team, workspace }: { team: Team; workspace: string }) {
  const { projectsForTeam } = useProjects();
  const projects = projectsForTeam(team.slug);
  return (
    <Link
      to={`/${workspace}/teams/${team.slug}`}
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
        {team.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--fg-muted)' }}>
        <AvatarStack
          members={team.memberEmails.map(memberByEmail).filter((m): m is Member => !!m)}
          max={4}
        />
        <span>
          <span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{team.memberEmails.length}</span> members
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

// ----- Detail -----

export function TeamDetailPage() {
  const { workspace } = useWorkspaceContext();
  const { teamSlug } = useParams<{ teamSlug: string }>();
  const team = teamSlug ? teamBySlug(teamSlug) : undefined;

  if (!team) {
    return (
      <ErrorState
        code="404"
        title="Team not found"
        description={<>The team <span className="mono">{teamSlug}</span> doesn't exist in this workspace.</>}
        action={
          <Link to={`/${workspace}/teams`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            <Icon name="arrowRight" size={13} />Back to teams
          </Link>
        }
      />
    );
  }

  return <TeamDetail team={team} workspace={workspace} />;
}

function TeamDetail({ team, workspace }: { team: Team; workspace: string }) {
  const { projectsForTeam } = useProjects();
  const [memberEmails, setMemberEmails] = useState<string[]>(team.memberEmails);
  const [showAddMember, setShowAddMember] = useState(false);

  const remove = (email: string) => setMemberEmails((prev) => prev.filter((e) => e !== email));
  const add = (email: string) => {
    setMemberEmails((prev) => prev.includes(email) ? prev : [...prev, email]);
    setShowAddMember(false);
  };

  const teamMembers = memberEmails
    .map(memberByEmail)
    .filter((m): m is Member => !!m);
  const projects = projectsForTeam(team.slug);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: 'Teams', to: `/${workspace}/teams` },
        team.name,
      ]} />
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamBadge team={team} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>{team.name}</h1>
            <div className="mono" style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 2 }}>#{team.slug}</div>
          </div>
          <button className="btn btn-sm" data-tip="Edit team"><Icon name="edit" size={13} />Edit</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '12px 0 0', maxWidth: 720 }}>
          {team.description}
        </p>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 760 }}>

          <Section
            title={`Members · ${teamMembers.length}`}
            subtitle="Anyone in this list inherits access to every project this team is added to."
            action={
              <button onClick={() => setShowAddMember(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />Add member
              </button>
            }
          >
            {teamMembers.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                No members yet. <button onClick={() => setShowAddMember(true)} style={linkBtn}>Add the first one</button>.
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {teamMembers.map((m, i) => (
                  <MemberRow key={m.email} member={m} first={i === 0} onRemove={() => remove(m.email)} removeTip="Remove from team" />
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
                    to={`/${workspace}/${p.slug}/members`}
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
        <AddMembersModal
          excludeEmails={memberEmails}
          title={`Add to ${team.name}`}
          onAdd={add}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  );
}

/**
 * Avatar + name/email + role pill + remove button. Used by both team detail
 * (rendering team members) and project-members (rendering individuals with
 * explicit project access). Caller controls the tooltip on the remove button
 * via `removeTip`.
 */
export function MemberRow({
  member, first, onRemove, removeTip = 'Remove',
}: {
  member: Member;
  first?: boolean;
  onRemove: () => void;
  removeTip?: string;
}) {
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
          member.role === 'admin' ? 'var(--accent-muted)' :
          member.role === 'write' ? 'var(--done-bg)' :
          'var(--bg-muted)',
        color:
          member.role === 'admin' ? 'var(--accent-active)' :
          member.role === 'write' ? 'var(--done)' :
          'var(--fg-muted)',
      }}>{member.role}</span>
      <button onClick={onRemove} className="btn btn-ghost btn-sm" data-tip={removeTip} style={{ width: 28, padding: 0 }}>
        <Icon name="x" size={13} color="var(--fg-muted)" />
      </button>
    </div>
  );
}

// ----- Shared bits used by detail + project-members modals -----

export function AddMembersModal({
  excludeEmails, title, onAdd, onClose,
}: {
  excludeEmails: string[];
  title: string;
  onAdd: (email: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const candidates = MEMBERS.filter((m) =>
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

// ----- Reusable atoms used here only -----

export function TeamBadge({ team, size = 24 }: { team: Team; size?: number }) {
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

export function AvatarStack({ members, max = 5, size = 22 }: { members: Member[]; max?: number; size?: number }) {
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

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { workspace } = useWorkspaceContext();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const onName = (v: string) => {
    setName(v);
    setSlug(v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  return (
    <Modal
      onClose={onClose}
      maxWidth={460}
      label="New team"
      onSubmit={(e) => { e.preventDefault(); onClose(); navigate(`/${workspace}/teams/${slug || 'team'}`); }}
    >
      <ModalHeader title="New team" onClose={onClose} />
      <ModalBody>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Name</div>
          <input autoFocus className="input" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Mobile" required />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Slug</div>
          <input
            className="input mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="mobile"
            required
          />
        </label>
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
        <button type="submit" disabled={!name || !slug} className="btn btn-primary btn-sm">
          <Icon name="check" size={13} />Create team
        </button>
      </ModalFooter>
    </Modal>
  );
}

const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 0,
  color: 'var(--accent)', cursor: 'pointer', fontSize: 'inherit',
};
