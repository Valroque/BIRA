import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, Toolbar, Chip, StatusDot, STATUSES, projectTabs, useWorkspaceContext } from '../components/shell';
import { ListRow } from '../components/issue-row';
import { EmptyState } from '../components/states';
import { ISSUES } from '../fixtures';

export function ListPage() {
  return <ListView />;
}

export function ListView() {
  const { workspace, project } = useWorkspaceContext();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(['CMT-241', 'CMT-238', 'CMT-234']));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleCollapsed = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Scope the list to issues that belong to the current project — important now
  // that fixtures span Comet / Orbit / Atlas.
  const projectIssues = ISSUES.filter((i) => i.project === project);
  const grouped = STATUSES
    .filter((s) => s.id !== 'canceled')
    .map((s) => ({ ...s, items: projectIssues.filter((i) => i.status === s.id) }))
    .filter((g) => g.items.length);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: 'Comet', to: `/${workspace}/${project}` },
        'Issues',
      ]} />
      <Tabs active="issues" tabs={projectTabs(workspace, project)} />
      {/* Drift fix: removed "Sprint: 23" filter chip (sprints out of scope for v1). */}
      <Toolbar
        right={
          <>
            <button className="btn btn-sm"><Icon name="layers" size={13} />Group: Status</button>
            <button className="btn btn-sm"><Icon name="filter" size={13} />Sort</button>
          </>
        }
      >
        <Chip><Icon name="filter" size={11} color="var(--fg-muted)" />2 filters</Chip>
        <Chip dim>Assignee: <strong style={{ marginLeft: 3, color: 'var(--fg)' }}>Maya</strong></Chip>
      </Toolbar>

      <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
        {grouped.length === 0 && (
          <EmptyState
            icon="list"
            title="No issues yet"
            description="Issues you create or that match your filters will appear here, grouped by status."
            action={
              <Link to={`/${workspace}/${project}/issue/new`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                <Icon name="plus" size={13} />New issue
              </Link>
            }
          />
        )}
        {grouped.map((g) => {
          const isCollapsed = collapsed.has(g.id);
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => toggleCollapsed(g.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px', width: '100%',
                  background: 'var(--bg-subtle)',
                  borderBottom: '1px solid var(--border-muted)',
                  border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                  color: 'var(--fg)',
                }}
              >
                <Icon
                  name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                  size={12}
                  color="var(--fg-muted)"
                />
                <StatusDot status={g.id} size={10} />
                <span style={{ fontWeight: 600 }}>{g.name}</span>
                <span className="tnum" style={{ color: 'var(--fg-faint)' }}>{g.items.length}</span>
              </button>
              {!isCollapsed && g.items.map((i) => (
                <ListRow
                  key={i.id}
                  issue={i}
                  workspace={workspace}
                  selected={selectedIds.has(i.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
