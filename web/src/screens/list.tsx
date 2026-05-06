// /:tenant/:workspace/:project/list — project-scoped issue list. Wraps the shared
// `IssuesTable` with TopBar + project Tabs and the project's slice of the
// workspace's issues.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, projectTabs, useTenantBreadcrumbs } from '../components/shell';
import { IssuesTable } from '../components/issues-table';
import { useProjects } from '../state/projects';
import { useIssues } from '../state/issues';
import { ErrorState } from '../components/states';

export function ListPage() {
  return <ListView />;
}

export function ListView() {
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { getProject } = useProjects();
  const { issues, loading, error, refresh } = useIssues();
  const projectInfo = getProject(project);

  // Resolve the URL slug to the project's UUID at the boundary so the issue
  // filter compares uuids end-to-end. An unknown slug (404) yields an empty
  // list, which the table's empty-state handles cleanly.
  const projectIssues = useMemo(
    () => projectInfo
      ? issues.filter((i) => i.projectId === projectInfo.id)
      : [],
    [issues, projectInfo],
  );

  if (error && !loading) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={[
          { label: tenantName, to: `/${tenant}/workspaces` },
          { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
          { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
          'Issues',
        ]} />
        <Tabs active="issues" tabs={projectTabs(tenant, workspace, project)} />
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
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
        'Issues',
      ]} />
      <Tabs active="issues" tabs={projectTabs(tenant, workspace, project)} />
      <IssuesTable
        issues={projectIssues}
        projectScoped
        // Project-scoped /list is the reality view — drags PATCH the BE.
        // The two workspace-level pages (My Issues / All Issues) keep the
        // default 'planning' mode so what-if drags stay in localStorage.
        ganttMode="reality"
        // Project filter would always be a no-op on a project-scoped page.
        reservedFilterTypes={['project']}
        // No 'project' here — same reason. 'none' is useful for a flat view of
        // a small project. Status stays as the default grouping.
        groupOptions={['none', 'status', 'assignee', 'priority', 'type']}
        defaultGroup="status"
        emptyTitle="No issues yet"
        emptyDescription="Issues you create or that match your filters will appear here, grouped by status."
        emptyAction={
          <Link to={`/${tenant}/${workspace}/${project}/issue/new`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            <Icon name="plus" size={13} />New issue
          </Link>
        }
      />
    </div>
  );
}
