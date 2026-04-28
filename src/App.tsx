import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams, Link } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ErrorState } from './components/states';
import { ProjectsProvider, useProjects } from './state/projects';
import { WorkspacesProvider } from './state/workspaces';
import { LoginPage } from './screens/login';
import { TenantsPage } from './screens/tenants';
import { WorkspacesPage } from './screens/workspaces';
import { ProjectOverviewPage } from './screens/project-overview';
import { BoardPage } from './screens/board';
import { ListPage } from './screens/list';
import { IssueDetailPage } from './screens/issue-detail';
import { WorkflowPage } from './screens/workflow';
import { RuleEditorPage } from './screens/rule-editor';
import { CreateIssuePage } from './screens/create-issue';
import { AcceptInvitePage } from './screens/accept-invite';
import { SetupPage } from './screens/setup';
import { SettingsLayout, GeneralSettings, MembersSettings, ProfileSettings } from './screens/settings';
import { ProjectsPage } from './screens/projects';
import { ProjectSettingsPage } from './screens/project-settings';
import { WorkflowsPage } from './screens/workflows';
import { InboxPage } from './screens/inbox';
import { MyIssuesPage, AllIssuesPage } from './screens/workspace-issues';
import { TeamsPage, TeamDetailPage } from './screens/teams';
import { MemberProfilePage } from './screens/member-profile';
import { ProjectMembersPage } from './screens/project-members';
import { DesignCanvasPage } from './screens/design-canvas';

function TenantLayout() {
  const { tenant = '' } = useParams<{ tenant: string }>();
  // WorkspacesProvider is mounted per tenant. The `key` prop forces a fresh
  // instance whenever the user navigates between tenants, so the new
  // tenant's localStorage key + seed are loaded cleanly.
  return (
    <WorkspacesProvider tenant={tenant} key={tenant}>
      <Outlet />
    </WorkspacesProvider>
  );
}

function WorkspaceLayout() {
  const { pathname } = useLocation();
  const { tenant = '', workspace, project } = useParams<{ tenant: string; workspace?: string; project?: string }>();

  // Derive the highlighted sidebar item from the URL. Project-scoped pages
  // produce ids like `${slug}` (overview/settings/members) or
  // `${slug}-board` / `-list` / `-workflow` so the sidebar can highlight
  // the matching sub-item under arbitrary project slugs.
  let sidebarActive = '';
  if (pathname.endsWith('/inbox')) sidebarActive = 'inbox';
  else if (pathname.endsWith('/my-issues')) sidebarActive = 'my-issues';
  else if (pathname.endsWith('/all-issues')) sidebarActive = 'all-issues';
  else if (pathname.endsWith('/projects')) sidebarActive = 'all-projects';
  else if (pathname.endsWith('/workflows')) sidebarActive = 'workflows';
  else if (/\/teams\/([^/]+)/.test(pathname)) {
    const m = pathname.match(/\/teams\/([^/]+)/);
    sidebarActive = m ? `team-${m[1]}` : 'all-teams';
  }
  else if (pathname.endsWith('/teams')) sidebarActive = 'all-teams';
  // Workspace-level settings (not project-scoped) → bottom Settings item.
  else if (/^\/[^/]+\/[^/]+\/settings(\/|$)/.test(pathname)) sidebarActive = 'settings';
  else if (project) {
    if (pathname.endsWith('/board')) sidebarActive = `${project}-board`;
    else if (pathname.endsWith('/list')) sidebarActive = `${project}-list`;
    else if (pathname.includes('/workflow')) sidebarActive = `${project}-workflow`;
    else if (pathname.includes('/issue/')) sidebarActive = `${project}-list`;
    // overview / members / project-settings → highlight the project itself.
    else sidebarActive = project;
  }

  // ProjectsProvider is mounted per (tenant, workspace). The `key` prop forces
  // a fresh instance whenever the user navigates across pairs.
  return (
    <ProjectsProvider key={`${tenant}/${workspace}`} tenant={tenant} workspace={workspace ?? ''}>
      <AppShell sidebarActive={sidebarActive}>
        <Outlet />
      </AppShell>
    </ProjectsProvider>
  );
}

