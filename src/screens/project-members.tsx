// /:workspace/:project/members
//
// Per-project access management. A project's effective members = the union of
// every team's members (for teams added to the project) + explicit individuals.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, Avatar, projectTabs, useWorkspaceContext } from '../components/shell';
import { AddMembersModal, AvatarStack, TeamBadge } from './teams';
import {
  TEAMS,
  teamBySlug, memberByEmail,
  type Member, type Team,
} from '../fixtures';
import { useProjects } from '../state/projects';

export function ProjectMembersPage() {
  const { workspace, project } = useWorkspaceContext();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);

  const [teamSlugs, setTeamSlugs] = useState<string[]>(projectInfo?.teamSlugs ?? []);
  const [userEmails, setUserEmails] = useState<string[]>(projectInfo?.userEmails ?? []);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const teams = teamSlugs.map(teamBySlug).filter((t): t is Team => !!t);
  const explicitUsers = userEmails.map(memberByEmail).filter((m): m is Member => !!m);

  // Effective members: dedupe across teams + explicit users.
  const effectiveEmails = new Set<string>(userEmails);
  teams.forEach((t) => t.memberEmails.forEach((e) => effectiveEmails.add(e)));
  const effective = Array.from(effectiveEmails)
    .map(memberByEmail)
    .filter((m): m is Member => !!m && m.status === 'active');

  const removeTeam = (slug: string) => setTeamSlugs((prev) => prev.filter((s) => s !== slug));
  const addTeam = (slug: string) => setTeamSlugs((prev) => prev.includes(slug) ? prev : [...prev, slug]);
  const removeUser = (email: string) => setUserEmails((prev) => prev.filter((e) => e !== email));
  const addUser = (email: string) => setUserEmails((prev) => prev.includes(email) ? prev : [...prev, email]);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${workspace}/${project}` },
        'Members',
      ]} />
      <Tabs active="members" tabs={projectTabs(workspace, project)} />

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 760 }}>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 14, marginBottom: 22,
            background: 'var(--bg-subtle)', borderRadius: 8,
            border: '1px solid var(--border-muted)',
          }}>
            <AvatarStack members={effective} max={6} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {effective.length} effective {effective.length === 1 ? 'member' : 'members'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                Across {teams.length} team{teams.length === 1 ? '' : 's'} and {explicitUsers.length} explicit individual{explicitUsers.length === 1 ? '' : 's'}.
              </div>
            </div>
          </div>

          <Section
            title={`Teams · ${teams.length}`}
            subtitle="Adding a team grants every member of that team access to this project."
            action={
              <button onClick={() => setShowAddTeam(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />Add team
              </button>
            }
          >
            {teams.length === 0 ? (
              <EmptyRow text="No teams added. Click Add team above to grant a whole group access at once." />
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {teams.map((t, i) => (
                  <TeamRow
                    key={t.slug}
                    team={t}
                    workspace={workspace}
                    first={i === 0}
                    onRemove={() => removeTeam(t.slug)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`Individual members · ${explicitUsers.length}`}
            subtitle="People with access on top of any team membership. Useful for one-off contributors."
            action={
              <button onClick={() => setShowAddMember(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />Add member
              </button>
            }
          >
            {explicitUsers.length === 0 ? (
              <EmptyRow text="No individuals added. Most members get access through a team — add an individual here only if you need a one-off." />
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {explicitUsers.map((m, i) => (
                  <MemberRow
                    key={m.email}
                    member={m}
                    first={i === 0}
                    onRemove={() => removeUser(m.email)}
                  />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {showAddTeam && (
        <AddTeamModal
          excludeSlugs={teamSlugs}
          onAdd={(slug) => { addTeam(slug); setShowAddTeam(false); }}
          onClose={() => setShowAddTeam(false)}
        />
      )}
      {showAddMember && (
        <AddMembersModal
          // Exclude users who already have access (via any team or explicitly).
          excludeEmails={Array.from(effectiveEmails)}
          title={`Add member to ${projectInfo?.name ?? project}`}
          onAdd={(email) => addUser(email)}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  );
}

function TeamRow({ team, workspace, first, onRemove }: { team: Team; workspace: string; first?: boolean; onRemove: () => void }) {
  const teamMembers = team.memberEmails.map(memberByEmail).filter((m): m is Member => !!m);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr auto auto auto',
      gap: 12, alignItems: 'center', padding: '12px 14px',
      borderTop: first ? 'none' : '1px solid var(--border-muted)',
    }}>
      <TeamBadge team={team} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{team.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          <span className="tnum">{team.memberEmails.length}</span> member{team.memberEmails.length === 1 ? '' : 's'}
        </div>
      </div>
      <AvatarStack members={teamMembers} max={4} size={20} />
      <Link
        to={`/${workspace}/teams/${team.slug}`}
        className="btn btn-ghost btn-sm"
        style={{ textDecoration: 'none' }}
        data-tip="View team"
      >
        <Icon name="external" size={12} />
      </Link>
      <button onClick={onRemove} className="btn btn-ghost btn-sm" data-tip="Remove team" style={{ width: 28, padding: 0 }}>
        <Icon name="x" size={13} color="var(--fg-muted)" />
      </button>
    </div>
  );
}

function MemberRow({ member, first, onRemove }: { member: Member; first?: boolean; onRemove: () => void }) {
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
        background: member.role === 'admin' ? 'var(--accent-muted)' : 'var(--bg-muted)',
        color: member.role === 'admin' ? 'var(--accent-active)' : 'var(--fg-muted)',
      }}>{member.role}</span>
      <button onClick={onRemove} className="btn btn-ghost btn-sm" data-tip="Remove member" style={{ width: 28, padding: 0 }}>
        <Icon name="x" size={13} color="var(--fg-muted)" />
      </button>
    </div>
  );
}

function AddTeamModal({
  excludeSlugs, onAdd, onClose,
}: {
  excludeSlugs: string[];
  onAdd: (slug: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const candidates = TEAMS.filter((t) => !excludeSlugs.includes(t.slug)).filter((t) => {
    if (!filter) return true;
    return t.name.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Add a team</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 24, padding: 0 }}>
            <Icon name="x" size={13} />
          </button>
        </div>
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
              {filter ? `No teams match "${filter}".` : 'All teams are already added.'}
            </div>
          )}
          {candidates.map((t) => {
            const teamMembers = t.memberEmails.map(memberByEmail).filter((m): m is Member => !!m);
            return (
              <button
                key={t.slug}
                onClick={() => onAdd(t.slug)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  border: 'none', cursor: 'pointer', background: 'transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <TeamBadge team={t} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                    <span className="tnum">{t.memberEmails.length}</span> members
                  </div>
                </div>
                <AvatarStack members={teamMembers} max={3} size={18} />
                <Icon name="plus" size={13} color="var(--fg-muted)" style={{ marginLeft: 6 }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Section({
  title, subtitle, action, children,
}: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: subtitle ? 4 : 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h2>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {subtitle && <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px' }}>{subtitle}</p>}
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="card" style={{
      padding: '20px 16px', textAlign: 'center',
      color: 'var(--fg-muted)', fontSize: 12.5,
    }}>{text}</div>
  );
}
