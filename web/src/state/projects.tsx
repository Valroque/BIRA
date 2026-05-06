// Workspace projects — runtime state, scoped per (tenant, workspace).
//
// Fetches from the API on mount. Falls back to SEED_PROJECTS for the demo
// `acme-corp/acme` workspace when the API returns an empty list (keeps the
// prototype usable against a fresh DB). Mounted inside `WorkspaceLayout`
// (App.tsx) with `key={`${tenant}/${workspace}`}`.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  SEED_PROJECTS, DEFAULT_PROJECT_WORKFLOWS,
  type IssueTypeLetter, type Project,
} from '../fixtures';
import {
  listProjects as apiListProjects,
  createProject as apiCreateProject,
} from '../api/projects';
import { setProjectWorkflow as apiSetProjectWorkflow } from '../api/workflows';
import {
  grantTeamAccess as apiGrantTeamAccess,
  grantUserAccess as apiGrantUserAccess,
} from '../api/projectAccess';

/** Fields the create-project form supplies. */
export interface AddProjectInput {
  slug: string;
  name: string;
  key: string;
  letter: string;
  color: string;
  bg: string;
  description: string;
  /**
   * Per-issue-type workflow slugs. Only entries that differ from the
   * workspace default (`DEFAULT_PROJECT_WORKFLOWS`) are PUT to the BE —
   * the rest fall through to the slug-default chain in
   * `getProjectWorkflows.ts`.
   */
  workflows: Record<IssueTypeLetter, string>;
  /**
   * Team UUIDs to grant project access to. Each gets the default
   * `read` role (the modal doesn't expose a role picker; users can
   * upgrade later from the Members page once that surface lands —
   * see #21).
   */
  teamIds: string[];
  /**
   * User UUIDs to grant explicit `write` access to. Must NOT include
   * the creator — the BE auto-grants the creator `admin` in the same
   * transaction as the project insert.
   */
  userIds: string[];
}

export interface ProjectsCtxValue {
  /** Projects returned by the API (or seeded for the demo workspace). */
  projects: Project[];
  loading: boolean;
  error: string | null;
  /**
   * Lookup by slug — used for resolving URL params (`/:project`) into a
   * Project. New code that already has a UUID should prefer
   * `getProjectById`. Returns undefined for unknown slugs.
   */
  getProject: (slug: string) => Project | undefined;
  /**
   * Lookup by UUID — used for resolving `Issue.projectId` and any other
   * UUID-keyed reference. Returns undefined for unknown ids — callers must
   * render a placeholder / fall back to slug, never the raw uuid.
   */
  getProjectById: (id: string | null | undefined) => Project | undefined;
  /** Create a new project via the API. Returns the newly-created Project. */
  addProject: (input: AddProjectInput) => Promise<Project>;
  /** Patch any field on an existing project (local state only — no API call). */
  updateProject: (slug: string, patch: Partial<Project>) => void;
  /**
   * Projects where `teamSlug` has been added.
   *
   * @deprecated Slice 4 FE (2026-05-05) — `Project.teamSlugs` is no longer
   * populated by the API adapter (project list response doesn't include
   * grants). This now only returns matches for SEED_PROJECTS in the demo
   * workspace; for API-loaded projects it's always empty.
   * The team-detail "Projects using this team" surface needs a BE reverse-
   * lookup endpoint (`GET .../teams/:teamSlug/projects` or similar). Until
   * that exists this returns empty — flagged as follow-up.
   */
  projectsForTeam: (teamSlug: string) => Project[];
  /**
   * All `(project, issue_type)` pairs that map to this workflow id.
   *
   * @deprecated Slice 8 — `Project.workflows` is now seeded with the FE's
   * `DEFAULT_PROJECT_WORKFLOWS` and not refreshed from the BE per project.
   * Use `getProjectWorkflows` from `web/src/api/workflows.ts` instead — see
   * `screens/workflows.tsx` for the canonical pattern.
   */
  projectsUsingWorkflow: (workflowId: string) => { project: Project; type: IssueTypeLetter }[];
}

const ProjectsContext = createContext<ProjectsCtxValue | undefined>(undefined);

const ALL_TYPES: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

