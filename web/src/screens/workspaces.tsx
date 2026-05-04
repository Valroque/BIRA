// /:tenant/workspaces — per-tenant workspace picker.
//
// Lists the workspaces the current user has access to within the URL's
// tenant. Selecting one lands in `/:tenant/:workspace` which then redirects
// to the user's first project. When the user has no workspaces, an empty
// state offers self-host setup or a different account. A "+ New workspace"
// button opens a small create flow that persists to localStorage via
// `useWorkspaces()` (scoped per tenant by the provider).

import { useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field, Hint } from '../components/forms';
import { TopBar } from '../components/shell';
import {
  CURRENT_USER, RESERVED_WORKSPACE_SLUGS, pickProjectColor,
  type Workspace, type WorkspaceRole,
} from '../fixtures';
import { useWorkspaces } from '../state/workspaces';
import { useTenants } from '../state/tenants';
import { useAuth } from '../state/auth';

export function WorkspacesPage() {
  const { tenant = '' } = useParams<{ tenant: string }>();
  const { getTenant } = useTenants();
  const tenantName = getTenant(tenant)?.name ?? tenant;
  const { workspaces } = useWorkspaces();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(
    () => workspaces.filter((w) => w.archived).length,
    [workspaces],
  );

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const visible = showArchived ? workspaces : workspaces.filter((w) => !w.archived);
    if (!f) return visible;
    return visible.filter((w) => w.name.toLowerCase().includes(f));
  }, [workspaces, filter, showArchived]);

  return (
    <div className="bira" style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <TopBar breadcrumbs={[tenantName, 'Workspaces']} showSearch={false} showNewIssue={false} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', background: 'var(--bg-subtle)', padding: '48px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <Brand />

          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14,
          }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
                Choose a workspace in {tenantName}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Each workspace groups projects, teams, and members within {tenantName}.
              </p>
            </div>
            {workspaces.length > 0 && (
              <>
                <Link to={`/${tenant}/settings`} className="btn btn-sm" style={{ textDecoration: 'none' }}>
                  <Icon name="settings" size={13} />Tenant settings
                </Link>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
                  <Icon name="plus" size={13} />New workspace
                </button>
              </>
            )}
          </div>

          {workspaces.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--fg-faint)', display: 'inline-flex',
                }}>
                  <Icon name="search" size={13} />
                </span>
                <input
                  autoFocus
                  className="input input-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search workspaces by name"
                  style={{ paddingLeft: 28 }}
                />
              </div>
              {archivedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className={`btn btn-sm${showArchived ? ' btn-primary' : ''}`}
                  data-tip={showArchived ? 'Hide archived workspaces' : 'Show archived workspaces'}
                  style={{ flexShrink: 0 }}
                >
                  <Icon name="archive" size={13} />
                  {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
                </button>
              )}
            </div>
          )}

          {workspaces.length === 0
            ? <EmptyState onCreate={() => setShowCreate(true)} />
            : filtered.length === 0
              ? <NoMatch
                  query={filter}
                  onlyArchived={!showArchived && archivedCount > 0 && workspaces.every((w) => w.archived)}
                  onShowArchived={() => setShowArchived(true)}
                />
              : <WorkspaceList workspaces={filtered} tenant={tenant} />}

          <Footer />
        </div>
      </div>

      {showCreate && <CreateWorkspaceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function NoMatch({
  query,
  onlyArchived,
  onShowArchived,
}: {
  query: string;
  onlyArchived: boolean;
  onShowArchived: () => void;
}) {
  // "Only archived" wins over "no search match" — the more useful nudge is
  // toward the toggle. Otherwise fall back to the generic search-empty.
  if (onlyArchived) {
    return (
      <div style={{
        padding: '24px 18px', textAlign: 'center',
        background: 'var(--bg)', border: '1px dashed var(--border)',
        borderRadius: 8, color: 'var(--fg-muted)',
      }}>
        <Icon name="archive" size={18} color="var(--fg-faint)" />
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--fg)' }}>
          All workspaces are archived
        </div>
        <div style={{ fontSize: 12, marginTop: 4, marginBottom: 10 }}>
          Toggle "Show archived" to view them, or create a new workspace.
        </div>
        <button onClick={onShowArchived} className="btn btn-sm">
          <Icon name="archive" size={13} />Show archived
        </button>
      </div>
    );
  }
  return (
    <div style={{
      padding: '24px 18px', textAlign: 'center',
      background: 'var(--bg)', border: '1px dashed var(--border)',
      borderRadius: 8, color: 'var(--fg-muted)',
    }}>
      <Icon name="search" size={18} color="var(--fg-faint)" />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--fg)' }}>
        {query.trim() ? `No workspaces match "${query.trim()}"` : 'No workspaces to show'}
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        Try a different name, or create a new workspace.
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'linear-gradient(135deg, var(--accent), #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 16,
        fontFamily: 'var(--font-mono)', letterSpacing: -0.5,
      }}>B</div>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>BIRA</span>
    </div>
  );
}

