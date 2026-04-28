// /setup — first-run flow for a fresh self-hosted instance. The first user
// becomes the admin of a brand-new tenant + workspace they create here.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field, Hint } from '../components/forms';
import { pickProjectColor, type Workspace } from '../fixtures';
import { useTenants } from '../state/tenants';

const STEPS = ['tenant', 'workspace', 'admin', 'review'] as const;
type Step = typeof STEPS[number];

export function SetupPage() {
  const navigate = useNavigate();
  const { addTenant } = useTenants();
  const [step, setStep] = useState<Step>('tenant');

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const onTenantNameChange = (v: string) => {
    setTenantName(v);
    const auto = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setTenantSlug(auto);
  };

  // Auto-suggest a workspace slug from the workspace name.
  const onWorkspaceNameChange = (v: string) => {
    setWorkspaceName(v);
    const auto = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setWorkspaceSlug(auto);
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 'tenant') setStep('workspace');
    else if (step === 'workspace') setStep('admin');
    else if (step === 'admin') setStep('review');
  };

  const finish = () => {
    const safeTenant = tenantSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'tenant';
    const safeWorkspace = workspaceSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'workspace';

    // Create the tenant via the live provider so it shows up on the picker
    // immediately if the user navigates back.
    const tPalette = pickProjectColor(safeTenant);
    addTenant({
      slug: safeTenant,
      name: tenantName.trim() || safeTenant,
      letter: (tenantName.trim()[0] ?? safeTenant[0] ?? '?').toUpperCase(),
      color: tPalette.color,
      bg: tPalette.bg,
    });

    // Phase 1 transitional: WorkspacesProvider is mounted under TenantLayout,
    // so we can't useWorkspaces() from /setup. Bootstrap by writing the
    // canonical key directly; the provider picks it up on next mount.
    const wsPalette = pickProjectColor(safeWorkspace);
    const newWorkspace: Workspace = {
      tenantSlug: safeTenant,
      slug: safeWorkspace,
      name: workspaceName.trim() || safeWorkspace,
      letter: (workspaceName.trim()[0] ?? 'W').toUpperCase(),
      color: wsPalette.color,
      bg: wsPalette.bg,
      role: 'admin',
      projectCount: 0,
      memberCount: 1,
    };
    try {
      localStorage.setItem(`bira:workspaces:${safeTenant}`, JSON.stringify([newWorkspace]));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }

    navigate(`/${safeTenant}/${safeWorkspace}`);
  };

  return (
    <div className="bira" style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-subtle)', padding: 32, overflow: 'auto',
    }}>
      <div style={{ width: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 18,
            fontFamily: 'var(--font-mono)', letterSpacing: -0.5,
          }}>B</div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>BIRA</span>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--fg-muted)', margin: '0 0 18px' }}>
          Welcome — let's set up your self-hosted instance.
        </p>

        <Stepper current={step} />

        <div className="card" style={{ padding: 22, marginTop: 18 }}>
          {step === 'tenant' && (
            <form onSubmit={next}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Create your tenant</h2>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
                A tenant is your organization — it holds workspaces, projects, and members.
              </p>
              <Field label="Tenant name">
                <input
                  autoFocus
                  className="input"
                  value={tenantName}
                  onChange={(e) => onTenantNameChange(e.target.value)}
                  placeholder="Acme Corp"
                  required
                />
              </Field>
              <Field label="Slug">
                <input
                  className="input mono"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme-corp"
                  required
                />
                <Hint>URLs will look like <code>/{tenantSlug || 'acme-corp'}/...</code>.</Hint>
              </Field>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!tenantName || !tenantSlug || tenantSlug.length < 2}
                style={{ width: '100%', height: 34, justifyContent: 'center', marginTop: 6 }}
              >
                Continue<Icon name="arrowRight" size={13} />
              </button>
            </form>
          )}

          {step === 'workspace' && (
            <form onSubmit={next}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Create your workspace</h2>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
                Inside <strong>{tenantName || 'this tenant'}</strong>.
              </p>
              <Field label="Workspace name">
                <input
                  autoFocus
                  className="input"
                  value={workspaceName}
                  onChange={(e) => onWorkspaceNameChange(e.target.value)}
                  placeholder="Acme Robotics"
                  required
                />
              </Field>
              <Field label="Slug">
                <input
                  className="input mono"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme"
                  required
                />
                <Hint>URLs will look like <code>/{tenantSlug || 'acme-corp'}/{workspaceSlug || 'acme'}/...</code>.</Hint>
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setStep('tenant')} className="btn">Back</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!workspaceName || !workspaceSlug || workspaceSlug.length < 2}
                  style={{ flex: 1, height: 34, justifyContent: 'center' }}
                >
                  Continue<Icon name="arrowRight" size={13} />
                </button>
              </div>
            </form>
          )}

          {step === 'admin' && (
            <form onSubmit={next}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Create the admin account</h2>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
                You'll be the first admin of <strong>{workspaceName || 'this workspace'}</strong>.
              </p>
              <Field label="Your name">
                <input
                  autoFocus
                  className="input"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Jordan Lee"
                  required
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="input"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  className="input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <Hint>At least 8 characters.</Hint>
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setStep('workspace')} className="btn">Back</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!adminName || !adminEmail || !adminPassword}
                  style={{ flex: 1, height: 34, justifyContent: 'center' }}
                >
                  Continue<Icon name="arrowRight" size={13} />
                </button>
              </div>
            </form>
          )}

          {step === 'review' && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Review and finish</h2>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
                You can change all of these later in tenant or workspace settings.
              </p>
              <ReviewRow label="Tenant" value={tenantName} mono={false} />
              <ReviewRow label="Tenant slug" value={tenantSlug} mono />
              <ReviewRow label="Workspace" value={workspaceName} mono={false} />
              <ReviewRow label="Workspace slug" value={workspaceSlug} mono />
              <ReviewRow label="Admin name" value={adminName} mono={false} />
              <ReviewRow label="Admin email" value={adminEmail} mono />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setStep('admin')} className="btn">Back</button>
                <button
                  type="button"
                  onClick={finish}
                  className="btn btn-primary"
                  style={{ flex: 1, height: 34, justifyContent: 'center' }}
                >
                  <Icon name="check" size={13} />Create
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const labels: Record<Step, string> = {
    tenant: 'Tenant',
    workspace: 'Workspace',
    admin: 'Admin',
    review: 'Review',
  };
  const idx = STEPS.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = s === current;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11,
              background: done ? 'var(--accent)' : active ? 'var(--bg)' : 'var(--bg-muted)',
              border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
              color: done ? '#fff' : active ? 'var(--accent)' : 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {done ? <Icon name="check" size={12} /> : i + 1}
            </div>
            <span style={{
              fontSize: 12, fontWeight: active ? 600 : 500,
              color: active ? 'var(--fg)' : 'var(--fg-muted)',
            }}>{labels[s]}</span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? 'var(--accent)' : 'var(--border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid var(--border-muted)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{label}</span>
      <strong className={mono ? 'mono' : undefined} style={{ fontSize: 13, color: 'var(--fg)' }}>
        {value || <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>—</span>}
      </strong>
    </div>
  );
}