/** /:tenant → redirect to the tenant-scoped login. */
function TenantHomeRedirect() {
  const { tenant = '' } = useParams<{ tenant: string }>();
  return <Navigate to={`/${tenant}/login`} replace />;
}

/** /:tenant/:workspace → redirect to the first active project (or to the projects list if there are none). */
function WorkspaceHomeRedirect() {
  const { tenant = '', workspace = '' } = useParams<{ tenant: string; workspace: string }>();
  const { projects } = useProjects();
  const first = projects.find((p) => p.status === 'active') ?? projects[0];
  const target = first ? `/${tenant}/${workspace}/${first.slug}` : `/${tenant}/${workspace}/projects`;
  return <Navigate to={target} replace />;
}

function NotFound() {
  return (
    <ErrorState
      code="404"
      title="Page not found"
      description={
        <>The page you're looking for doesn't exist, or you don't have access. If you followed a link, the issue or project may have been deleted.</>
      }
      action={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Link to="/tenants" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            Switch tenant
          </Link>
          <Link to="/tenants" className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Sign out
          </Link>
        </div>
      }
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Tenant-less top-level */}
        <Route path="/" element={<Navigate to="/tenants" replace />} />
        {/* Compat redirect — /login is no longer a real screen; tenant must be picked first. */}
        <Route path="/login" element={<Navigate to="/tenants" replace />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/design-canvas" element={<DesignCanvasPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        {/* Tenant-scoped login lives outside TenantLayout — it doesn't need WorkspacesProvider. */}
        <Route path="/:tenant/login" element={<LoginPage />} />

        {/* Tenant-scoped */}
        <Route element={<TenantLayout />}>
          <Route path="/:tenant" element={<TenantHomeRedirect />} />
          {/* Workspace picker — literal segment, ordered before `/:tenant/:workspace`. */}
          <Route path="/:tenant/workspaces" element={<WorkspacesPage />} />

          <Route element={<WorkspaceLayout />}>
            <Route path="/:tenant/:workspace" element={<WorkspaceHomeRedirect />} />
            <Route path="/:tenant/:workspace/inbox" element={<InboxPage />} />
            <Route path="/:tenant/:workspace/my-issues" element={<MyIssuesPage />} />
            <Route path="/:tenant/:workspace/all-issues" element={<AllIssuesPage />} />
            <Route path="/:tenant/:workspace/projects" element={<ProjectsPage />} />
            <Route path="/:tenant/:workspace/workflows" element={<WorkflowsPage />} />
            <Route path="/:tenant/:workspace/teams" element={<TeamsPage />} />
            <Route path="/:tenant/:workspace/teams/:teamSlug" element={<TeamDetailPage />} />
            <Route path="/:tenant/:workspace/u/:email" element={<MemberProfilePage />} />
            <Route path="/:tenant/:workspace/:project" element={<ProjectOverviewPage />} />
            <Route path="/:tenant/:workspace/:project/members" element={<ProjectMembersPage />} />
            <Route path="/:tenant/:workspace/:project/settings" element={<ProjectSettingsPage />} />
            <Route path="/:tenant/:workspace/:project/board" element={<BoardPage />} />
            <Route path="/:tenant/:workspace/:project/list" element={<ListPage />} />
            <Route path="/:tenant/:workspace/:project/workflow" element={<WorkflowPage />} />
            <Route path="/:tenant/:workspace/:project/workflow/rules" element={<RuleEditorPage />} />
            <Route path="/:tenant/:workspace/:project/issue/new" element={<CreateIssuePage />} />
            <Route path="/:tenant/:workspace/:project/issue/:key" element={<IssueDetailPage />} />

            <Route path="/:tenant/:workspace/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="general" replace />} />
              <Route path="general" element={<GeneralSettings />} />
              <Route path="members" element={<MembersSettings />} />
              <Route path="profile" element={<ProfileSettings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