function WorkspaceList({ workspaces, tenant }: { workspaces: Workspace[]; tenant: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {workspaces.map((w) => <WorkspaceRow key={w.slug} w={w} tenant={tenant} />)}
    </div>
  );
}

function WorkspaceRow({ w, tenant }: { w: Workspace; tenant: string }) {
  const { setArchived } = useWorkspaces();
  const archived = !!w.archived;

  const onToggleArchived = (e: MouseEvent<HTMLButtonElement>) => {
    // The archive button overlays the Link — stop propagation so the
    // surrounding card click (navigate into the workspace) doesn't fire.
    e.preventDefault();
    e.stopPropagation();
    setArchived(w.slug, !archived);
  };

  return (
    <div style={{ position: 'relative' }}>
      <Link
        to={`/${tenant}/${w.slug}`}
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 14, paddingRight: 56, textDecoration: 'none', color: 'inherit',
          opacity: archived ? 0.7 : 1,
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: w.bg, color: w.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16,
          filter: archived ? 'grayscale(0.4)' : undefined,
        }}>{w.letter}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</span>
            <RolePill role={w.role} />
            {archived && <ArchivedPill />}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 3,
            fontSize: 12, color: 'var(--fg-muted)',
          }}>
            <span className="mono" style={{ color: 'var(--fg-faint)' }}>/{w.slug}</span>
            <Sep />
            <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 500 }}>{w.projectCount}</span> projects</span>
            <Sep />
            <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 500 }}>{w.memberCount}</span> members</span>
          </div>
        </div>

        <Icon name="chevronRight" size={14} color="var(--fg-faint)" />
      </Link>

      <button
        type="button"
        onClick={onToggleArchived}
        className="btn btn-ghost btn-sm"
        data-tip={archived ? 'Unarchive workspace' : 'Archive workspace'}
        style={{
          position: 'absolute', top: '50%', right: 36, transform: 'translateY(-50%)',
          width: 26, padding: 0,
        }}
      >
        <Icon name={archived ? 'refresh' : 'archive'} size={13} />
      </button>
    </div>
  );
}

