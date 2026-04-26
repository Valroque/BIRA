// /:workspace/:project/list — project-scoped issue list. Wraps the shared
// `IssuesTable` with TopBar + project Tabs and the project's own slice of
// ISSUES.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, projectTabs, useWorkspaceContext } from '../components/shell';
import { IssuesTable } from '../components/issues-table';
import { ISSUES } from '../fixtures';
import { useProjects } from '../state/projects';

export function ListPage() {
  return <ListView />;
}

export function ListView() {
  const { workspace, project } = useWorkspaceContext();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);

  const projectIssues = useMemo(
    () => ISSUES.filter((i) => i.project === project),
    [project],
  );

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${workspace}/${project}` },
        'Issues',
      ]} />
      <Tabs active="issues" tabs={projectTabs(workspace, project)} />
      <IssuesTable
        issues={projectIssues}
        projectScoped
        // Project filter would always be a no-op on a project-scoped page.
        reservedFilterTypes={['project']}
        // No 'project' here — same reason. 'none' is useful for a flat view of
        // a small project. Status stays as the default grouping.
        groupOptions={['none', 'status', 'assignee', 'priority', 'type']}
        defaultGroup="status"
        emptyTitle="No issues yet"
        emptyDescription="Issues you create or that match your filters will appear here, grouped by status."
        emptyAction={
          <Link to={`/${workspace}/${project}/issue/new`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            <Icon name="plus" size={13} />New issue
          </Link>
        }
      />
    </div>
  );
}
