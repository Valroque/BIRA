// Shared UI atoms — sidebar, top bar, chips, etc.
import type { CSSProperties, ReactNode } from 'react';
import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from './icons';
import { NotificationsButton } from './topbar-menus';
import { useProjects } from '../state/projects';
import { useWorkspaces } from '../state/workspaces';
import { useTenants } from '../state/tenants';
import { useIssues } from '../state/issues';
import { useAuth } from '../state/auth';
import { useTeams } from '../state/teams';

/**
 * Read tenant + workspace + project from the URL. Empty-string fallback when
 * any segment is missing (e.g. on a workspace-less route). Callers that need
 * to build URLs always have all three available — there are no hardcoded
 * defaults like `acme` / `comet` anymore.
 */
export function useTenantContext() {
  const params = useParams<{ tenant?: string; workspace?: string; project?: string }>();
  return {
    tenant: params.tenant ?? '',
    workspace: params.workspace ?? '',
    project: params.project ?? '',
  };
}

/**
 * Resolves human-readable names for the current tenant + workspace from the URL.
 * Use only inside WorkspaceLayout — useWorkspaces() throws otherwise. Tenant
 * settings (full-bleed, outside WorkspaceLayout) builds its breadcrumbs by
 * calling useTenants() directly.
 */
export function useTenantBreadcrumbs() {
  const { tenant, workspace, project } = useTenantContext();
  const tenantName = useTenants().getTenant(tenant)?.name ?? tenant;
  const workspaceName = useWorkspaces().getWorkspace(workspace)?.name ?? workspace;
  return { tenant, workspace, project, tenantName, workspaceName };
}

export const STATUSES = [
  { id: 'backlog', name: 'Backlog', color: 'var(--backlog)', bg: 'var(--backlog-bg)' },
  { id: 'todo', name: 'Todo', color: 'var(--todo)', bg: 'var(--todo-bg)' },
  { id: 'in-progress', name: 'In Progress', color: 'var(--in-progress)', bg: 'var(--in-progress-bg)' },
  { id: 'in-review', name: 'In Review', color: 'var(--in-review)', bg: 'var(--in-review-bg)' },
  { id: 'done', name: 'Done', color: 'var(--done)', bg: 'var(--done-bg)' },
  { id: 'canceled', name: 'Canceled', color: 'var(--canceled)', bg: 'var(--canceled-bg)' },
] as const;

export type StatusId = typeof STATUSES[number]['id'];

export const StatusDot = ({ status, size = 12 }: { status: StatusId | string; size?: number }) => (
  <span className={`sdot sdot-${status}`} style={{ width: size, height: size }} />
);

export const TypeChip = ({ type }: { type: 'T' | 'B' | 'S' | 'E' }) => (
  <span className={`tchip tchip-${type}`}>{type}</span>
);

type PriorityLevel = 'urgent' | 'high' | 'med' | 'low' | 'none';
export const Priority = ({ p }: { p: PriorityLevel }) => {
  if (p === 'urgent') return <span className="prio prio-urgent" data-tip="Urgent" />;
  return (
    <span className={`prio prio-${p}`} data-tip={p[0].toUpperCase() + p.slice(1)}>
      <span /><span /><span />
    </span>
  );
};

export const Avatar = ({ name, color, size = 22 }: { name: string; color?: string; size?: number }) => {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const palette = ['#4f46e5', '#0891b2', '#ea580c', '#16a34a', '#9333ea', '#db2777', '#0d9488'];
  const bg = color || palette[name.charCodeAt(0) % palette.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: bg, color: '#fff' }}>
      {initials}
    </span>
  );
};

export const IssueId = ({ id }: { id: string }) => (
  <span className="mono tnum" style={{ color: 'var(--fg-subtle)', fontSize: 12 }}>{id}</span>
);

export const KBD = ({ k }: { k: string }) => <span className="kbd">{k}</span>;

// --- Top app bar ---

