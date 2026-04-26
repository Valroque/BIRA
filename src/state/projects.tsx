// Workspace projects — runtime state, scoped per workspace.
//
// Holds the full projects list (seeds + user-added) in component state and
// persists it to localStorage. Seed projects are auto-backfilled on load if
// the persisted list is missing them — so the demo workspace stays usable
// across schema changes, but any user edit to a seed (rename, archive,
// workflow re-assignment, etc.) sticks.
//
// Every consumer that used to read PROJECT_INFO / PROJECT_WORKFLOWS /
// PROJECT_MEMBERS now goes through `useProjects()` so newly-created or
// edited projects appear everywhere (sidebar, board, list, filters, …)
// without each surface knowing about it.
//
// The provider is mounted inside `WorkspaceLayout` (App.tsx) with
// `key={workspace}`, so navigating between workspaces remounts it with the
// new workspace's storage key + seed.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  SEED_PROJECTS,
  type IssueTypeLetter, type Project,
} from '../fixtures';

/** localStorage key for the full project list in a given workspace. */
const storageKey = (workspace: string) => `bira:projects:${workspace}`;

/**
 * Demo `acme` workspace ships with seed projects so the prototype isn't
 * empty on first load. Other workspaces start with no projects until the
 * user creates one — matching the behavior of a fresh tenant.
 */
const seedFor = (workspace: string): Project[] =>
  workspace === 'acme' ? SEED_PROJECTS : [];

function isValidProject(p: unknown): p is Project {
  return !!p && typeof (p as Project).slug === 'string'
    && typeof (p as Project).name === 'string'
    && typeof (p as Project).key === 'string';
}

/** Load + backfill missing seeds. Returns the persisted list, with any seed
 *  slugs not present in storage prepended so the workspace is never missing
 *  its expected starting projects. */
function loadProjects(workspace: string): Project[] {
  const seeds = seedFor(workspace);
  let stored: Project[] = [];
  try {
    const raw = localStorage.getItem(storageKey(workspace));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed.filter(isValidProject);
    }
  } catch {
    // ignore — fall through to seeds-only.
  }
  const presentSlugs = new Set(stored.map((p) => p.slug));
  const missingSeeds = seeds.filter((s) => !presentSlugs.has(s.slug));
  return [...missingSeeds, ...stored];
}

/** Fields the create-project form supplies. The provider fills the rest. */
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
  /** Seeded projects + user-added projects (in that order). */
  projects: Project[];
  /** Lookup by slug. Returns undefined for unknown slugs. */
  getProject: (slug: string) => Project | undefined;
  /** Append a new project. Returns the newly-created `Project`. */
  addProject: (input: AddProjectInput) => Project;
  /** Patch any field on an existing project (seed or user-added). No-op if
   *  the slug isn't found. */
  updateProject: (slug: string, patch: Partial<Project>) => void;
  /** Projects where `teamSlug` has been added. */
  projectsForTeam: (teamSlug: string) => Project[];
  /** All `(project, issue_type)` pairs that map to this workflow id. */
  projectsUsingWorkflow: (workflowId: string) => { project: Project; type: IssueTypeLetter }[];
}

const ProjectsContext = createContext<ProjectsCtxValue | undefined>(undefined);

const ALL_TYPES: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

export function ProjectsProvider({ workspace, children }: { workspace: string; children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects(workspace));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(workspace), JSON.stringify(projects));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [workspace, projects]);

  const getProject = useCallback(
    (slug: string) => projects.find((p) => p.slug === slug),
    [projects],
  );

  const addProject = useCallback((input: AddProjectInput): Project => {
    const next: Project = {
      ...input,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setProjects((prev) => [...prev, next]);
    return next;
  }, []);

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
    projects, getProject, addProject, updateProject, projectsForTeam, projectsUsingWorkflow,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsCtxValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
