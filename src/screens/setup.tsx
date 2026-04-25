// /setup — first-run flow for a fresh self-hosted instance. The first user
// becomes the admin of a brand-new workspace they create here.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';

const STEPS = ['workspace', 'admin', 'review'] as const;
type Step = typeof STEPS[number];

export function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('workspace');

  const [workspaceName, setWorkspaceName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Auto-suggest a slug from the workspace name.
  const onWorkspaceNameChange = (v: string) => {
    setWorkspaceName(v);
    const auto = v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setSlug(auto);
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 'workspace') setStep('admin');
    else if (step === 'admin') setStep('review');
  };

  const finish = () => {
    const safe = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'workspace';
    navigate(`/${safe}`);
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
          {step === 'workspace' && (
            <form onSubmit={next}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Create your workspace</h2>
              <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
                A workspace holds your projects, issues, and team members.
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
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme"
                  required
                />
                <Hint>Lowercase letters, digits, hyphens. URLs will look like <code>/{slug || 'acme'}/projects/…</code>.</Hint>
              </Field>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!workspaceName || !slug}
                style={{ width: '100%', height: 34, justifyContent: 'center', marginTop: 6 }}
              >
                Continue<Icon name="arrowRight" size={13} />
              </button>
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
                You can change all of these later in workspace settings.
              </p>
              <ReviewRow label="Workspace" value={workspaceName} mono={false} />
              <ReviewRow label="Slug" value={slug} mono />
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
                  <Icon name="check" size={13} />Create workspace
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
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
