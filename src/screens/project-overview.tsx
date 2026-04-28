import { Link } from 'react-router-dom';
import { TopBar, Tabs, projectTabs, useTenantContext } from '../components/shell';
import { ListRow } from '../components/issue-row';
import { ISSUES } from '../fixtures';
import { useProjects } from '../state/projects';

export function ProjectOverviewPage() {
  const { tenant, workspace, project } = useTenantContext();
  const { getProject } = useProjects();
  const projectInfo = getProject(project);
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${tenant}/${workspace}/projects` },
        projectInfo?.name ?? project,
      ]} />
      <Tabs active="overview" tabs={projectTabs(tenant, workspace, project)} />

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: projectInfo?.bg ?? 'var(--accent-muted)',
            color: projectInfo?.color ?? 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16,
          }}>{projectInfo?.letter ?? '?'}</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
            {projectInfo?.name ?? project}
          </h1>
          <span className="pill" style={projectInfo?.status === 'archived'
            ? { background: 'var(--bg-muted)', color: 'var(--fg-muted)' }
            : undefined}
          >
            {projectInfo?.status === 'archived' ? 'Archived' : 'Active'}
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 24px', maxWidth: 540 }}>
          {projectInfo?.description ?? 'No description.'}
        </p>

        {/* Drift fix: replaced "Velocity 34 pts 14d avg" (sprint-flavored) with a sprint-agnostic "Done (7d)". */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }}>
          <Stat label="Open" value="98" trend="+12" tone="up" />
          <Stat label="In progress" value="12" trend="+3" />
          <Stat label="Blocked" value="4" trend="−1" tone="down" />
          <Stat label="Done (7d)" value="34" trend="trailing 7 days" muted />
        </div>

        {/*
          Drift fix: removed the "Sprint 23 burndown" card (sprints are out of scope for v1).
          Workflow Health expanded to full width.
        */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Workflow health</span>
            <Link
              to={`/${tenant}/${workspace}/${project}/workflow`}
              style={{ fontSize: 11.5, color: 'var(--fg-muted)', textDecoration: 'none' }}
            >Edit workflow →</Link>
            <span className="pill" style={{ marginLeft: 'auto', background: 'var(--in-progress-bg)', color: 'var(--in-progress)' }}>3 stuck</span>
          </div>
          <FunnelBars />
        </div>

        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)', fontSize: 13, fontWeight: 600 }}>
            Recently updated
          </div>
          {ISSUES.filter((i) => i.project === project).slice(0, 5).map((i) => (
            <ListRow key={i.id} issue={i} tenant={tenant} workspace={workspace} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  trend?: string;
  tone?: 'up' | 'down';
  muted?: boolean;
}
function Stat({ label, value, trend, tone, muted }: StatProps) {
  const trendColor = muted
    ? 'var(--fg-faint)'
    : tone === 'down' ? 'var(--done)'
    : tone === 'up' ? 'var(--blocked)'
    : 'var(--fg-muted)';
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }} className="tnum">{value}</div>
      {trend && <div style={{ fontSize: 11.5, color: trendColor, marginTop: 2 }}>{trend}</div>}
    </div>
  );
}

function FunnelBars() {
  const data = [
    { name: 'Backlog', n: 47, color: 'var(--backlog)' },
    { name: 'Todo', n: 23, color: 'var(--todo)' },
    { name: 'In Progress', n: 12, color: 'var(--in-progress)' },
    { name: 'In Review', n: 6, color: 'var(--in-review)' },
    { name: 'Done', n: 312, color: 'var(--done)' },
  ];
  const max = 50; // cap visualization
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d) => (
        <div key={d.name} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 36px', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--fg-muted)' }}>{d.name}</span>
          <div style={{ height: 14, borderRadius: 3, background: 'var(--bg-muted)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (d.n / max) * 100)}%`, background: d.color }} />
          </div>
          <span className="tnum" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>{d.n}</span>
        </div>
      ))}
    </div>
  );
}
