import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field } from '../components/forms';
import { useTenants } from '../state/tenants';
import { useAuth } from '../state/auth';
import { TENANT_MEMBERS } from '../fixtures';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', write: 'Member', read: 'Read-only' };

export function LoginPage() {
  const navigate = useNavigate();
  const { tenant = '' } = useParams<{ tenant: string }>();
  const { getTenant } = useTenants();
  const { login } = useAuth();

  // Active members for the quick-select; fall back to empty if tenant isn't in fixtures.
  const quickUsers = (TENANT_MEMBERS[tenant] ?? []).filter((m) => m.status === 'active');
  // Default to the first admin for this tenant (or first active member if no admin).
  const defaultUser = quickUsers.find((m) => m.tenantRole === 'admin') ?? quickUsers[0];

  const [email, setEmail] = useState(defaultUser?.email ?? '');
  const [password, setPassword] = useState('password123');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  if (!tenant) return <Navigate to="/tenants" replace />;

  const t = getTenant(tenant);
  const tenantName = t?.name ?? tenant;
  const tenantLetter = (t?.letter ?? tenant[0] ?? '?').toUpperCase();
  const tenantColor = t?.color ?? 'var(--fg-muted)';
  const tenantBg = t?.bg ?? 'var(--bg-muted)';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(`/${tenant}/workspaces`);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
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
          {/* Tenant identity */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            paddingBottom: 14, marginBottom: 14,
            borderBottom: '1px solid var(--border-muted)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 4,
              border: '1px solid var(--border)',
              background: tenantBg, color: tenantColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 16, flexShrink: 0,
            }}>
              {tenantLetter}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 1,
              }}>
                Tenant
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tenantName}
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Sign in</h2>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
            You'll pick a workspace next.
          </p>

          {/* Quick-select user for dev convenience */}
          {quickUsers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Sign in as
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {quickUsers.map((m) => {
                  const initials = m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  const selected = email === m.email;
                  return (
                    <button
                      key={m.email}
                      type="button"
                      onClick={() => setEmail(m.email)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 10px', borderRadius: 6,
                        border: selected ? '1px solid var(--accent)' : '1px solid var(--border-muted)',
                        background: selected ? 'color-mix(in srgb, var(--accent) 8%, var(--bg))' : 'var(--bg-subtle)',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)',
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                        padding: '2px 6px', borderRadius: 4,
                        background: m.tenantRole === 'admin' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-muted)',
                        color: m.tenantRole === 'admin' ? 'var(--accent)' : 'var(--fg-muted)',
                        textTransform: 'uppercase',
                      }}>
                        {ROLE_LABEL[m.tenantRole] ?? m.tenantRole}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {loginError && (
            <div style={{
              marginBottom: 10, padding: '8px 10px', borderRadius: 6,
              background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
              border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
              color: 'var(--blocked)', fontSize: 12,
            }}>
              {loginError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: '100%', height: 34, justifyContent: 'center', marginTop: 6 }}
          >
            {submitting ? 'Signing in…' : <>Sign in<Icon name="arrowRight" size={13} /></>}
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

      </form>
    </div>
  );
}
