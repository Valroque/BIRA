// Settings: workspace-level (general, members) + user profile.
// Sections live as nested routes so each is deep-linkable.
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Avatar, useTenantBreadcrumbs, useTenantContext } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Field, Hint, DangerRow } from '../components/forms';
import { Section } from '../components/section';
import {
  workspaceMembersDerived,
  type WorkspaceMemberView, type WorkspaceMemberProvenance, type WorkspaceRole,
} from '../fixtures';
import { useProjects } from '../state/projects';
import { useWorkspaces } from '../state/workspaces';
import { useAuth } from '../state/auth';
import { updateProfile, changePassword } from '../api/auth';

// --- Outer layout (header + secondary tab strip + outlet) ---

export function SettingsLayout() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { pathname } = useLocation();
  const base = `/${tenant}/${workspace}/settings`;
  const sections = [
    { id: 'general', to: `${base}/general`, label: 'General', icon: 'settings' },
    { id: 'members', to: `${base}/members`, label: 'Members', icon: 'users' },
    { id: 'profile', to: `${base}/profile`, label: 'Profile',  icon: 'user' },
  ];

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Settings',
      ]} />
      <div style={{
        padding: '20px 28px 0', borderBottom: '1px solid var(--border-muted)',
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 14px' }}>
          Configure your workspace and account preferences.
        </p>
        <div style={{ display: 'flex', gap: 2 }}>
          {sections.map((s) => {
            const active = pathname === s.to || pathname.startsWith(s.to + '/');
            return (
              <NavLink
                key={s.id}
                to={s.to}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  color: active ? 'var(--fg)' : 'var(--fg-muted)',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
                  textDecoration: 'none',
                }}
              >
                <Icon name={s.icon} size={14} />
                {s.label}
              </NavLink>
            );
          })}
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

// --- General (workspace) ---

export function GeneralSettings() {
  const { workspace: workspaceSlug } = useTenantContext();
  const { getWorkspace, updateWorkspace } = useWorkspaces();
  const currentWorkspace = getWorkspace(workspaceSlug);

  const [name, setName] = useState(currentWorkspace?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const slug = currentWorkspace?.slug ?? workspaceSlug;

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await updateWorkspace(slug, { name });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section title="Workspace details" subtitle="How your workspace appears to its members." card>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug">
          <input
            className="input mono"
            value={slug}
            disabled
          />
          <Hint>Workspace slugs cannot be changed.</Hint>
        </Field>
        {saveError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {saveError}
          </div>
        )}
        <SaveBar onSave={handleSave} saving={saving} />
      </Section>

      <Section title="Logo" card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
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
          label="Archive workspace"
          description="Hide the workspace and freeze all data. Members lose access until restored."
          actionLabel="Archive…"
        />
        <DangerRow
          label="Delete workspace"
          description="Permanently delete the workspace and all its issues, projects, comments, and members."
          actionLabel="Delete…"
        />
      </Section>
    </>
  );
}

// --- Members ---

