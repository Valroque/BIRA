import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';

export function LoginPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('acme');
  const [email, setEmail] = useState('jordan@acme.com');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const safe = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'acme';
    navigate(`/${safe}`);
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
            BIRA workspaces are accessed by slug. Enter your workspace and credentials.
          </p>

          <Field label="Workspace">
            <input
              autoFocus
              className="input mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme"
              spellCheck={false}
              autoCapitalize="off"
            />
            <Hint>Lowercase letters, digits, and hyphens. Your URL will be <code>/{slug || '…'}</code>.</Hint>
          </Field>

          <Field label="Email">
            <input
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
  return (
    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--fg-faint)' }}>{children}</div>
  );
}
