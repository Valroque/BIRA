// Workspace-level issue lists: My Issues + All Issues. Both share the
// `IssuesTable` component (also used by the project-scoped /list page).
import { TopBar } from '../components/shell';
import { IssuesTable, type IssueGroupKey } from '../components/issues-table';
import { type Filter } from '../components/issue-filters';
import { ISSUES, CURRENT_USER } from '../fixtures';
import type { Crumb } from '../components/shell';

interface WorkspaceIssuesViewProps {
  breadcrumbs: Crumb[];
  pageTitle: string;
  pageDescription: string;
  /** Initial filter chips. Use `locked: true` for filters that define the page (e.g. "Assignee: Me"). */
  initialFilters: Filter[];
  defaultGroup: IssueGroupKey;
}

function WorkspaceIssuesView(props: WorkspaceIssuesViewProps) {
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={props.breadcrumbs} />
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
      breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        'My issues',
      ]}
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
      breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        'All issues',
      ]}
      pageTitle="All issues"
      pageDescription="Every issue across every project. Group, filter, and bulk-edit from here."
      defaultGroup="project"
      initialFilters={[]}
    />
  );
}
