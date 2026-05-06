// Tenant-level settings: general (details / danger zone) and members.
// Rendered inside the unified `SettingsLayout` (see screens/settings.tsx) — the
// two section components below provide the body content; the layout shell
// (breadcrumbs, header, left-nav) is supplied by the host.
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { Avatar, useTenantContext } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Field, Hint, DangerRow } from '../components/forms';
import { Section } from '../components/section';
import { EmptyState } from '../components/states';
import { type Role } from '../fixtures';
import { useTenants } from '../state/tenants';
import { useTenantMembers } from '../state/tenant-members';
import { useAuth } from '../state/auth';
import type { TenantMember } from '../api/adapters/tenantMember.adapter';
import { ApiError } from '../api/client';

// --- General (tenant) ---

export function TenantGeneralSettings() {
  const { tenant: tenantSlug } = useTenantContext();
  const { getTenant, updateTenant } = useTenants();
  const currentTenant = getTenant(tenantSlug);

  const [name, setName] = useState(currentTenant?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const slug = currentTenant?.slug ?? tenantSlug;

  // Re-sync the input if the underlying tenant changes (e.g. another tab
  // updates it, or the initial fetch lands after this component mounts).
  useEffect(() => {
    if (currentTenant) setName(currentTenant.name);
  }, [currentTenant?.name]);

  // Auto-dismiss the "Saved" indicator after a beat — there's no global toast
  // system yet, so this stands in for one inline next to the button.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const trimmed = name.trim();
  const dirty = !!currentTenant && trimmed !== currentTenant.name && trimmed.length > 0;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateTenant(slug, { name: trimmed });
      setSaved(true);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        'Failed to update tenant';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Section title="Tenant details" subtitle="How your tenant appears to its members." card>
        <form onSubmit={onSave}>
          <Field label="Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              disabled={saving || !currentTenant}
            />
          </Field>
          <Field label="Slug">
            <input
              className="input mono"
              value={slug}
              disabled
            />
            <Hint>Tenant slugs cannot be changed.</Hint>
          </Field>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!dirty || saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && !error && (
              <span style={{
                fontSize: 12, color: 'var(--done)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <Icon name="check" size={13} />Saved
              </span>
            )}
            {error && <span style={{ fontSize: 12, color: 'var(--blocked)' }}>{error}</span>}
          </div>
        </form>
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
  const { members, loading, error, refresh } = useTenantMembers();
  const { user: currentUser } = useAuth();
  const [filter, setFilter] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('write');

  const filtered = useMemo(() => {
    if (!filter) return members;
    const f = filter.toLowerCase();
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(f) || m.email.toLowerCase().includes(f),
    );
  }, [members, filter]);

  return (
    <>
      <Section
        title={`Members${loading ? '' : ` · ${members.length}`}`}
        subtitle="Anyone in the tenant. Tenant admins manage the org, can create workspaces, and automatically have manager access in every workspace."
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
          <button
            onClick={() => setShowInvite(true)}
            disabled
            data-tip="Inviting tenant members from the UI isn't wired yet — coming soon."
            className="btn btn-primary btn-sm"
          >
            <Icon name="plus" size={13} />Invite member
          </button>
        </div>

        {loading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            Loading members…
          </div>
        )}

        {error && !loading && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12, marginBottom: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => void refresh()} className="btn btn-sm">Retry</button>
          </div>
        )}

        {!loading && !error && members.length === 0 && (
          <EmptyState
            size="inline"
            icon="users"
            title="No members yet"
            description="Tenant memberships are added when a user creates the tenant or accepts an invite."
          />
        )}

        {!loading && filtered.length > 0 && (
          <div className="card" style={{ padding: 0 }}>
            {filtered.map((m, i) => (
              <TenantMemberRow
                key={m.membershipId}
                member={m}
                first={i === 0}
                isSelf={currentUser?.id === m.userId}
              />
            ))}
          </div>
        )}

        {!loading && !error && members.length > 0 && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
            No members match "{filter}".
          </div>
        )}
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

interface TenantMemberRowProps {
  member: TenantMember;
  first: boolean;
  isSelf: boolean;
}
function TenantMemberRow({ member, first, isSelf }: TenantMemberRowProps) {
  const m = member;
  const deactivated = !m.userIsActive || m.status === 'deactivated';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 80px 110px 32px',
        gap: 12, alignItems: 'center',
        padding: '10px 14px',
        borderTop: first ? 'none' : '1px solid var(--border-muted)',
        opacity: deactivated ? 0.55 : 1,
      }}
    >
      <Avatar name={m.displayName} size={28} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{m.displayName}</span>
          {isSelf && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
              color: 'var(--fg-muted)', background: 'var(--bg-subtle)',
              padding: '1px 5px', borderRadius: 3,
            }}>You</span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{m.email}</div>
      </div>
      <RoleSelect value={m.role} />
      <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
        {m.status === 'invited' ? <span style={{ color: 'var(--in-progress)' }}>Invite pending</span>
        : deactivated ? 'Deactivated'
        : (m.lastSeenAt ?? '—')}
      </span>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 24, padding: 0 }}
        disabled
        data-tip="Member actions aren't wired from the UI yet."
      >
        <Icon name="moreV" size={13} color="var(--fg-muted)" />
      </button>
    </div>
  );
}

function RoleSelect({ value }: { value: Role }) {
  // Tenant-level role mutations aren't wired from the UI yet — render the
  // current value as a disabled select so the column lines up with the rest
  // of the directory views, but make it clear it isn't editable.
  return (
    <select
      value={value}
      disabled
      data-tip="Tenant role changes aren't wired from the UI yet."
      className="input input-sm"
      style={{ width: 'auto', padding: '0 6px' }}
      onChange={() => {}}
    >
      <option value="admin">admin</option>
      <option value="write">write</option>
      <option value="read">read</option>
    </select>
  );
}

interface InviteModalProps {
  email: string;
  role: Role;
  onEmail: (v: string) => void;
  onRole: (v: Role) => void;
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
            onChange={(e) => onRole(e.target.value as Role)}
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

