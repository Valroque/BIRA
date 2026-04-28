// /:workspace/:project/settings — per-project configuration.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, TypeChip, projectTabs, useTenantBreadcrumbs } from '../components/shell';
import { Field, Hint, DangerRow } from '../components/forms';
import { Section } from '../components/section';
import {
  WORKFLOWS, ISSUE_TYPE_NAMES, DEFAULT_PROJECT_WORKFLOWS,
  type IssueTypeLetter,
} from '../fixtures';
import { useProjects } from '../state/projects';

const TYPE_ORDER: IssueTypeLetter[] = ['T', 'B', 'S', 'E'];

export function ProjectSettingsPage() {
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const navigate = useNavigate();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);
  const [name, setName] = useState(projectInfo?.name ?? project);
  const [key, setKey] = useState(projectInfo?.key ?? '');
  const [description, setDescription] = useState(projectInfo?.description ?? '');
  const [assignments, setAssignments] = useState<Record<IssueTypeLetter, string>>(
    projectInfo?.workflows ?? DEFAULT_PROJECT_WORKFLOWS,
  );

  const setAssignment = (type: IssueTypeLetter, workflowId: string) =>
    setAssignments((prev) => ({ ...prev, [type]: workflowId }));

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
        'Settings',
      ]} />
      <Tabs active="settings" tabs={projectTabs(tenant, workspace, project)} />

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720 }}>
          <Section title="Project details" card>
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Issue key">
              <input
                className="input mono"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={4}
              />
              <Hint>Used as the prefix for issue IDs (<code>{key || 'CMT'}-123</code>).</Hint>
            </Field>
            <Field label="Description">
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ height: 'auto', padding: '8px 10px', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
              />
            </Field>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm">Save changes</button>
              <button className="btn btn-sm">Discard</button>
            </div>
          </Section>

          <Section
            title="Workflow assignments"
            subtitle="Each issue type uses one workflow. Multiple workflows can exist for the same type — different projects can pick different ones."
            card
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TYPE_ORDER.map((type) => {
                const wfId = assignments[type];
                const wf = WORKFLOWS[wfId];
                const choices = Object.values(WORKFLOWS);
                return (
                  <div
                    key={type}
                    style={{
                      display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
                      gap: 12, alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--bg-subtle)', borderRadius: 6,
                      border: '1px solid var(--border-muted)',
                    }}
                  >
                    <TypeChip type={type} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{ISSUE_TYPE_NAMES[type]}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }} className="tnum">
                        {wf.nodes.length} states · {wf.edges.length} transitions
                      </div>
                    </div>
                    <select
                      value={wfId}
                      onChange={(e) => setAssignment(type, e.target.value)}
                      className="input input-sm"
                      style={{ width: 'auto' }}
                    >
                      {choices.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => navigate(`/${tenant}/${workspace}/${project}/workflow`)}
                      className="btn btn-sm"
                      data-tip={`Open ${wf.name} in the editor`}
                    >
                      <Icon name="edit" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Danger zone" danger card>
            <DangerRow
              label="Archive project"
              description="Hide the project. Existing issues remain but the project disappears from sidebars."
              actionLabel="Archive…"
            />
            <DangerRow
              label="Delete project"
              description="Permanently delete this project and all of its issues, comments, and attachments."
              actionLabel="Delete…"
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