export function ProjectsProvider({
  tenant, workspace, children,
}: {
  tenant: string; workspace: string; children: ReactNode;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant || !workspace) { setLoading(false); return; }
    setLoading(true);
    apiListProjects(tenant, workspace)
      .then((ps) => {
        // Fall back to seed projects for the demo workspace when the DB is empty.
        if (ps.length === 0 && tenant === 'acme-corp' && workspace === 'acme') {
          setProjects(SEED_PROJECTS);
        } else {
          setProjects(ps);
        }
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        // Still fall back to seeds for the demo workspace so the prototype stays usable.
        if (tenant === 'acme-corp' && workspace === 'acme') {
          setProjects(SEED_PROJECTS);
        }
      })
      .finally(() => setLoading(false));
  }, [tenant, workspace]);

  const getProject = useCallback(
    (slug: string) => projects.find((p) => p.slug === slug),
    [projects],
  );

  const getProjectById = useCallback(
    (id: string | null | undefined) => {
      if (!id) return undefined;
      return projects.find((p) => p.id === id);
    },
    [projects],
  );

  const addProject = useCallback(async (input: AddProjectInput): Promise<Project> => {
    // Step 1 — create the project. The BE atomically grants the creator
    // admin role on the new project; we never push the creator's id
    // through `userIds`. If this throws, no downstream writes run.
    const apiInput = {
      slug: input.slug,
      key: input.key,
      name: input.name,
      letter: input.letter,
      color: input.color,
      bg: input.bg,
      description: input.description,
    };
    const created = await apiCreateProject(tenant, workspace, apiInput);

    // Step 2 — workflow assignments. PUT only the deltas: a per-type
    // pick that matches the workspace default doesn't need a row in
    // `project_workflows` (the slug-default fallback resolves it).
    const workflowWrites = (Object.entries(input.workflows) as [IssueTypeLetter, string][])
      .filter(([type, slug]) => slug && slug !== DEFAULT_PROJECT_WORKFLOWS[type])
      .map(([type, slug]) =>
        apiSetProjectWorkflow(tenant, workspace, created.slug, type, slug)
      );

    // Step 3 — team grants. Default role is `read` (per #21 — RBAC
    // surfaces are still being designed; safer to start narrow and let
    // the user upgrade explicitly).
    const teamWrites = input.teamIds.map((teamId) =>
      apiGrantTeamAccess(tenant, workspace, created.slug, teamId, 'read')
    );

    // Step 4 — explicit user grants at `write` (the modal copy reads
    // "edit access"). Creator is excluded by contract — the BE handled
    // them at create time.
    const userWrites = input.userIds.map((userId) =>
      apiGrantUserAccess(tenant, workspace, created.slug, userId, 'write')
    );

    // Run grant + workflow writes concurrently; treat each independently
    // because they're not transactional with the project insert. A
    // failed grant doesn't roll the project back — the user can re-grant
    // from the Members page. Surface the error count so the modal can
    // toast / warn.
    const settled = await Promise.allSettled([
      ...workflowWrites,
      ...teamWrites,
      ...userWrites,
    ]);
    const failures = settled.filter((s) => s.status === 'rejected');
    if (failures.length > 0) {
      // Don't block; the project exists and the creator has admin. Log
      // so a follow-up audit can correlate the partial state.
      // eslint-disable-next-line no-console
      console.warn(
        `Project '${created.slug}' created, but ${failures.length} of ${settled.length} ` +
        `grant/workflow writes failed:`,
        failures.map((f) => (f as PromiseRejectedResult).reason)
      );
    }

    setProjects((prev) => [...prev, created]);
    return created;
  }, [tenant, workspace]);

  const updateProject = useCallback((slug: string, patch: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.slug === slug ? { ...p, ...patch } : p)));
  }, []);

  const projectsForTeam = useCallback(
    (teamSlug: string) => projects.filter((p) => p.teamSlugs.includes(teamSlug)),
    [projects],
  );

  const projectsUsingWorkflow = useCallback(
    (workflowId: string) => {
      const out: { project: Project; type: IssueTypeLetter }[] = [];
      for (const project of projects) {
        for (const type of ALL_TYPES) {
          if (project.workflows[type] === workflowId) out.push({ project, type });
        }
      }
      return out;
    },
    [projects],
  );

  const value: ProjectsCtxValue = {
    projects, loading, error, getProject, getProjectById, addProject, updateProject,
    projectsForTeam, projectsUsingWorkflow,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsCtxValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
