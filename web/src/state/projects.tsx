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
  SEED_PROJECTS,
  type IssueTypeLetter, type Project,
} from '../fixtures';
import {
  listProjects as apiListProjects,
  createProject as apiCreateProject,
} from '../api/projects';

/** Fields the create-project form supplies. */
export interface AddProjectInput {
  slug: string;
  name: string;
  key: string;
  letter: string;
  color: string;
  bg: string;
  description: string;
  workflows: Record<IssueTypeLetter, string>;
  teamSlugs: string[];
  userEmails: string[];
  createdByEmail: string;
}

export interface ProjectsCtxValue {
  /** Projects returned by the API (or seeded for the demo workspace). */
  projects: Project[];
  loading: boolean;
  error: string | null;
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getProject: (slug: string) => Project | undefined;
  /** Create a new project via the API. Returns the newly-created Project. */
  addProject: (input: AddProjectInput) => Promise<Project>;
  /** Patch any field on an existing project (local state only — no API call). */
  updateProject: (slug: string, patch: Partial<Project>) => void;
  /** Projects where `teamSlug` has been added. */
  projectsForTeam: (teamSlug: string) => Project[];
  /** All `(project, issue_type)` pairs that map to this workflow id. */
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

  const addProject = useCallback(async (input: AddProjectInput): Promise<Project> => {
    // Strip FE-only fields before sending to the API.
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
    // Override with the richer input values the form supplied (workflows, teamSlugs, etc.)
    const enriched: Project = {
      ...created,
      workflows: input.workflows,
      teamSlugs: input.teamSlugs,
      userEmails: input.userEmails,
      createdByEmail: input.createdByEmail,
    };
    setProjects((prev) => [...prev, enriched]);
    return enriched;
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
    projects, loading, error, getProject, addProject, updateProject,
    projectsForTeam, projectsUsingWorkflow,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsCtxValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
