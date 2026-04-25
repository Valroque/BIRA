// /:workspace/workflows — workspace-level workflow + issue-type management.
// Workflows are first-class entities. Each (project, issue_type) pair selects
// one workflow. The same workflow can be used by many pairs, or a project can
// pick a different one for an issue type.
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, useWorkspaceContext } from '../components/shell';
import {
  WORKFLOWS, PROJECT_WORKFLOWS, PROJECT_INFO, ISSUE_TYPE_NAMES, projectsUsingWorkflow,
  type IssueTypeLetter, type ProjectSlug,
} from '../fixtures';

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

export function WorkflowsPage() {
  const { workspace } = useWorkspaceContext();

  // Group workflows by which issue type they serve. A workflow appears under
  // any issue type that any project uses it for.
  const groups = TYPE_ORDER.map((type) => {
    const ids = new Set<string>();
    (Object.keys(PROJECT_WORKFLOWS) as ProjectSlug[]).forEach((p) => {
      ids.add(PROJECT_WORKFLOWS[p][type]);
    });
    return {
      type,
      typeName: ISSUE_TYPE_NAMES[type],
      workflows: Array.from(ids).map((id) => WORKFLOWS[id]),
    };
  });

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
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
          {groups.map((g) => (
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
                  const usagePairs = projectsUsingWorkflow(wf.id).filter((p) => p.type === g.type);
                  // Pick the first project that uses this workflow → this drives the editor's URL.
                  const firstProject = usagePairs[0]?.project ?? 'comet';
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
                          }}>{wf.id}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                          {wf.description}
                        </div>
                        <div className="tnum" style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 6 }}>
                          {wf.nodes.length} states · {wf.edges.length} transitions
                        </div>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
                          textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
                        }}>
                          Used by
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {usagePairs.map(({ project }) => {
                            const p = PROJECT_INFO[project];
                            return (
                              <Link
                                key={project}
                                to={`/${workspace}/${project}/workflow`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '2px 6px', borderRadius: 3,
                                  background: p.bg, color: p.color,
                                  fontSize: 11.5, fontWeight: 500, textDecoration: 'none',
                                }}
                              >
                                <span style={{ width: 5, height: 5, borderRadius: 3, background: 'currentColor' }} />
                                {p.name}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                      <Link
                        to={`/${workspace}/${firstProject}/workflow`}
                        className="btn btn-sm"
                        style={{ textDecoration: 'none' }}
                        data-tip={`Open editor in ${PROJECT_INFO[firstProject].name}'s context`}
                      >
                        <Icon name="edit" size={12} />Edit
                      </Link>
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