export function MembersSettings() {
  const { tenant, workspace } = useTenantContext();
  const { projects, getProject } = useProjects();
  const [filter, setFilter] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('write');

  const members = workspaceMembersDerived(tenant, workspace, projects);
  const filtered = members.filter((m) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return m.name.toLowerCase().includes(f) || m.email.toLowerCase().includes(f);
  });

  return (
    <>
      <Section
        title={`Members · ${members.length}`}
        subtitle="Anyone with access to this workspace — direct grants, via project membership, or inherited from tenant admins."
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
          {filtered.map((m: WorkspaceMemberView, i) => (
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
                <ProvenanceLine
                  provenance={m.provenance}
                  resolveProjectName={(slug) => getProject(slug)?.name ?? slug}
                />
              </div>
              <RoleSelect
                value={m.effectiveRole}
                provenance={m.provenance}
                deactivated={m.status === 'deactivated'}
              />
              <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
                {m.status === 'invited' ? <span style={{ color: 'var(--in-progress)' }}>Invite pending</span>
                : m.status === 'deactivated' ? 'Deactivated'
                : m.lastSeen}
              </span>
              {m.provenance.kind === 'explicit' ? (
                <button className="btn btn-ghost btn-sm" style={{ width: 24, padding: 0 }} data-tip="Member actions">
                  <Icon name="moreV" size={13} color="var(--fg-muted)" />
                </button>
              ) : (
                <span />
              )}
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

function ProvenanceLine({
  provenance, resolveProjectName,
}: {
  provenance: WorkspaceMemberProvenance;
  resolveProjectName: (slug: string) => string;
}) {
  if (provenance.kind === 'explicit') return null;
  if (provenance.kind === 'inherited') {
    return (
      <div style={{ fontSize: 11, color: 'var(--accent-active)', marginTop: 2 }}>
        Inherited from tenant admin
      </div>
    );
  }
  // project
  const names = provenance.projectSlugs.map(resolveProjectName);
  const text = names.length === 1
    ? `Via project: ${names[0]}`
    : `Via ${names.length} projects: ${names.join(', ')}`;
  return (
    <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>
      {text}
    </div>
  );
}

function RoleSelect({
  value, provenance, deactivated,
}: {
  value: WorkspaceRole;
  provenance: WorkspaceMemberProvenance;
  deactivated?: boolean;
}) {
  // inherited / project rows are read-only because their role isn't stored on
  // the workspace itself — it's resolved from the tenant or from project
  // membership. Editing them in this surface would be misleading.
  const disabled = deactivated || provenance.kind !== 'explicit';
  const tip =
    provenance.kind === 'inherited' ? 'Tenant admins are admin in every workspace.'
    : provenance.kind === 'project' ? 'Project access grants implicit workspace read. Add a direct grant to change role.'
    : undefined;
  return (
    <select
      defaultValue={value}
      disabled={disabled}
      className="input input-sm"
      data-tip={tip}
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
  role: WorkspaceRole;
  onEmail: (v: string) => void;
  onRole: (v: WorkspaceRole) => void;
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
            onChange={(e) => onRole(e.target.value as WorkspaceRole)}
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

// --- Profile ---

export function ProfileSettings() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const displayName = `${firstName} ${lastName}`.trim() || (user?.displayName ?? 'Account');

  const handleProfileSave = async () => {
    setProfileError(null);
    setProfileSaving(true);
    try {
      const updated = await updateProfile({ firstName, lastName, email });
      updateUser(updated);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwSuccess(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate('/tenants');
  };

  return (
    <>
      <Section title="Account" subtitle="Information about you, visible to other members of this workspace." card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <Avatar name={displayName} size={56} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-sm"><Icon name="upload" size={13} />Upload avatar</button>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>JPG/PNG up to 1 MB. Initials are used by default.</span>
          </div>
        </div>
        <Field label="First name">
          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Hint>Changing your email requires re-verification.</Hint>
        </Field>
        {profileError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {profileError}
          </div>
        )}
        <SaveBar onSave={handleProfileSave} saving={profileSaving} />
      </Section>

      <Section title="Password" card>
        <Field label="Current password">
          <input
            type="password" className="input"
            autoComplete="current-password"
            value={currentPw} onChange={(e) => setCurrentPw(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <input
            type="password" className="input"
            autoComplete="new-password" minLength={8}
            value={newPw} onChange={(e) => setNewPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password" className="input"
            autoComplete="new-password"
            value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
          />
        </Field>
        {pwError && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--blocked) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--blocked) 30%, transparent)',
            color: 'var(--blocked)',
          }}>
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div style={{
            padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'color-mix(in srgb, var(--done) 10%, var(--bg))',
            border: '1px solid color-mix(in srgb, var(--done) 30%, transparent)',
            color: 'var(--done)',
          }}>
            Password updated successfully.
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            onClick={handlePasswordUpdate}
          >
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </Section>

      <Section title="Sign out" subtitle="Sign out of this device. You can sign back in any time." card>
        <button onClick={handleSignOut} className="btn">
          <Icon name="power" size={13} />Sign out
        </button>
      </Section>
    </>
  );
}

// --- Helpers ---

function SaveBar({ onSave, saving }: { onSave?: () => void; saving?: boolean }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

// Re-export the layout under a friendlier name when imported by App.tsx.
export { SettingsLayout as SettingsPage };
