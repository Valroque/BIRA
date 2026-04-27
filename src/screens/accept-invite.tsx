// /invite/:token — a freshly invited user follows their link, sets a name and
// password, and lands in the workspace. Workspace + email come from the token
// (mocked here).
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { Field, Hint } from '../components/forms';
import type { WorkspaceRole } from '../fixtures';

interface InviteContext {
  workspace: string;
  workspaceName: string;
  email: string;
  invitedBy: string;
  role: WorkspaceRole;
}

const DEMO: Record<string, InviteContext> = {
  // Anything not in this map will fall back to a generic demo invite.
  'demo-token': {
    workspace: 'acme', workspaceName: 'Acme Robotics',
    email: 'priya@acme.com', invitedBy: 'Jordan Lee', role: 'write',
  },
};

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const { token = '' } = useParams<{ token: string }>();
  const ctx = DEMO[token] ?? {
    workspace: 'acme', workspaceName: 'Acme Robotics',
    email: 'invitee@example.com', invitedBy: 'a workspace admin', role: 'write' as const,
  };

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return;
    navigate(`/${ctx.workspace}`);
  };

  return (
    <div className="bira" style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-subtle)', padding: 32,
    }}>
      <form onSubmit={submit} style={{ width: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
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
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Accept invitation</h2>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: '4px 0 16px' }}>
            <strong>{ctx.invitedBy}</strong> invited you to join <strong>{ctx.workspaceName}</strong> as a{' '}
            <strong>{ctx.role}</strong>. Set up your account to continue.
          </p>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 14,
            background: 'var(--bg-subtle)', borderRadius: 6,
            border: '1px solid var(--border-muted)',
          }}>
            <Icon name="globe" size={14} color="var(--fg-muted)" />
            <span style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>Workspace</span>
            <strong className="mono" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{ctx.workspace}</strong>
          </div>

          <Field label="Email">
            <input type="email" className="input" value={ctx.email} disabled style={{ color: 'var(--fg-muted)' }} />
          </Field>

          <Field label="Your name">
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priya Rao"
              autoFocus
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <Hint>At least 8 characters.</Hint>
          </Field>

          <Field label="Confirm password">
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm && confirm !== password && (
              <Hint warning>Passwords don't match.</Hint>
            )}
          </Field>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!fullName || !password || password !== confirm}
            style={{ width: '100%', height: 34, justifyContent: 'center', marginTop: 6 }}
          >
            Accept invitation<Icon name="arrowRight" size={13} />
          </button>
        </div>
      </form>
    </div>
  );
}

