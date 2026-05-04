// /:tenant/:workspace/inbox — placeholder inbox view. Demonstrates the empty state.
import { Link } from 'react-router-dom';
import { TopBar, Tabs, useTenantBreadcrumbs } from '../components/shell';
import { EmptyState } from '../components/states';
import { Icon } from '../components/icons';
import { useProjects } from '../state/projects';

export function InboxPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { projects } = useProjects();
  const firstProject = projects.find((p) => p.status === 'active') ?? projects[0];
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Inbox',
      ]} />
      <Tabs
        active="unread"
        tabs={[
          { id: 'unread', label: 'Unread',  icon: 'inbox', count: 0, to: `/${tenant}/${workspace}/inbox` },
          { id: 'all',    label: 'All',     icon: 'list' },
          { id: 'archive',label: 'Archive', icon: 'archive' },
        ]}
      />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="inbox"
          title="You're all caught up"
          description="No new mentions, assignments, or replies. Notifications will appear here when other members tag you."
          action={firstProject ? (
            <Link
              to={`/${tenant}/${workspace}/${firstProject.slug}/board`}
              className="btn btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <Icon name="board" size={13} />Open the board
            </Link>
          ) : null}
        />
      </div>
    </div>
  );
}
