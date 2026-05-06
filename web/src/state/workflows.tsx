// Workflows — runtime state.
//
// Two providers:
//
//   `WorkflowsProvider` — workspace-scoped. Mounted inside `WorkspaceLayout`
//     (App.tsx) with `key={`${tenant}/${workspace}`}`. Fetches the workspace's
//     workflows on mount. Detail (full graph + transitions + rules) is fetched
//     lazily via `getWorkflow(slug)` — the list endpoint already returns the
//     full `WorkflowView` so most callers won't need a second fetch.
//
//   `ProjectWorkflowsProvider` — project-scoped. Mounted inside the project
//     pages that need it (workflow editor, project settings). Fetches the
//     `(issueType → workflow)` map for one project, exposes a
//     `setWorkflowForType` mutation that PUTs through the API and refreshes
//     local state from the server's response.
//
// Why split them: the workspace list of workflows is pretty read-mostly and
// shared across every project page. The per-project assignment map only
// matters on the workflow editor + project-settings screens, and changes to
// it shouldn't invalidate every project's view of the workflow catalogue.

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  listWorkflows as apiListWorkflows,
  getWorkflow as apiGetWorkflow,
  updateWorkflow as apiUpdateWorkflow,
  getProjectWorkflows as apiGetProjectWorkflows,
  setProjectWorkflow as apiSetProjectWorkflow,
} from '../api/workflows';
import {
  toUpdateWorkflowPayload,
  type Workflow,
  type ProjectWorkflowMap,
  type WorkflowNode,
  type WorkflowEdge,
} from '../api/adapters/workflow.adapter';
import type { IssueTypeLetter } from '../fixtures';

// ---------------------------------------------------------------------------
// WorkflowsProvider — workspace-scoped catalogue
// ---------------------------------------------------------------------------

export interface WorkflowsCtxValue {
  /** Workflows in the workspace, in fetch order. Each entry is fully decorated. */
  workflows: Workflow[];
  loading: boolean;
  error: string | null;
  /** Lookup by slug. Returns undefined if the catalogue hasn't been refreshed. */
  getWorkflow: (slug: string) => Workflow | undefined;
  /** Lookup by UUID. Same fallback semantics as `getWorkflow`. */
  getWorkflowById: (id: string | null | undefined) => Workflow | undefined;
  /**
   * Fetch a single workflow's detail. Falls back to the cached entry from the
   * list if it's already there; otherwise hits the detail endpoint and merges
   * the result into the cache. Throws on API failure (callers can render an
   * <ErrorState> in their own surface).
   */
  fetchWorkflowDetail: (slug: string) => Promise<Workflow>;
  /** True while a `saveWorkflow` PATCH is in flight. */
  saving: boolean;
  /**
   * PATCH a workflow's metadata + graph in a single round-trip. The
   * adapter handles translating FE node/edge shape into the BE payload
   * (including dropping local-only ids so the BE mints uuids for fresh
   * nodes — see `toUpdateWorkflowPayload`). On success, the returned
   * `Workflow` replaces the cached entry by id so callers re-render
   * with server-authoritative ids and timestamps. Throws on failure;
   * callers decide UX (this provider does not surface errors itself).
   */
  saveWorkflow: (
    slug: string,
    patch: {
      name?: string;
      description?: string | null;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
    },
  ) => Promise<Workflow>;
  /** Re-fetch the list. Does not toggle `loading`. */
  refresh: () => Promise<void>;
}

const WorkflowsContext = createContext<WorkflowsCtxValue | undefined>(undefined);