/** A breadcrumb segment. String → non-clickable label; object with `to` → Link. */
export type Crumb = string | { label: string; to: string };

interface TopBarProps {
  breadcrumbs?: Crumb[];
  showSearch?: boolean;
  /** Hide on pre-auth screens (e.g. tenant picker) where the user hasn't signed in yet. */
  showNotifications?: boolean;
}
export const TopBar = ({ breadcrumbs = [], showSearch = true, showNotifications = true }: TopBarProps) => (
  <div style={{
    height: 44, borderBottom: '1px solid var(--border-muted)', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', padding: '0 12px 0 8px', gap: 8, flexShrink: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      {breadcrumbs.map((b, i) => {
        const isLast = i === breadcrumbs.length - 1;
        const label = typeof b === 'string' ? b : b.label;
        const to = typeof b === 'string' ? undefined : b.to;
        const linkStyle: CSSProperties = {
          color: 'var(--fg-muted)', fontWeight: 400, fontSize: 13,
          textDecoration: 'none', borderRadius: 4, padding: '2px 4px',
        };
        const currentStyle: CSSProperties = {
          color: 'var(--fg)', fontWeight: 600, fontSize: 13, padding: '2px 4px',
        };
        return (
          <Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={14} color="var(--fg-faint)" />}
            {to && !isLast ? (
              <Link
                to={to}
                style={linkStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.color = 'var(--fg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
              >
                {label}
              </Link>
            ) : (
              <span style={isLast ? currentStyle : linkStyle}>{label}</span>
            )}
          </Fragment>
        );
      })}
    </div>
    <div style={{ flex: 1 }} />
    {showSearch && (
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('bira:cmdk'))}
        style={{
          position: 'relative', width: 280, height: 24,
          border: '1px solid var(--border)', borderRadius: 5,
          background: 'var(--bg)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 8px', fontSize: 12,
          color: 'var(--fg-faint)', textAlign: 'left',
        }}
      >
        <Icon name="search" size={13} />
        <span style={{ flex: 1 }}>Search issues, projects…</span>
        <KBD k="⌘K" />
      </button>
    )}
    {showNotifications && <NotificationsButton />}
  </div>
);

// --- Sidebar ---
interface SidebarProps {
  collapsed?: boolean;
  active?: string;
  /** Optional. Renders a chevron toggle next to the BIRA brand when set;
   *  click flips collapsed state in the parent. AppShell wires this to
   *  a useState that persists to `bira:sidebar-collapsed`. */
  onToggleCollapsed?: () => void;
}

