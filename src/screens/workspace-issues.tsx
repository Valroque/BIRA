// Workspace-level issue lists: My Issues + All Issues. Both share the
// `IssuesTable` component (also used by the project-scoped /list page).
import { TopBar, useTenantBreadcrumbs } from '../components/shell';
import { IssuesTable, type IssueGroupKey } from '../components/issues-table';
import { type Filter } from '../components/issue-filters';
import { ISSUES, CURRENT_USER } from '../fixtures';
import type { Crumb } from '../components/shell';

interface WorkspaceIssuesViewProps {
  pageTitle: string;
  pageDescription: string;
  /** Last segment of the breadcrumb (e.g. "My issues"). The workspace name is prepended automatically. */
  trailingCrumb: string;
  /** Initial filter chips. Use `locked: true` for filters that define the page (e.g. "Assignee: Me"). */
  initialFilters: Filter[];
  defaultGroup: IssueGroupKey;
}

function WorkspaceIssuesView(props: WorkspaceIssuesViewProps) {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const breadcrumbs: Crumb[] = [
    { label: tenantName, to: `/${tenant}/workspaces` },
    { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
    props.trailingCrumb,
  ];
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={breadcrumbs} />
      <IssuesTable
        issues={ISSUES}
        initialFilters={props.initialFilters}
        defaultGroup={props.defaultGroup}
        groupOptions={['status', 'project', 'assignee']}
        pageHeader={{ title: props.pageTitle, description: props.pageDescription }}
      />
    </div>
  );
}

export function MyIssuesPage() {
  return (
    <WorkspaceIssuesView
      trailingCrumb="My issues"
      pageTitle="My issues"
      pageDescription="Issues assigned to you across every project in this workspace."
      defaultGroup="status"
      // Locked "Assignee: Me" — defines the page; user can layer more filters on top.
      initialFilters={[{
        id: 'me', type: 'assignee', values: [CURRENT_USER.name], locked: true,
      }]}
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
      initialFilters={[]}
    />
  );
}