export function WorkflowsProvider({
  tenant, workspace, children,
}: {
  tenant: string; workspace: string; children: ReactNode;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const items = await apiListWorkflows(tenant, workspace);
      setWorkflows(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace]);

  useEffect(() => { void load(true); }, [load]);

  const getWorkflow = useCallback(
    (slug: string) => workflows.find((w) => w.slug === slug),
    [workflows],
  );

  const getWorkflowById = useCallback(
    (id: string | null | undefined) => {
      if (!id) return undefined;
      return workflows.find((w) => w.id === id);
    },
    [workflows],
  );

  const fetchWorkflowDetail = useCallback(async (slug: string): Promise<Workflow> => {
    // The list endpoint already returns full WorkflowView, so a cache hit is
    // good enough unless the caller is racing the initial fetch. Re-fetch
    // anyway when there's no cached entry.
    const cached = workflows.find((w) => w.slug === slug);
    if (cached) return cached;
    const fresh = await apiGetWorkflow(tenant, workspace, slug);
    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === fresh.id);
      if (idx === -1) return [...prev, fresh];
      const copy = [...prev];
      copy[idx] = fresh;
      return copy;
    });
    return fresh;
  }, [tenant, workspace, workflows]);

  const saveWorkflow = useCallback(async (
    slug: string,
    patch: {
      name?: string;
      description?: string | null;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
    },
  ): Promise<Workflow> => {
    setSaving(true);
    try {
      const payload = toUpdateWorkflowPayload(patch);
      const fresh = await apiUpdateWorkflow(tenant, workspace, slug, payload);
      // Replace by id, same pattern as `fetchWorkflowDetail`. Append if
      // the list cache was empty / hadn't loaded yet.
      setWorkflows((prev) => {
        const idx = prev.findIndex((w) => w.id === fresh.id);
        if (idx === -1) return [...prev, fresh];
        const copy = [...prev];
        copy[idx] = fresh;
        return copy;
      });
      return fresh;
    } finally {
      setSaving(false);
    }
  }, [tenant, workspace]);

  const refresh = useCallback(() => load(false), [load]);

  const value: WorkflowsCtxValue = {
    workflows, loading, error, saving,
    getWorkflow, getWorkflowById, fetchWorkflowDetail, saveWorkflow, refresh,
  };

  return <WorkflowsContext.Provider value={value}>{children}</WorkflowsContext.Provider>;
}

export function useWorkflows(): WorkflowsCtxValue {
  const ctx = useContext(WorkflowsContext);
  if (!ctx) throw new Error('useWorkflows must be used within WorkflowsProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// ProjectWorkflowsProvider — per-project assignment map
// ---------------------------------------------------------------------------

export interface ProjectWorkflowsCtxValue {
  /** `(issueType → workflow summary | null)` for the active project. */
  projectWorkflows: ProjectWorkflowMap | null;
  loading: boolean;
  error: string | null;
  /** Saving state — true while a `setWorkflowForType` PUT is in flight. */
  saving: boolean;
  /**
   * Assign a workflow to `(project, issueType)`. Awaits the BE round-trip
   * and replaces the cached map with the response. Throws on failure so
   * callers can decide how to surface it (toast, inline error, etc.).
   */
  setWorkflowForType: (issueType: IssueTypeLetter, workflowSlug: string) => Promise<void>;
  /** Re-fetch the map. Does not toggle `loading`. */
  refresh: () => Promise<void>;
}

const ProjectWorkflowsContext = createContext<ProjectWorkflowsCtxValue | undefined>(undefined);

export function ProjectWorkflowsProvider({
  tenant, workspace, project, children,
}: {
  tenant: string; workspace: string; project: string; children: ReactNode;
}) {
  const [projectWorkflows, setProjectWorkflows] = useState<ProjectWorkflowMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (toggleLoading: boolean) => {
    if (!tenant || !workspace || !project) {
      if (toggleLoading) setLoading(false);
      return;
    }
    if (toggleLoading) setLoading(true);
    try {
      const map = await apiGetProjectWorkflows(tenant, workspace, project);
      setProjectWorkflows(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project workflows');
    } finally {
      if (toggleLoading) setLoading(false);
    }
  }, [tenant, workspace, project]);

  useEffect(() => { void load(true); }, [load]);

  const setWorkflowForType = useCallback(async (
    issueType: IssueTypeLetter,
    workflowSlug: string,
  ): Promise<void> => {
    setSaving(true);
    try {
      // Await + replace from server response — the BE returns the
      // post-mutation map so we don't have to reason about default
      // fallbacks vs explicit assignments on the FE.
      const updated = await apiSetProjectWorkflow(
        tenant, workspace, project, issueType, workflowSlug,
      );
      setProjectWorkflows(updated);
      setError(null);
    } finally {
      setSaving(false);
    }
  }, [tenant, workspace, project]);

  const refresh = useCallback(() => load(false), [load]);

  const value: ProjectWorkflowsCtxValue = {
    projectWorkflows, loading, error, saving,
    setWorkflowForType, refresh,
  };

  return (
    <ProjectWorkflowsContext.Provider value={value}>
      {children}
    </ProjectWorkflowsContext.Provider>
  );
}

export function useProjectWorkflows(): ProjectWorkflowsCtxValue {
  const ctx = useContext(ProjectWorkflowsContext);
  if (!ctx) throw new Error('useProjectWorkflows must be used within ProjectWorkflowsProvider');
  return ctx;
}