export const Sidebar = ({ collapsed = false, active = '', onToggleCollapsed }: SidebarProps) => {
  const w = collapsed ? 52 : 232;
  const { tenant, workspace } = useTenantContext();
  const { projects } = useProjects();
  const { issues } = useIssues();
  const { user } = useAuth();
  const { teams } = useTeams();
  // Active projects render in the sidebar; archived ones are reachable via
  // the All-projects page only. Sub-items (Board / Issues / Workflow) expand
  // under whichever project the URL is currently scoped to.
  const sidebarProjects = projects.filter((p) => p.status === 'active');
  // Issues belonging to projects that exist in this workspace. Drives the
  // counts on the My-issues / All-issues sidebar items so a fresh workspace
  // shows 0 instead of the global fixture total.
  const projectIds = new Set(projects.map((p) => p.id));
  const workspaceIssues = issues.filter((i) => projectIds.has(i.projectId));

  /**
   * Sidebar Item.
   * - `to` set → renders as a real Link.
   * - `to` not set → renders as a disabled-looking div with a "Coming soon" tooltip.
   *   These reflect routes that don't exist yet in the prototype (they will be
   *   built in batches 7–10 of the polish pass).
   */
  const Item = ({ id, icon, label, count, indent = 0, to }: {
    id: string;
    icon: string;
    label: string;
    count?: number;
    indent?: number;
    to?: string;
  }) => {
    const isActive = active === id;
    const enabled = !!to;
    const baseStyle: CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 8, height: 28,
      padding: collapsed ? '0' : `0 8px 0 ${8 + indent * 14}px`,
      justifyContent: collapsed ? 'center' : 'flex-start',
      borderRadius: 6,
      cursor: enabled ? 'pointer' : 'not-allowed',
      background: isActive ? 'var(--accent-subtle)' : 'transparent',
      color: isActive
        ? 'var(--accent-active)'
        : enabled ? 'var(--fg-muted)' : 'var(--fg-faint)',
      fontWeight: isActive ? 600 : 500,
      fontSize: 13,
      margin: '0 6px',
      textDecoration: 'none',
      opacity: enabled ? 1 : 0.55,
    };
    const inner = (
      <>
        <Icon name={icon} size={15} />
        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            {count != null && <span className="tnum" style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{count}</span>}
          </>
        )}
      </>
    );
    const tipText = collapsed ? label : !enabled ? 'Coming soon' : undefined;
    if (enabled) {
      return (
        <Link to={to!} title={tipText} style={baseStyle}>{inner}</Link>
      );
    }
    return (
      <div data-tip={!collapsed ? 'Coming soon' : undefined} title={tipText} style={baseStyle}>{inner}</div>
    );
  };

  const Section = ({ label, children }: { label: string; children: ReactNode }) => (
    !collapsed ? (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-faint)', padding: '0 14px 6px' }}>{label}</div>
        {children}
      </div>
    ) : (
      <div style={{ height: 14 }}>{children}</div>
    )
  );

  return (
    <div style={{
      width: w, background: 'var(--bg-subtle)', borderRight: '1px solid var(--border-muted)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width .2s ease',
    }}>
      <BiraBrand collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 0' }}>
        {/* Counts are derived from issues whose project belongs to the
            current workspace — so a fresh workspace with no projects shows
            "0", not the global fixture total. */}
        <Item id="my-issues"  icon="user"  label="My issues"  to={`/${tenant}/${workspace}/my-issues`}
              count={user ? workspaceIssues.filter((i) => i.assigneeUserId === user.id).length : 0} />
        <Item id="all-issues" icon="list"  label="All issues" to={`/${tenant}/${workspace}/all-issues`}
              count={workspaceIssues.length} />
        <Item id="planner"    icon="calendar" label="Planner"    to={`/${tenant}/${workspace}/planner`} />

        <Section label="Projects">
          <Item id="all-projects" icon="grid" label="All projects" to={`/${tenant}/${workspace}/projects`} />
          {sidebarProjects.map((p) => {
            const isActive = active === p.slug || active.startsWith(`${p.slug}-`);
            return (
              <Fragment key={p.slug}>
                <Item
                  id={p.slug}
                  icon={isActive ? 'folderOpen' : 'folder'}
                  label={p.name}
                  to={`/${tenant}/${workspace}/${p.slug}`}
                />
                {isActive && (
                  <>
                    <Item id={`${p.slug}-board`}    icon="board"    label="Board"    indent={1} to={`/${tenant}/${workspace}/${p.slug}/board`} />
                    <Item id={`${p.slug}-list`}     icon="list"     label="Issues"   indent={1} to={`/${tenant}/${workspace}/${p.slug}/list`} />
                    <Item id={`${p.slug}-workflow`} icon="workflow" label="Workflow" indent={1} to={`/${tenant}/${workspace}/${p.slug}/workflow`} />
                  </>
                )}
              </Fragment>
            );
          })}
        </Section>

        <Section label="Workspace">
          <Item id="workflows" icon="branch" label="Issue types & workflows" to={`/${tenant}/${workspace}/workflows`} />
        </Section>

        {/*
          Drift fix (v1 scope): "Active sprint" was here in the original design
          but sprints are out of scope for v1. Removed. Saved views remain.
        */}
        <Section label="Views">
          <Item id="blocked" icon="lock" label="Blocked" count={4} />
          <Item id="recent" icon="clock" label="Recently updated" />
        </Section>

        <Section label="Teams">
          <Item id="all-teams" icon="users" label="All teams" to={`/${tenant}/${workspace}/teams`} />
          {teams.map((t) => (
            <Item
              key={t.slug}
              id={`team-${t.slug}`}
              icon="hash"
              label={t.name}
              to={`/${tenant}/${workspace}/teams/${t.slug}`}
            />
          ))}
        </Section>
      </div>

      <div style={{ borderTop: '1px solid var(--border-muted)', padding: '8px 0' }}>
        <Item id="settings" icon="settings" label="Settings" to={`/${tenant}/${workspace}/settings`} />
        <Item id="help"     icon="question" label="Help" />
        <SidebarUserBlock collapsed={collapsed} />
      </div>
    </div>
  );
};

