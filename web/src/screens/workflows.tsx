// /:workspace/workflows — workspace-level workflow + issue-type management.
// Workflows are first-class entities. Each (project, issue_type) pair selects
// one workflow. The same workflow can be used by many pairs, or a project can
// pick a different one for an issue type.
//
// Slice 8 wired the page off the `WORKFLOWS` fixture and onto the API. The
// "used by" cross-cut requires per-project assignment data; we collect it
// lazily from the per-project endpoint via `useProjectsUsingWorkflow`.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, useTenantBreadcrumbs } from '../components/shell';
import { ProjectChip } from '../components/project-chip';
import { EmptyState, ErrorState, SkeletonRow } from '../components/states';
import { ISSUE_TYPE_NAMES, type IssueTypeLetter, type Project } from '../fixtures';
import { useProjects } from '../state/projects';
import { useWorkflows } from '../state/workflows';
import { getProjectWorkflows as apiGetProjectWorkflows } from '../api/workflows';

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

interface UsageRow {
  project: Project;
  type: IssueTypeLetter;
  workflowId: string;
}

/**
 * Fetches every project's workflow assignment map. The list endpoint at
 * `/projects` already returns this in the decorated payload, but the FE
 * adapter currently strips it (slice C predates the workflow slice). We
 * re-issue the per-project workflow GETs here as a focused fetch — small
 * N (≤ a handful of projects) and only on the workspace workflows page.
 *
 * If/when the FE project adapter learns to read `workflows` off the list
 * payload, this hook can swap to `useProjects()` directly.
 */
function useProjectsUsingWorkflow(
  tenant: string,
  workspace: string,
  projects: Project[],
): {
  /** flat list of (project, issueType, workflowId) */
  rows: UsageRow[];
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable cache key — re-run only when the list of project slugs changes.
  const projectKey = projects.map((p) => p.slug).join(',');

  useEffect(() => {
    if (!tenant || !workspace || projects.length === 0) {
      setRows([]); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      projects.map((p) =>
        apiGetProjectWorkflows(tenant, workspace, p.slug)
          .then((map) => ({ project: p, map }))
          .catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const flat: UsageRow[] = [];
      for (const r of results) {
        if (!r) continue;
        for (const t of TYPE_ORDER) {
          const summary = r.map[t];
          if (summary) flat.push({ project: r.project, type: t, workflowId: summary.id });
        }
      }
      setRows(flat);
      setError(null);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load project workflow assignments');
      setLoading(false);
    });
    return () => { cancelled = true; };
  // projectKey is the stable identity of `projects` for this effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, workspace, projectKey]);

  return { rows, loading, error };
}

export function WorkflowsPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { projects } = useProjects();
  const { workflows, loading: wfLoading, error: wfError } = useWorkflows();
  const { rows: usageRows, loading: usageLoading } = useProjectsUsingWorkflow(
    tenant, workspace, projects,
  );

  const loading = wfLoading || usageLoading;

  // Group workflows by which issue type they're used for. A workflow appears
  // under any issue type that any project assigns it to. If a workflow exists
  // in the workspace but isn't assigned to any project, we still want to show
  // it once — under whatever issue type its slug suggests is the default
  // mapping (Tasks/Bugs/Stories → 'default', Epics → 'epic-coarse'). This
  // keeps a freshly-seeded workspace's three default workflows visible.
  const groups = TYPE_ORDER.map((type) => {
    const ids = new Set<string>();
    for (const r of usageRows) {
      if (r.type === type) ids.add(r.workflowId);
    }
    // Surface untouched defaults so a brand-new workspace doesn't render an
    // empty group. Heuristic only — drop once usage is dense.
    if (ids.size === 0) {
      const fallback = workflows.find((w) =>
        type === 'E' ? w.slug === 'epic-coarse' : w.slug === 'default',
      );
      if (fallback) ids.add(fallback.id);
    }
    return {
      type,
      typeName: ISSUE_TYPE_NAMES[type],
      workflows: Array.from(ids)
        .map((id) => workflows.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => Boolean(w)),
    };
  });

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        'Workflows',
      ]} />
      <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Issue types &amp; workflows</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0', maxWidth: 720 }}>
              Each project picks one workflow per issue type. Multiple workflows can exist for the same type — projects can share or each pick its own.
            </p>
          </div>
          <button className="btn btn-primary" disabled data-tip="Coming soon">
            <Icon name="plus" size={13} />New workflow
          </button>
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {wfError && (
            <ErrorState
              code="500"
              title="Couldn't load workflows"
              description={wfError}
            />
          )}
          {loading && !wfError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkeletonRow height={70} />
              <SkeletonRow height={70} />
              <SkeletonRow height={70} />
            </div>
          )}
          {!loading && !wfError && workflows.length === 0 && (
            <EmptyState
              icon="branch"
              title="No workflows yet"
              description="Workflows are seeded automatically per workspace. If this list stays empty, ask an admin to re-run the workspace seed."
              size="page"
            />
          )}
          {!loading && !wfError && workflows.length > 0 && groups.map((g) => (
            <section key={g.type}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span className={`tchip tchip-${g.type}`} style={{ width: 22, height: 22, borderRadius: 5, fontSize: 12 }}>
                  {g.type}
                </span>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{g.typeName}</h2>
                <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>
                  · {g.workflows.length} workflow{g.workflows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.workflows.map((wf) => {
                  const usagePairs = usageRows.filter(
                    (r) => r.workflowId === wf.id && r.type === g.type,
                  );
                  // Pick the first project that uses this workflow → drives the editor's URL.
                  const firstProject = usagePairs[0]?.project;
                  return (
                    <div
                      key={wf.id + g.type}
                      className="card"
                      style={{
                        padding: 14, display: 'grid',
                        gridTemplateColumns: '1.6fr 1.4fr auto',
                        gap: 14, alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Icon name="branch" size={13} color="var(--accent)" />
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{wf.name}</span>
                          <span className="mono" style={{
                            fontSize: 10.5, color: 'var(--fg-faint)',
                            background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: 3,
                          }}>{wf.slug}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                          {wf.description}
                        </div>
                        <div className="tnum" style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 6 }}>
                          {wf.nodes.length} states · {wf.edges.length} transitions
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="label-section" style={{ marginBottom: 6 }}>
                          Used by
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {usagePairs.map(({ project: p }) => (
                            <Link
                              key={p.slug}
                              to={`/${tenant}/${workspace}/${p.slug}/workflow`}
                              style={{ textDecoration: 'none' }}
                            >
                              <ProjectChip project={p} />
                            </Link>
                          ))}
                          {usagePairs.length === 0 && (
                            <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontStyle: 'italic' }}>
                              Not used by any project
                            </span>
                          )}
                        </div>
                      </div>
                      {firstProject ? (
                        <Link
                          to={`/${tenant}/${workspace}/${firstProject.slug}/workflow`}
                          className="btn btn-sm"
                          style={{ textDecoration: 'none' }}
                          data-tip={`Open editor in ${firstProject.name}'s context`}
                        >
                          <Icon name="edit" size={12} />Edit
                        </Link>
                      ) : (
                        <button className="btn btn-sm" disabled data-tip="Not assigned to any project">
                          <Icon name="edit" size={12} />Edit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
