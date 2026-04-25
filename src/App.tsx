import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams, Link } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { ErrorState } from './components/states';
import { LoginPage } from './screens/login';
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
import { ProjectMembersPage } from './screens/project-members';
import { DesignCanvasPage } from './screens/design-canvas';

function WorkspaceLayout() {
  const { pathname } = useLocation();
  // Derive the highlighted sidebar item from the URL.
  let sidebarActive = 'comet';
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
  else if (/^\/[^/]+\/settings(\/|$)/.test(pathname)) sidebarActive = 'settings';
  // Project-level settings keep the project's "Comet" item highlighted.
  else if (pathname.endsWith('/settings')) sidebarActive = 'comet';
  else if (pathname.endsWith('/board')) sidebarActive = 'comet-board';
  else if (pathname.endsWith('/list')) sidebarActive = 'comet-list';
  else if (pathname.endsWith('/members')) sidebarActive = 'comet';
  else if (pathname.includes('/workflow')) sidebarActive = 'comet-workflow';
  else if (pathname.includes('/issue/')) sidebarActive = 'comet-list';
  return (
    <AppShell sidebarActive={sidebarActive}>
      <Outlet />
    </AppShell>
  );
}

/** /:workspace → redirect to /:workspace/comet (the only project in fixtures). */
function WorkspaceHomeRedirect() {
  const { workspace } = useParams<{ workspace: string }>();
  return <Navigate to={`/${workspace}/comet`} replace />;
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
          <Link to="/acme/comet" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
            Back to Comet
          </Link>
          <Link to="/login" className="btn btn-sm" style={{ textDecoration: 'none' }}>
            Switch workspace
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
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="/design-canvas" element={<DesignCanvasPage />} />

        <Route element={<WorkspaceLayout />}>
          <Route path="/:workspace" element={<WorkspaceHomeRedirect />} />
          <Route path="/:workspace/inbox" element={<InboxPage />} />
          <Route path="/:workspace/my-issues" element={<MyIssuesPage />} />
          <Route path="/:workspace/all-issues" element={<AllIssuesPage />} />
          <Route path="/:workspace/projects" element={<ProjectsPage />} />
          <Route path="/:workspace/workflows" element={<WorkflowsPage />} />
          <Route path="/:workspace/teams" element={<TeamsPage />} />
          <Route path="/:workspace/teams/:teamSlug" element={<TeamDetailPage />} />
          <Route path="/:workspace/:project" element={<ProjectOverviewPage />} />
          <Route path="/:workspace/:project/members" element={<ProjectMembersPage />} />
          <Route path="/:workspace/:project/settings" element={<ProjectSettingsPage />} />
          <Route path="/:workspace/:project/board" element={<BoardPage />} />
          <Route path="/:workspace/:project/list" element={<ListPage />} />
          <Route path="/:workspace/:project/workflow" element={<WorkflowPage />} />
          <Route path="/:workspace/:project/workflow/rules" element={<RuleEditorPage />} />
          <Route path="/:workspace/:project/issue/new" element={<CreateIssuePage />} />
          <Route path="/:workspace/:project/issue/:key" element={<IssueDetailPage />} />

          <Route path="/:workspace/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<GeneralSettings />} />
            <Route path="members" element={<MembersSettings />} />
            <Route path="profile" element={<ProfileSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