/**
 * BIRA wordmark used across sidebars (workspace shell + tenant picker shell).
 * Collapsed mode hides the wordmark and centres the chip so it tucks into the
 * narrow rail. When `onToggleCollapsed` is provided, the brand row also
 * renders a chevron toggle (flips the rail width); see AppShell for the
 * persistence hookup.
 */
export function BiraBrand({
  collapsed = false,
  onToggleCollapsed,
}: { collapsed?: boolean; onToggleCollapsed?: () => void }) {
  // Toggle button — rendered as a sibling of the brand chip. In
  // expanded mode it sits to the right of the wordmark (flex row); in
  // collapsed mode it stacks below the chip (flex column) so it stays
  // reachable on the narrow rail without overflowing. Native `title`
  // gives the tooltip — same pattern Sidebar `Item` uses for collapsed
  // labels.
  const toggle = onToggleCollapsed ? (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-pressed={collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        width: 22, height: 22,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: '1px solid var(--border-muted)',
        borderRadius: 4, padding: 0, cursor: 'pointer',
        color: 'var(--fg-muted)', flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-muted)';
        e.currentTarget.style.color = 'var(--fg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--fg-muted)';
      }}
    >
      <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={13} />
    </button>
  ) : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: collapsed ? 'column' : 'row',
      alignItems: 'center',
      gap: collapsed ? 6 : 8,
      flexShrink: 0,
      padding: collapsed ? '12px 0' : '14px 12px 14px 16px',
      justifyContent: collapsed ? 'center' : 'flex-start',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--accent), #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 14,
        fontFamily: 'var(--font-mono)', letterSpacing: -0.5,
      }}>B</div>
      {!collapsed && (
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.5, flex: 1 }}>BIRA</span>
      )}
      {toggle}
    </div>
  );
}

/**
 * Sidebar-foot user block — replaces the older `SidebarUserMenu` dropdown with
 * a flat "signed in as" panel + a single Sign out button. Same shape across
 * the workspace shell and the tenant picker shell so the chrome reads
 * consistently. In collapsed mode the avatar + power icon stack vertically.
 */
