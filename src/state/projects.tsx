// Workspace projects — runtime state.
//
// Combines code-defined seed projects (Comet/Orbit/Atlas/Halo) with
// user-created additions persisted to localStorage. Every consumer that
// used to read PROJECT_INFO / PROJECT_WORKFLOWS / PROJECT_MEMBERS now goes
// through `useProjects()` so newly-created projects appear everywhere
// (sidebar, board, list, filters, …) without each surface knowing about it.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import {
  SEED_PROJECTS,
  type IssueTypeLetter, type Project,
} from '../fixtures';

const STORAGE_KEY = 'bira:projects';

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
  /** Projects where `teamSlug` has been added. */
  projectsForTeam: (teamSlug: string) => Project[];
  /** All `(project, issue_type)` pairs that map to this workflow id. */
  projectsUsingWorkflow: (workflowId: string) => { project: Project; type: IssueTypeLetter }[];
}

const ProjectsContext = createContext<ProjectsCtxValue | undefined>(undefined);

function loadAdded(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Project =>
        p && typeof p.slug === 'string' && typeof p.name === 'string' && typeof p.key === 'string',
    );
  } catch {
    return [];
  }
}

const ALL_TYPES: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [added, setAdded] = useState<Project[]>(() => loadAdded());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
    } catch {
      // Quota / privacy mode — best-effort, ignore.
    }
  }, [added]);

  const projects = useMemo(() => [...SEED_PROJECTS, ...added], [added]);

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
    setAdded((prev) => [...prev, next]);
    return next;
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
    projects, getProject, addProject, projectsForTeam, projectsUsingWorkflow,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsCtxValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider');
  return ctx;
}
