// /tenants — public tenant picker (entry point before login).
//
// Loads from `GET /api/tenants` via TenantsProvider. Selecting a tenant lands
// on `/:tenant/login`. Tenant creation is NOT exposed here — tenants are
// provisioned out of band in v1.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar } from '../components/shell';
import { type Tenant } from '../fixtures';
import { useTenants } from '../state/tenants';

export function TenantsPage() {
  const { tenants, loading, error, refresh } = useTenants();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(f));
  }, [tenants, filter]);

  return (
    <div className="bira" style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <TopBar breadcrumbs={['Tenants']} showSearch={false} showNotifications={false} />
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', background: 'var(--bg-subtle)', padding: '48px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <Brand />

          <div style={{ marginBottom: 14 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
              Choose a tenant
            </h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
              Each tenant is a separate organization with its own workspaces, members, and projects.
            </p>
          </div>

          {tenants.length > 0 && (
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
                placeholder="Search tenants by name"
                style={{ paddingLeft: 28 }}
              />
            </div>
          )}

          {loading
            ? <LoadingState />
            : error
              ? <ErrorRow message={error} onRetry={refresh} />
              : tenants.length === 0
                ? <EmptyState />
                : filtered.length === 0
                  ? <NoMatch query={filter} />
                  : <TenantList tenants={filtered} />}

          <Footer />
        </div>
      </div>
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
        No tenants match "{query.trim()}"
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>
        Try a different name.
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

function TenantList({ tenants }: { tenants: Tenant[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tenants.map((t) => <TenantRow key={t.slug} t={t} />)}
    </div>
  );
}

function TenantRow({ t }: { t: Tenant }) {
  return (
    <Link
      to={`/${t.slug}/login`}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 14, textDecoration: 'none', color: 'inherit',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 4, flexShrink: 0,
        border: '1px solid var(--border)',
        background: t.bg, color: t.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 16,
      }}>{t.letter}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          color: 'var(--fg-faint)', textTransform: 'uppercase',
          display: 'block', marginBottom: 2,
        }}>
          Tenant
        </span>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
        <div style={{
          marginTop: 3, fontSize: 12, color: 'var(--fg-muted)',
        }}>
          <span className="mono" style={{ color: 'var(--fg-faint)' }}>/{t.slug}</span>
        </div>
      </div>

      <Icon name="chevronRight" size={14} color="var(--fg-faint)" />
    </Link>
  );
}

function LoadingState() {
  return (
    <div style={{
      padding: '36px 24px', textAlign: 'center',
      background: 'var(--bg)', border: '1px dashed var(--border)',
      borderRadius: 8, color: 'var(--fg-muted)', fontSize: 13,
    }}>
      Loading tenants…
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      padding: '24px 18px', textAlign: 'center',
      background: 'var(--bg)', border: '1px solid var(--danger-border, var(--border))',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        Couldn't reach the server
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>{message}</div>
      <button className="btn btn-sm" onClick={onRetry}>Retry</button>
    </div>
  );
}

function EmptyState() {
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
      <div style={{ fontSize: 14, fontWeight: 600 }}>No tenants available</div>
      <p style={{
        fontSize: 12.5, color: 'var(--fg-muted)',
        margin: '4px auto 0', lineHeight: 1.5, maxWidth: 360,
      }}>
        No tenants have been provisioned on this instance yet.
      </p>
    </div>
  );
}

function Footer() {
  return null;
}

