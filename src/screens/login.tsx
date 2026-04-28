import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field } from '../components/forms';
import { useTenants } from '../state/tenants';

export function LoginPage() {
  const navigate = useNavigate();
  const { tenant = '' } = useParams<{ tenant: string }>();
  const { getTenant } = useTenants();
  const [email, setEmail] = useState('jordan@acme.com');
  const [password, setPassword] = useState('password');

  // Defensive: the route requires a tenant slug, but if we ever render
  // without one, send the user back to the picker rather than show an
  // ugly empty-tenant headline.
  if (!tenant) return <Navigate to="/tenants" replace />;

  const tenantName = getTenant(tenant)?.name ?? tenant;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Login is tenant-scoped — after sign-in we go straight to that
    // tenant's workspace picker.
    navigate(`/${tenant}/workspaces`);
  };

  return (
    <div className="bira" style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-subtle)', padding: 32,
    }}>
      <form onSubmit={submit} style={{ width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 18,
            fontFamily: 'var(--font-mono)', letterSpacing: -0.5,
          }}>B</div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>BIRA</span>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Sign in</h2>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
            Signing in to <strong style={{ color: 'var(--fg)' }}>{tenantName}</strong>. You'll pick a workspace next.
          </p>

          <Field label="Email">
            <input
              autoFocus
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 34, justifyContent: 'center', marginTop: 6 }}>
            Sign in<Icon name="arrowRight" size={13} />
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 12, fontSize: 12, color: 'var(--fg-muted)',
          }}>
            <a style={{ color: 'var(--accent)', cursor: 'pointer' }}>Forgot password?</a>
            <span>
              No account? <Link to="/invite/demo-token" style={{ color: 'var(--accent)' }}>Use your invite link</Link>
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--fg-muted)' }}>
          Self-hosting? <Link to="/setup" style={{ color: 'var(--accent)' }}>Set up a new instance →</Link>
        </div>
      </form>
    </div>
  );
}

