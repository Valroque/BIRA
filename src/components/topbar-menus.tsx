// Dropdown menus that live in the TopBar: notifications and the user menu.
import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { Avatar, KBD, useWorkspaceContext } from './shell';
import { useDismiss } from './use-dismiss';

interface Notification {
  id: string;
  who: string;
  verb: ReactNode;
  when: string;
  unread?: boolean;
  href?: string;
}

const NOTIFS: Notification[] = [
  { id: 'n1', who: 'Maya Chen', verb: <>commented on <strong>CMT-241</strong></>, when: '2h ago', unread: true, href: '/acme/comet/issue/CMT-241' },
  { id: 'n2', who: 'Sam Park',  verb: <>moved <strong>CMT-234</strong> to In Progress</>, when: '4h ago', unread: true, href: '/acme/comet/issue/CMT-234' },
  { id: 'n3', who: 'Jordan Lee', verb: <>assigned <strong>CMT-238</strong> to you</>, when: 'yesterday', unread: true, href: '/acme/comet/issue/CMT-238' },
  { id: 'n4', who: 'Priya Rao', verb: <>resolved <strong>CMT-227</strong></>, when: '2d ago', href: '/acme/comet/issue/CMT-227' },
];

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), open);
  const unread = NOTIFS.filter((n) => n.unread).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-ghost btn-sm"
        data-tip={open ? undefined : 'Notifications'}
        style={{ position: 'relative' }}
      >
        <Icon name="bell" size={15} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 8, height: 8, borderRadius: 4,
            background: 'var(--accent)', border: '1.5px solid var(--bg)',
          }} />
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 340, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border-muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
            {unread > 0 && (
              <span className="pill" style={{ background: 'var(--accent-muted)', color: 'var(--accent-active)' }}>
                {unread} new
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }}>Mark all read</button>
          </div>
          <div className="scroll" style={{ maxHeight: 360, overflow: 'auto' }}>
            {NOTIFS.map((n) => (
              <Link
                key={n.id}
                to={n.href ?? '#'}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid var(--border-muted)',
                  background: n.unread ? 'var(--accent-subtle)' : 'transparent',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <Avatar name={n.who} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.4 }}>
                    <strong>{n.who}</strong> {n.verb}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 2 }}>{n.when}</div>
                </div>
                {n.unread && <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />}
              </Link>
            ))}
          </div>
          <div style={{ padding: '8px 12px', textAlign: 'center', borderTop: '1px solid var(--border-muted)' }}>
            <a style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}>View all notifications →</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { workspace } = useWorkspaceContext();
  useDismiss(ref, () => setOpen(false), open);

  const go = (to: string) => { setOpen(false); navigate(to); };
  const signOut = () => go('/login');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center',
        }}
      >
        <Avatar name="Jordan Lee" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          width: 240, background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name="Jordan Lee" size={32} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Jordan Lee</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>jordan@acme.com</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 4 }}>
            <MenuRow icon="user" label="Profile" onClick={() => go(`/${workspace}/settings/profile`)} />
            <MenuRow icon="settings" label="Workspace settings" onClick={() => go(`/${workspace}/settings/general`)} />
            <MenuRow icon="users" label="Members & invites" onClick={() => go(`/${workspace}/settings/members`)} />
            <div style={{ height: 1, background: 'var(--border-muted)', margin: '4px 0' }} />
            <MenuRow icon="globe" label="Switch workspace" onClick={() => go('/login')} />
            <MenuRow icon="moon" label="Theme: light" disabled />
            <div style={{ height: 1, background: 'var(--border-muted)', margin: '4px 0' }} />
            <MenuRow icon="power" label="Sign out" onClick={signOut} danger />
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuRowProps {
  icon: string;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}
function MenuRow({ icon, label, shortcut, onClick, disabled, danger }: MenuRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tip={disabled ? 'Coming soon' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        width: '100%', borderRadius: 5, border: 'none', background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left', fontSize: 13,
        color: danger ? 'var(--blocked)' : disabled ? 'var(--fg-faint)' : 'var(--fg)',
        opacity: disabled ? 0.65 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon name={icon} size={13} color={danger ? 'var(--blocked)' : 'var(--fg-muted)'} />
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <KBD k={shortcut} />}
    </button>
  );
}