export function SidebarUserBlock({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = () => { logout(); navigate('/tenants'); };
  const displayName = user?.displayName ?? 'Account';
  const email = user?.email ?? '';

  if (collapsed) {
    return (
      <div style={{
        marginTop: 6, paddingTop: 8,
        borderTop: '1px solid var(--border-muted)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <Avatar name={displayName} size={24} />
        <button
          type="button"
          onClick={signOut}
          title="Sign out"
          className="btn btn-ghost btn-sm"
          style={{ width: 28, padding: 0 }}
        >
          <Icon name="power" size={13} color="var(--blocked)" />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 6, paddingTop: 10,
      borderTop: '1px solid var(--border-muted)',
      padding: '10px 12px 0',
    }}>
      <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>Signed in as</div>
      <div
        style={{
          fontSize: 13, fontWeight: 500, color: 'var(--fg)',
          marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={email}
      >{displayName}</div>
      <div style={{
        fontSize: 11, color: 'var(--fg-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{email}</div>
      <button
        type="button"
        onClick={signOut}
        className="btn btn-sm"
        style={{
          width: '100%', marginTop: 10, justifyContent: 'center',
          color: 'var(--blocked)',
        }}
      >
        <Icon name="power" size={13} color="var(--blocked)" />Sign out
      </button>
    </div>
  );
}

// --- Reusable comment markup body ---
export const CommentBody = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg)' }}>{children}</div>
);

// --- Tab strip ---
interface Tab {
  id: string;
  label: string;
  icon?: string;
  count?: number;
  /**
   * Where the tab navigates. If omitted the tab is rendered as a non-interactive
   * div (used by design-canvas variants that shouldn't navigate the host page).
   */
  to?: string;
}
export const Tabs = ({ tabs, active }: { tabs: Tab[]; active: string }) => (
  <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border-muted)', padding: '0 16px' }}>
    {tabs.map((t) => {
      const isActive = active === t.id;
      const baseStyle: CSSProperties = {
        padding: '8px 12px', fontSize: 13, fontWeight: 500, cursor: t.to ? 'pointer' : 'default',
        color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
        textDecoration: 'none',
      };
      const inner = (
        <>
          {t.icon && <Icon name={t.icon} size={14} />}
          {t.label}
          {t.count != null && <span className="pill" style={{ height: 16, padding: '0 5px', fontSize: 10 }}>{t.count}</span>}
        </>
      );
      return t.to
        ? <Link key={t.id} to={t.to} style={baseStyle}>{inner}</Link>
        : <div key={t.id} style={baseStyle}>{inner}</div>;
    })}
  </div>
);

// --- Toolbar (filters etc) ---
export const Toolbar = ({ children, right }: { children?: ReactNode; right?: ReactNode }) => (
  <div style={{
    height: 40, borderBottom: '1px solid var(--border-muted)', display: 'flex',
    alignItems: 'center', padding: '0 12px', gap: 6, background: 'var(--bg)',
  }}>
    {children}
    <div style={{ flex: 1 }} />
    {right}
  </div>
);

interface ChipProps {
  children?: ReactNode;
  onX?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}
export const Chip = ({ children, onX, dim, style }: ChipProps) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 4px 0 8px',
    border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)',
    fontSize: 12, color: dim ? 'var(--fg-muted)' : 'var(--fg)', cursor: 'pointer',
    ...style,
  }}>
    {children}
    {onX && (
      <button style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', display: 'flex', alignItems: 'center' }}>
        <Icon name="x" size={11} />
      </button>
    )}
  </span>
);

/**
 * Standard `to` URLs for the project tabs. Re-exported so screens don't
 * each invent their own paths. The Issues count is best-effort — pass
 * `opts.issueCount` if the caller already has the real number; otherwise
 * the badge is omitted (rather than synthesised from a fixture, which
 * would lie now that issues come from the API).
 */
export function projectTabs(tenant: string, workspace: string, project: string, opts?: { issueCount?: number }): Tab[] {
  const base = `/${tenant}/${workspace}/${project}`;
  return [
    { id: 'overview',   label: 'Overview',   icon: 'eye',      to: base },
    { id: 'board',      label: 'Board',      icon: 'board',    to: `${base}/board` },
    { id: 'issues',     label: 'Issues',     icon: 'list',     to: `${base}/list`, count: opts?.issueCount },
    { id: 'milestones', label: 'Milestones', icon: 'flag',     to: `${base}/milestones` },
    { id: 'workflow',   label: 'Workflow',   icon: 'workflow', to: `${base}/workflow` },
    { id: 'members',    label: 'Members',    icon: 'users',    to: `${base}/members` },
    { id: 'settings',   label: 'Settings',   icon: 'settings', to: `${base}/settings` },
  ];
}
