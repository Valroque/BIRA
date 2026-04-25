// /:workspace/projects — list of all projects in the workspace + create flow.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, useWorkspaceContext } from '../components/shell';

interface Project {
  id: string;
  name: string;
  key: string;
  description: string;
  open: number;
  members: number;
  status: 'active' | 'archived';
  /** Slug for the URL. */
  slug: string;
}

const PROJECTS: Project[] = [
  { id: 'p1', name: 'Comet', key: 'CMT', slug: 'comet', description: 'Internal issue tracker, role-aware workflows.', open: 98, members: 6, status: 'active' },
  { id: 'p2', name: 'Orbit', key: 'ORB', slug: 'orbit', description: 'Customer-facing dashboard and analytics.', open: 38, members: 4, status: 'active' },
  { id: 'p3', name: 'Atlas', key: 'ATL', slug: 'atlas', description: 'Map / geospatial features for the platform.', open: 142, members: 7, status: 'active' },
  { id: 'p4', name: 'Halo',  key: 'HAL', slug: 'halo',  description: 'Deprecated. Kept for reference only.', open: 0, members: 0, status: 'archived' },
];

export function ProjectsPage() {
  const { workspace } = useWorkspaceContext();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = PROJECTS.filter((p) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return p.name.toLowerCase().includes(f) || p.key.toLowerCase().includes(f);
  });
  const active = filtered.filter((p) => p.status === 'active');
  const archived = filtered.filter((p) => p.status === 'archived');

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
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
          <Group label="Active" projects={active} workspace={workspace} />
        )}
        {archived.length > 0 && (
          <Group label="Archived" projects={archived} workspace={workspace} dim />
        )}
        {filtered.length === 0 && (
          <div style={{
            padding: 48, textAlign: 'center', color: 'var(--fg-muted)',
            background: 'var(--bg-subtle)', borderRadius: 8,
          }}>
            <Icon name="folder" size={28} color="var(--fg-faint)" />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>No projects match "{filter}"</div>
          </div>
        )}
      </div>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function Group({ label, projects, workspace, dim }: { label: string; projects: Project[]; workspace: string; dim?: boolean }) {
  return (
    <section style={{ marginBottom: 28, opacity: dim ? 0.65 : 1 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
      }}>{label} · {projects.length}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/${workspace}/${p.slug}`}
            className="card"
            style={{ padding: 16, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'var(--accent-muted)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-sans)',
              }}>{p.name[0]}</div>
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
              <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.open}</span> open</span>
              <span><span className="tnum" style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.members}</span> members</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { workspace } = useWorkspaceContext();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');

  // Auto-derive a key from the project name.
  const onName = (v: string) => {
    setName(v);
    const auto = v.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 4);
    setKey(auto);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
    onClose();
    navigate(`/${workspace}/${slug}`);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>New project</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 24, padding: 0 }}>
            <Icon name="x" size={13} />
          </button>
        </div>
        <div style={{ padding: 18 }}>
          <Field label="Name">
            <input
              autoFocus className="input"
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="e.g. Nebula"
              required
            />
          </Field>
          <Field label="Issue key">
            <input
              className="input mono"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="e.g. NEB"
              required
              maxLength={4}
            />
            <Hint>Used as the prefix for issue IDs (<code>{key || 'NEB'}-1</code>).</Hint>
          </Field>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-muted)', background: 'var(--bg-subtle)', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
          <button type="submit" disabled={!name || !key} className="btn btn-primary btn-sm">
            <Icon name="check" size={13} />Create project
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
      }}>{label}</div>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-faint)' }}>{children}</div>;
}
