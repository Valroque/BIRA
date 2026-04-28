// /:workspace/u/:email
//
// Per-member profile. Reachable from the "opened by …" header on issue
// detail and any other person reference we wire up later. Read-only —
// editing the current user's profile lives in /:workspace/settings/profile.

import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import {
  TopBar, Avatar, IssueId, TypeChip, StatusDot, Priority,
  useTenantContext, useTenantBreadcrumbs,
} from '../components/shell';
import { Section } from '../components/section';
import { ProjectBadge } from '../components/project-chip';
import { ErrorState } from '../components/states';
import {
  ISSUES, TEAMS, memberByEmail,
  type Member, type Issue,
} from '../fixtures';
import { useProjects } from '../state/projects';

const ROLE_LABEL: Record<Member['role'], string> = {
  admin: 'Admin',
  write: 'Write',
  read: 'Read',
};

export function MemberProfilePage() {
  const { tenant, workspace } = useTenantContext();
  const { email } = useParams<{ email: string }>();
  // React Router decodes path params for us, so `email` is already the
  // raw "jordan@acme.com" form — no manual decode needed.
  const member = email ? memberByEmail(email) : undefined;

  if (!member) {
    return (
      <ErrorState
        code="404"
        title="Member not found"
        description={
          <>No member with the email <span className="mono">{email}</span> exists in this workspace.</>
        }
        action={
          <Link
            to={`/${tenant}/${workspace}/settings/members`}
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="arrowRight" size={13} />Workspace members
          </Link>
        }
      />
    );
  }

  return <MemberProfile member={member} />;
}

function MemberProfile({ member }: { member: Member }) {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { projects } = useProjects();

  // Issues visible to a member: anything currently assigned to them. The
  // fixture model doesn't carry a separate "reporter" field per issue, so
  // assignee is the only person dimension we can surface here for v1.
  const assigned = ISSUES.filter((i) => i.assignee === member.name);

  const teams = TEAMS.filter((t) => t.memberEmails.includes(member.email));

  // Effective project access: explicit user grant OR inherited via any team
  // the member is on. Mirrors the resolution rule in v1-constraints.md.
  const memberProjects = projects.filter((p) => {
    if (p.userEmails.includes(member.email)) return true;
    return p.teamSlugs.some((slug) => {
      const team = TEAMS.find((t) => t.slug === slug);
      return team?.memberEmails.includes(member.email);
    });
  });

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar
        breadcrumbs={[
          { label: tenantName, to: `/${tenant}/workspaces` },
          { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
          { label: 'Members', to: `/${tenant}/${workspace}/settings/members` },
          member.name,
        ]}
      />

      <div style={{ padding: '20px 28px 18px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={member.name} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
              {member.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{member.email}</span>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <RolePill role={member.role} />
              <StatusPill status={member.status} />
              {member.status === 'active' && (
                <>
                  <span style={{ color: 'var(--fg-faint)' }}>·</span>
                  <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>
                    Last seen {member.lastSeen}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 760 }}>

          <Section
            title={`Teams · ${teams.length}`}
            subtitle="Teams this person is a member of."
          >
            {teams.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                Not on any team yet.
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {teams.map((t, i) => (
                  <Link
                    key={t.slug}
                    to={`/${tenant}/${workspace}/teams/${t.slug}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', textDecoration: 'none', color: 'inherit',
                      borderTop: i === 0 ? 'none' : '1px solid var(--border-muted)',
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: t.color, color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}>
                      {t.name.slice(0, 1)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                      <div style={{
                        fontSize: 11.5, color: 'var(--fg-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.description}
                      </div>
                    </div>
                    <Icon name="chevronRight" size={13} color="var(--fg-faint)" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section
            title={`Projects · ${memberProjects.length}`}
            subtitle="Projects where this person has access via team or direct grant."
          >
            {memberProjects.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                No project access yet.
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {memberProjects.map((p, i) => (
                  <Link
                    key={p.slug}
                    to={`/${tenant}/${workspace}/${p.slug}`}
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

          <Section
            title={`Assigned issues · ${assigned.length}`}
            subtitle="Issues currently assigned to this person."
          >
            {assigned.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
                No issues currently assigned.
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {assigned.map((i, idx) => (
                  <AssignedIssueRow key={i.id} issue={i} first={idx === 0} tenant={tenant} workspace={workspace} />
                ))}
              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  );
}

function AssignedIssueRow({ issue, first, tenant, workspace }: { issue: Issue; first: boolean; tenant: string; workspace: string }) {
  return (
    <Link
      to={`/${tenant}/${workspace}/${issue.project}/issue/${issue.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', textDecoration: 'none', color: 'inherit',
        borderTop: first ? 'none' : '1px solid var(--border-muted)',
      }}
    >
      <StatusDot status={issue.status} size={10} />
      <TypeChip type={issue.type} />
      <IssueId id={issue.id} />
      <span style={{
        flex: 1, fontSize: 13,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {issue.title}
      </span>
      <Priority p={issue.priority} />
    </Link>
  );
}

function RolePill({ role }: { role: Member['role'] }) {
  return (
    <span
      className="pill"
      style={{
        background: 'var(--bg-muted)', color: 'var(--fg)',
        fontSize: 11, padding: '2px 8px', fontWeight: 600,
      }}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function StatusPill({ status }: { status: Member['status'] }) {
  if (status === 'active') return null;
  const label = status === 'invited' ? 'Invite pending' : 'Deactivated';
  return (
    <span
      className="pill"
      style={{
        background: status === 'invited' ? 'var(--in-progress-bg)' : 'var(--bg-muted)',
        color: status === 'invited' ? 'var(--in-progress)' : 'var(--fg-faint)',
        fontSize: 10, padding: '2px 6px', fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
