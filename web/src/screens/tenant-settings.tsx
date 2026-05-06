// Tenant-level settings: general (details / logo / danger zone) and members.
// Rendered inside the unified `SettingsLayout` (see screens/settings.tsx) — the
// two section components below provide the body content; the layout shell
// (breadcrumbs, header, left-nav) is supplied by the host.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Avatar, useTenantContext } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Field, Hint, DangerRow } from '../components/forms';
import { Section } from '../components/section';
import { TENANT_MEMBERS, type TenantMember, type TenantRole } from '../fixtures';
import { useTenants } from '../state/tenants';

// --- General (tenant) ---

export function TenantGeneralSettings() {
  const { tenant: tenantSlug } = useTenantContext();
  const { getTenant } = useTenants();
  const currentTenant = getTenant(tenantSlug);

  const [name, setName] = useState(currentTenant?.name ?? '');
  const slug = currentTenant?.slug ?? tenantSlug;

  return (
    <>
      <Section title="Tenant details" subtitle="How your tenant appears to its members." card>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled />
        </Field>
        <Field label="Slug">
          <input
            className="input mono"
            value={slug}
            disabled
          />
          <Hint>Tenant slugs cannot be changed.</Hint>
        </Field>
        <SaveBar disabled />
        <Hint>Tenant name editing is not yet available.</Hint>
      </Section>

      <Section title="Logo" card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, var(--accent), #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 24, fontFamily: 'var(--font-mono)',
          }}>{name[0] ?? 'B'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-sm"><Icon name="upload" size={13} />Upload logo</button>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>PNG/SVG up to 1 MB. Square recommended.</span>
          </div>
        </div>
      </Section>

      <Section
        title="Danger zone"
        subtitle="These actions are irreversible. Make sure you've exported anything important."
        danger
        card
      >
        <DangerRow
          label="Archive tenant"
          description="Hide the tenant and freeze all of its workspaces. Members lose access until restored."
          actionLabel="Archive…"
        />
        <DangerRow
          label="Delete tenant"
          description="Permanently delete the tenant and every workspace, project, issue, and member inside it."
          actionLabel="Delete…"
        />
      </Section>
    </>
  );
}

// --- Members ---

export function TenantMembersSettings() {
  const { tenant = '' } = useParams<{ tenant: string }>();
  const members: TenantMember[] = TENANT_MEMBERS[tenant] ?? [];
  const [filter, setFilter] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TenantRole>('write');

  const filtered = members.filter((m) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return m.name.toLowerCase().includes(f) || m.email.toLowerCase().includes(f);
  });

  return (
    <>
      <Section
        title={`Members · ${members.length}`}
        subtitle="Anyone in the tenant. Tenant admins manage the org, can create workspaces, and inherit admin in every workspace."
        card
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }}>
              <Icon name="search" size={13} />
            </span>
            <input
              className="input input-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or email"
              style={{ paddingLeft: 28 }}
            />
          </div>
          <button onClick={() => setShowInvite(true)} className="btn btn-primary btn-sm">
            <Icon name="plus" size={13} />Invite member
          </button>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {filtered.map((m: TenantMember, i) => (
            <div
              key={m.email}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 96px 96px 28px',
                gap: 12, alignItems: 'center',
                padding: '10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-muted)',
                opacity: m.status === 'deactivated' ? 0.55 : 1,
              }}
            >
              <Avatar name={m.name} size={28} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{m.email}</div>
              </div>
              <RoleSelect
                value={m.tenantRole}
                disabled={m.status === 'deactivated'}
              />
              <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
                {m.status === 'invited' ? <span style={{ color: 'var(--in-progress)' }}>Invite pending</span>
                : m.status === 'deactivated' ? 'Deactivated'
                : m.lastSeen}
              </span>
              <button className="btn btn-ghost btn-sm" style={{ width: 24, padding: 0 }} data-tip="Member actions">
                <Icon name="moreV" size={13} color="var(--fg-muted)" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
              No members match "{filter}".
            </div>
          )}
        </div>
      </Section>

      {showInvite && (
        <InviteModal
          email={inviteEmail}
          role={inviteRole}
          onEmail={setInviteEmail}
          onRole={setInviteRole}
          onSend={() => { setShowInvite(false); setInviteEmail(''); setInviteRole('write'); }}
          onClose={() => setShowInvite(false)}
        />
      )}
    </>
  );
}

function RoleSelect({ value, disabled }: { value: TenantRole; disabled?: boolean }) {
  return (
    <select
      defaultValue={value}
      disabled={disabled}
      className="input input-sm"
      style={{ width: 'auto', padding: '0 6px' }}
    >
      <option value="admin">admin</option>
      <option value="write">write</option>
      <option value="read">read</option>
    </select>
  );
}

interface InviteModalProps {
  email: string;
  role: TenantRole;
  onEmail: (v: string) => void;
  onRole: (v: TenantRole) => void;
  onSend: () => void;
  onClose: () => void;
}
function InviteModal({ email, role, onEmail, onRole, onSend, onClose }: InviteModalProps) {
  return (
    <Modal
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); onSend(); }}
      label="Invite a new member"
    >
      <ModalHeader title="Invite a new member" onClose={onClose} />
      <ModalBody>
        <Field label="Email">
          <input
            autoFocus
            type="email"
            className="input"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="them@example.com"
            required
          />
        </Field>
        <Field label="Role">
          <select
            className="input"
            value={role}
            onChange={(e) => onRole(e.target.value as TenantRole)}
          >
            <option value="read">read — view-only access</option>
            <option value="write">write — view and edit issues, projects, workflows</option>
            <option value="admin">admin — also manage settings, members, and roles</option>
          </select>
        </Field>
        <Hint>An invite link will be emailed; in this prototype it isn't actually sent.</Hint>
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} className="btn btn-sm">Cancel</button>
        <button type="submit" disabled={!email} className="btn btn-primary btn-sm">
          <Icon name="send" size={13} />Send invite
        </button>
      </ModalFooter>
    </Modal>
  );
}

// --- Helpers ---

function SaveBar({ disabled }: { disabled?: boolean }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
      <button className="btn btn-primary btn-sm" disabled={disabled}>Save changes</button>
    </div>
  );
}
