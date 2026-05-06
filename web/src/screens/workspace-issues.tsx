// Workspace-level issue lists: My Issues + All Issues. Both share the
// `IssuesTable` component (also used by the project-scoped /list page).
import { TopBar, useTenantBreadcrumbs } from '../components/shell';
import { IssuesTable, type IssueGroupKey } from '../components/issues-table';
import { type Filter } from '../components/issue-filters';
import { useIssues } from '../state/issues';
import { useAuth } from '../state/auth';
import { ErrorState } from '../components/states';
import { Icon } from '../components/icons';
import type { Crumb } from '../components/shell';

interface WorkspaceIssuesViewProps {
  pageTitle: string;
  pageDescription: string;
  /** Last segment of the breadcrumb (e.g. "My issues"). The workspace name is prepended automatically. */
  trailingCrumb: string;
  /**
   * Initial filter chips. Use `locked: true` for filters that define the page
   * (e.g. "Assignee: Me"). Constructed lazily from `useAuth()` for pages that
   * need the current user's UUID.
   */
  initialFilters: Filter[];
  defaultGroup: IssueGroupKey;
  persistKey: string;
}

function WorkspaceIssuesView(props: WorkspaceIssuesViewProps) {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { issues, loading, error, refresh } = useIssues();
  const breadcrumbs: Crumb[] = [
    { label: tenantName, to: `/${tenant}/workspaces` },
    { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
    props.trailingCrumb,
  ];
  if (error && !loading) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={breadcrumbs} />
        <ErrorState
          code="LOAD_ISSUES"
          title="Couldn’t load issues"
          description={error}
          action={
            <button type="button" onClick={() => { void refresh(); }} className="btn btn-primary btn-sm">
              <Icon name="refresh" size={13} />Retry
            </button>
          }
        />
      </div>
    );
  }
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={breadcrumbs} />
      <IssuesTable
        issues={issues}
        initialFilters={props.initialFilters}
        defaultGroup={props.defaultGroup}
        groupOptions={['status', 'project', 'assignee']}
        pageHeader={{ title: props.pageTitle, description: props.pageDescription }}
        persistKey={props.persistKey}
      />
    </div>
  );
}

export function MyIssuesPage() {
  const { user } = useAuth();
  // Locked "Assignee: Me" — defines the page; user can layer more filters on
  // top. Empty values when there's no user (e.g. brief auth-loading flash);
  // the page still renders, just unscoped, until the user resolves.
  const initialFilters: Filter[] = [{
    id: 'me', type: 'assignee', values: user ? [user.id] : [], locked: true,
  }];
  return (
    <WorkspaceIssuesView
      trailingCrumb="My issues"
      pageTitle="My issues"
      pageDescription="Issues assigned to you across every project in this workspace."
      defaultGroup="status"
      persistKey="my-issues"
      initialFilters={initialFilters}
    />
  );
}

export function AllIssuesPage() {
  return (
    <WorkspaceIssuesView
      trailingCrumb="All issues"
      pageTitle="All issues"
      pageDescription="Every issue across every project. Group, filter, and bulk-edit from here."
      defaultGroup="project"
      persistKey="all-issues"
      initialFilters={[]}
    />
  );
}
