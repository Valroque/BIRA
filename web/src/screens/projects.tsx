// /:workspace/projects — list of all projects in the workspace + create flow.
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Avatar, useTenantContext, useTenantBreadcrumbs } from '../components/shell';
import { Modal, ModalHeader, ModalFooter } from '../components/modal';
import { Field, Hint } from '../components/forms';
import { ProjectBadge } from '../components/project-chip';
import {
  DEFAULT_PROJECT_WORKFLOWS, ISSUE_TYPE_NAMES,
  RESERVED_PROJECT_SLUGS,
  pickProjectColor, projectEffectiveMembers,
  type IssueTypeLetter, type Project,
} from '../fixtures';
import { useProjects } from '../state/projects';
import { useIssues } from '../state/issues';
import { useAuth } from '../state/auth';
import { useWorkflows } from '../state/workflows';
import { useTeams } from '../state/teams';
import { useUsers, UNKNOWN_USER_LABEL } from '../state/users';

export function ProjectsPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { projects } = useProjects();
  const { issues } = useIssues();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = projects.filter((p) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return p.name.toLowerCase().includes(f) || p.key.toLowerCase().includes(f);
  });
  const active = filtered.filter((p) => p.status === 'active');
  const archived = filtered.filter((p) => p.status === 'archived');

  // Open-issue counts per project. The list endpoint doesn't expose
  // aggregates yet so we compute client-side off the workspace cache —
  // good enough while the FE is the only consumer.
  const openByProjectId = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) {
      if (i.status === 'done' || i.status === 'canceled') continue;
      m.set(i.projectId, (m.get(i.projectId) ?? 0) + 1);
    }
    return m;
  }, [issues]);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Projects',
      ]} />
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Projects</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
              Each project owns its own issues. Workflows are shared across the workspace by issue type.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Icon name="plus" size={13} />New project
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
            placeholder="Filter projects"
            style={{ paddingLeft: 28 }}
          />
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        {active.length > 0 && (
          <Group label="Active" projects={active} tenant={tenant} workspace={workspace} openByProjectId={openByProjectId} />
        )}
        {archived.length > 0 && (
          <Group label="Archived" projects={archived} tenant={tenant} workspace={workspace} dim openByProjectId={openByProjectId} />
        )}
        {filtered.length === 0 && (
          <div style={{
            padding: 48, textAlign: 'center', color: 'var(--fg-muted)',
            background: 'var(--bg-subtle)', borderRadius: 8,
          }}>
            <Icon name="folder" size={28} color="var(--fg-faint)" />
            {projects.length === 0 ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, color: 'var(--fg)' }}>
                  No projects yet
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  Create your first project to start tracking issues in this workspace.
                </div>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
                  <Icon name="plus" size={13} />New project
                </button>
              </>
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>
                No projects match "{filter}"
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function Group({ label, projects, tenant, workspace, dim, openByProjectId }: {
  label: string;
  projects: Project[];
  tenant: string;
  workspace: string;
  dim?: boolean;
  openByProjectId: Map<string, number>;
}) {
  return (
    <section style={{ marginBottom: 28, opacity: dim ? 0.65 : 1 }}>
      <div className="label-section" style={{ marginBottom: 10 }}>{label} · {projects.length}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {projects.map((p) => {
          const open = openByProjectId.get(p.id) ?? 0;
          const memberCount = projectEffectiveMembers(p, tenant).length;
          return (
            <Link
              key={p.slug}
              to={`/${tenant}/${workspace}/${p.slug}`}
              className="card"
              style={{ padding: 16, textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <ProjectBadge project={p} size={32} radius={8} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{p.key}</div>
                </div>
                {p.status === 'archived' && (
                  <span className="pill" style={{ background: 'var(--bg-muted)' }}>Archived</span>
                )}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.5, minHeight: 36 }}>
                {p.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--fg-muted)' }}>
                <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{open}</span> open</span>
                <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{memberCount}</span> members</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function deriveKey(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4);
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { tenant, workspace } = useTenantContext();
  const { projects, addProject } = useProjects();
  const { user: currentUser } = useAuth();
  const { workflows: catalog } = useWorkflows();
  const { teams } = useTeams();
  const { users } = useUsers();
  const currentUserId = currentUser?.id ?? '';
  // Filter the creator out of the candidate set — they're auto-granted
  // admin server-side, so giving the user a chip to deselect themselves
  // is just confusion. The remaining list is the pool of *additional*
  // edit-access grantees.
  const candidateUsers = useMemo(
    () => users.filter((u) => u.id !== currentUserId),
    [users, currentUserId],
  );

  const [name, setName] = useState('');
  // The user can override the auto-derived key but not the slug (slug is the
  // URL primary key for v1; if it ever becomes editable, validate it the same
  // way as `name` here).
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [workflows, setWorkflows] = useState<Record<IssueTypeLetter, string>>(DEFAULT_PROJECT_WORKFLOWS);
  // UUIDs throughout — slugs are URL-only; identity is uuid (see
  // `project_uuid_identity_in_fe.md`).
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);

  const onName = (v: string) => {
    setName(v);
    if (!keyTouched) setKey(deriveKey(v));
  };
  const onKey = (v: string) => {
    setKeyTouched(true);
    setKey(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
  };

  const slug = slugify(name);

  // Validation — surface the first applicable error so the form stays terse.
  const error = useMemo<string | null>(() => {
    if (!name.trim()) return null; // empty is the resting state, not an error
    if (slug.length < 2) return 'Name must be at least 2 letters or digits.';
    if (RESERVED_PROJECT_SLUGS.has(slug)) return `"${slug}" is reserved — pick a different name.`;
    if (projects.some((p) => p.slug === slug)) return `A project with slug "${slug}" already exists.`;
    if (!key) return null; // user is still typing
    if (key.length < 2) return 'Issue key must be at least 2 characters.';
    if (projects.some((p) => p.key === key)) return `Issue key "${key}" is taken — pick another.`;
    return null;
  }, [name, slug, key, projects]);

  const canSubmit = !!slug && slug.length >= 2 && !error && key.length >= 2;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const palette = pickProjectColor(slug);
    const created = await addProject({
      slug,
      name: name.trim(),
      key,
      letter: (name.trim()[0] ?? slug[0] ?? '?').toUpperCase(),
      color: palette.color,
      bg: palette.bg,
      description: description.trim(),
      workflows,
      teamIds,
      // Creator is intentionally NOT in this list — the BE auto-grants
      // them admin in the same transaction as the project insert.
      userIds,
    });
    onClose();
    navigate(`/${tenant}/${workspace}/${created.slug}`);
  };

  return (
    <Modal
      onClose={onClose}
      maxWidth={560}
      maxHeight="88vh"
      align="top"
      onSubmit={submit}
      label="New project"
    >
      <ModalHeader title="New project" onClose={onClose} />
      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 18 }}>
          <Field label="Name">
            <input
              autoFocus className="input"
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="e.g. Nebula"
              required
            />
            {slug && <Hint>URL: <code>/{tenant}/{workspace}/{slug}</code></Hint>}
          </Field>

          <Field label="Issue key">
            <input
              className="input mono"
              value={key}
              onChange={(e) => onKey(e.target.value)}
              placeholder="e.g. NEB"
              required
              maxLength={4}
              style={{ maxWidth: 120, textTransform: 'uppercase' }}
            />
            <Hint>Used as the prefix for issue IDs (<code>{key || 'NEB'}-1</code>).</Hint>
          </Field>

          <Field label="Description" optional>
            <textarea
              className="input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short summary — what this project tracks."
              style={{ height: 'auto', padding: '8px 10px', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
            />
          </Field>

          <Field label="Workflows">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {TYPE_ORDER.map((t) => (
                <label
                  key={t}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 6,
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
                  }}
                >
                  <span className={`tchip tchip-${t}`} style={{ width: 22, height: 22, fontSize: 11, flexShrink: 0 }}>
                    {t}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{ISSUE_TYPE_NAMES[t]}</span>
                  <select
                    value={workflows[t]}
                    onChange={(e) => setWorkflows((prev) => ({ ...prev, [t]: e.target.value }))}
                    className="input input-sm"
                    style={{ width: 'auto', maxWidth: 130 }}
                  >
                    {catalog.length === 0 && (
                      <option value="">Default</option>
                    )}
                    {catalog.map((w) => (
                      <option key={w.id} value={w.slug}>{w.name}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <Hint>Each issue type uses one workflow. You can change these later in project settings.</Hint>
          </Field>

          <Field label="Teams with access" optional>
            {teams.length === 0 ? (
              <Hint>
                No teams in this workspace yet. Create one from the{' '}
                <Link to={`/${tenant}/${workspace}/teams`} style={{ color: 'var(--accent)' }}>
                  Teams page
                </Link>{' '}
                first to grant team-level access.
              </Hint>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {teams.map((team) => {
                    const on = teamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setTeamIds((prev) =>
                          on ? prev.filter((id) => id !== team.id) : [...prev, team.id],
                        )}
                        className="btn btn-sm"
                        style={{
                          gap: 6, height: 28,
                          background: on ? 'var(--accent-subtle)' : 'var(--bg)',
                          borderColor: on ? 'var(--accent)' : 'var(--border)',
                          color: on ? 'var(--accent-active)' : 'var(--fg)',
                          fontWeight: on ? 600 : 500,
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: 3, background: team.color,
                        }} />
                        {team.name}
                      </button>
                    );
                  })}
                </div>
                <Hint>Selected teams are granted <strong>read</strong> access — upgrade individual teams from the project Members page.</Hint>
              </>
            )}
          </Field>

          <Field label="People with edit access" optional>
            {candidateUsers.length === 0 ? (
              <Hint>You're the only workspace member — the project will start with you as admin. Invite others from{' '}
                <Link to={`/${tenant}/${workspace}/settings/members`} style={{ color: 'var(--accent)' }}>Members</Link>
                {' '}to grant additional access.
              </Hint>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {candidateUsers.map((u) => {
                    const on = userIds.includes(u.id);
                    const label = u.displayName || UNKNOWN_USER_LABEL;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setUserIds((prev) =>
                            on ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                          )
                        }
                        className="btn btn-sm"
                        style={{
                          gap: 6, height: 28,
                          background: on ? 'var(--accent-subtle)' : 'var(--bg)',
                          borderColor: on ? 'var(--accent)' : 'var(--border)',
                          color: on ? 'var(--accent-active)' : 'var(--fg)',
                          fontWeight: on ? 600 : 500,
                        }}
                      >
                        <Avatar name={label} size={18} />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <Hint>Selected users are granted <strong>write</strong> access. You're auto-granted admin as the creator.</Hint>
              </>
            )}
          </Field>

          {error && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6,
              background: '#fef2f2', border: '1px solid #fecaca',
              color: '#991b1b', fontSize: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Icon name="alert" size={12} />{error}
            </div>
          )}
        </div>

        <ModalFooter>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-sm">
            <Icon name="check" size={13} />Create project
          </button>
        </ModalFooter>
    </Modal>
  );
}

