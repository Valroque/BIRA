// /:workspace/inbox — placeholder inbox view. Demonstrates the empty state.
import { Link } from 'react-router-dom';
import { TopBar, Tabs, useWorkspaceContext } from '../components/shell';
import { EmptyState } from '../components/states';
import { Icon } from '../components/icons';

export function InboxPage() {
  const { workspace } = useWorkspaceContext();
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        'Inbox',
      ]} />
      <Tabs
        active="unread"
        tabs={[
          { id: 'unread', label: 'Unread',  icon: 'inbox', count: 0, to: `/${workspace}/inbox` },
          { id: 'all',    label: 'All',     icon: 'list' },
          { id: 'archive',label: 'Archive', icon: 'archive' },
        ]}
      />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EmptyState
          icon="inbox"
          title="You're all caught up"
          description="No new mentions, assignments, or replies. Notifications will appear here when other members tag you."
          action={
            <Link
              to={`/${workspace}/comet/board`}
              className="btn btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <Icon name="board" size={13} />Open the board
            </Link>
          }
        />
      </div>
    </div>
  );
}