function ArchivedPill() {
  return (
    <span className="pill" style={{
      background: 'var(--bg-muted)', color: 'var(--fg-muted)',
      height: 18, fontSize: 11, fontWeight: 600, padding: '0 6px',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <Icon name="archive" size={10} />Archived
    </span>
  );
}

function Sep() {
  return <span style={{ color: 'var(--fg-faint)' }}>·</span>;
}

const ROLE_STYLES: Record<WorkspaceRole, { label: string; bg: string; fg: string }> = {
  admin: { label: 'Admin', bg: 'var(--accent-muted)', fg: 'var(--accent-active)' },
  write: { label: 'Write', bg: 'var(--done-bg)',      fg: 'var(--done)' },
  read:  { label: 'Read',  bg: 'var(--bg-muted)',     fg: 'var(--fg-muted)' },
};

function RolePill({ role }: { role: WorkspaceRole }) {
  const s = ROLE_STYLES[role];
  return (
    <span className="pill" style={{
      background: s.bg, color: s.fg,
      height: 18, fontSize: 11, fontWeight: 600, padding: '0 6px',
    }}>{s.label}</span>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{
      padding: '36px 24px', textAlign: 'center',
      background: 'var(--bg)', border: '1px dashed var(--border)',
      borderRadius: 8,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8,
        background: 'var(--bg-muted)', color: 'var(--fg-faint)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon name="users" size={18} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>No workspaces yet</div>
      <p style={{
        fontSize: 12.5, color: 'var(--fg-muted)',
        margin: '4px auto 14px', lineHeight: 1.5, maxWidth: 360,
      }}>
        You haven't been added to any BIRA workspace. Create one to get started, or ask an admin for an invite.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={onCreate} className="btn btn-primary btn-sm">
          <Icon name="plus" size={13} />New workspace
        </button>
        <SignOutButton />
        <Link to="/tenants" className="btn btn-sm" style={{ textDecoration: 'none' }}>
          Switch tenant
        </Link>
      </div>
    </div>
  );
}

function Footer() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signedInAs = user?.email ?? CURRENT_USER.email;
  const signOut = () => { logout(); navigate('/tenants'); };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 18, fontSize: 12, color: 'var(--fg-muted)',
    }}>
      <span>Signed in as <span style={{ color: 'var(--fg)' }}>{signedInAs}</span></span>
      <span style={{ display: 'flex', gap: 12 }}>
        <Link to="/tenants" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Switch tenant</Link>
        <button onClick={signOut} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--accent)', fontSize: 12,
        }}>Sign out</button>
      </span>
    </div>
  );
}

function SignOutButton() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button className="btn btn-sm" onClick={() => { logout(); navigate('/tenants'); }}>
      Sign out
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create workspace modal
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { tenant = '' } = useParams<{ tenant: string }>();
  const { workspaces, addWorkspace } = useWorkspaces();
  const [name, setName] = useState('');

  const slug = slugify(name);

  const error = useMemo<string | null>(() => {
    if (!name.trim()) return null; // empty is the resting state, not an error
    if (slug.length < 2) return 'Name must be at least 2 letters or digits.';
    if (RESERVED_WORKSPACE_SLUGS.has(slug)) return `"${slug}" is reserved — pick a different name.`;
    if (workspaces.some((w) => w.slug === slug)) return `A workspace with slug "${slug}" already exists.`;
    return null;
  }, [name, slug, workspaces]);

  const canSubmit = !!slug && slug.length >= 2 && !error;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const palette = pickProjectColor(slug);
    const created = await addWorkspace({
      slug,
      name: name.trim(),
      letter: (name.trim()[0] ?? slug[0] ?? '?').toUpperCase(),
      color: palette.color,
      bg: palette.bg,
    });
    onClose();
    navigate(`/${tenant}/${created.slug}`);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '6vh 24px', overflow: 'auto',
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: 'var(--bg)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>New workspace</span>
          <div style={{ flex: 1 }} />
          <button
            type="button" onClick={onClose} className="btn btn-ghost btn-sm"
            style={{ width: 24, padding: 0 }} data-tip="Close"
          >
            <Icon name="x" size={13} />
          </button>
        </header>

        <div style={{ padding: 18 }}>
          <Field label="Name">
            <input
              autoFocus className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Robotics"
              required
            />
            {slug && <Hint>URL: <code>/{tenant}/{slug}</code></Hint>}
          </Field>

          <p style={{
            fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px', lineHeight: 1.5,
          }}>
            You'll be the admin of this workspace. You can add projects, teams, and members from inside.
          </p>

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

        <footer style={{
          padding: '10px 18px', borderTop: '1px solid var(--border-muted)',
          background: 'var(--bg-subtle)', display: 'flex', gap: 8,
        }}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={!canSubmit} className="btn btn-primary btn-sm">
            <Icon name="check" size={13} />Create workspace
          </button>
        </footer>
      </form>
    </div>
  );
}

