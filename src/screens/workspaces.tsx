// /workspaces — post-login workspace picker.
//
// Lists the workspaces the current user has access to. Selecting one lands
// in `/:workspace` which then redirects to the user's first project.
// When the user has no workspaces, an empty state offers self-host setup
// or a different account. A "+ New workspace" button opens a small create
// flow that persists to localStorage via `useWorkspaces()`.

import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field, Hint } from '../components/forms';
import { TopBar } from '../components/shell';
import {
  CURRENT_USER, RESERVED_WORKSPACE_SLUGS, pickProjectColor,
  type Workspace, type WorkspaceRole,
} from '../fixtures';
import { useWorkspaces } from '../state/workspaces';

export function WorkspacesPage() {
  const { workspaces } = useWorkspaces();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(f));
  }, [workspaces, filter]);

  return (
    <div className="bira" style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <TopBar breadcrumbs={['Workspaces']} showSearch={false} showNewIssue={false} />
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
                Choose a workspace
              </h1>
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                Each workspace is a separate tenant with its own projects, teams, and members.
              </p>
            </div>
            {workspaces.length > 0 && (
              <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm">
                <Icon name="plus" size={13} />New workspace
              </button>
            )}
          </div>

          {workspaces.length > 0 && (
            <div style={{ position: 'relative', marginBottom: 10 }}>
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
          )}

          {workspaces.length === 0
            ? <EmptyState onCreate={() => setShowCreate(true)} />
            : filtered.length === 0
              ? <NoMatch query={filter} />
              : <WorkspaceList workspaces={filtered} />}

          <Footer />
        </div>
      </div>

      {showCreate && <CreateWorkspaceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function NoMatch({ query }: { query: string }) {
  return (
    <div style={{
      padding: '24px 18px', textAlign: 'center',
      background: 'var(--bg)', border: '1px dashed var(--border)',
      borderRadius: 8, color: 'var(--fg-muted)',
    }}>
      <Icon name="search" size={18} color="var(--fg-faint)" />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--fg)' }}>
        No workspaces match "{query.trim()}"
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

function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {workspaces.map((w) => <WorkspaceRow key={w.slug} w={w} />)}
    </div>
  );
}

function WorkspaceRow({ w }: { w: Workspace }) {
  return (
    <Link
      to={`/${w.slug}`}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 14, textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 8, flexShrink: 0,
        background: w.bg, color: w.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 16,
      }}>{w.letter}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</span>
          <RolePill role={w.role} />
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
        <Link to="/login" className="btn btn-sm" style={{ textDecoration: 'none' }}>
          Use a different account
        </Link>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 18, fontSize: 12, color: 'var(--fg-muted)',
    }}>
      <span>Signed in as <span style={{ color: 'var(--fg)' }}>{CURRENT_USER.email}</span></span>
      <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign out</Link>
    </div>
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const palette = pickProjectColor(slug);
    const created = addWorkspace({
      slug,
      name: name.trim(),
      letter: (name.trim()[0] ?? slug[0] ?? '?').toUpperCase(),
      color: palette.color,
      bg: palette.bg,
    });
    onClose();
    navigate(`/${created.slug}`);
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
            {slug && <Hint>URL: <code>/{slug}</code></Hint>}
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

