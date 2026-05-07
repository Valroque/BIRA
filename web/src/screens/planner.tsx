// Workspace-level Planner.
//
// Slice 1 shipped the breadcrumbs, page header, and a placeholder body.
// Slice 2 layered in PlannerProvider + the time-window toolbar.
// Slice 4 (2026-05-06) mounted the PlannerGantt below the toolbar.
// **Slice 9 (2026-05-07)** — replaces the preset chips with two
// `<input type="date">` controls (From / To), and adds a "Gantt /
// Workload" tab strip below the page header that swaps the gantt for
// the heatmap pivot. Both views consume the same window-filtered issue
// list, the same scheduler result (computed independently inside each
// component), and the same `today` reading.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, useTenantBreadcrumbs } from '../components/shell';
import type { Crumb } from '../components/shell';
import { EmptyState, ErrorState } from '../components/states';
import { PlannerGantt } from '../components/planner-gantt';
import { PlannerWorkload } from '../components/planner-workload';
import { useIssues } from '../state/issues';
import { usePlanner, toIsoDate } from '../state/planner';
import type { Issue } from '../fixtures';

/** Local pivot state — Gantt vs Workload heatmap. Local React state
 *  rather than a query param: in-page pivots don't need history /
 *  shareable URLs (the planner is an FE-only sandbox), and a query
 *  param would interleave with the existing browser-back handling. */
type PlannerView = 'gantt' | 'workload';

/** A leaf is "in window" iff its date span overlaps the window at all.
 *  For unscheduled leaves (no start/end), include them — slice 8 will
 *  surface them in a dedicated rail and the user still wants to see
 *  them somewhere. */
function leafIsInWindow(issue: Issue, winStart: string, winEnd: string): boolean {
  if (issue.type !== 'T' && issue.type !== 'B') return false;
  if (!issue.startDate && !issue.endDate) return true;
  const start = issue.startDate ?? issue.endDate!;
  const end = issue.endDate ?? issue.startDate!;
  // Overlap: start <= winEnd AND end >= winStart.
  return start <= winEnd && end >= winStart;
}

/** Container is "in window" iff at least one descendant leaf in the input
 *  set is. Walks the children chain via the byKey lookup. */
function containerHasLiveLeafInWindow(
  issue: Issue,
  byKey: Map<string, Issue>,
  winStart: string,
  winEnd: string,
  seen: Set<string>,
): boolean {
  if (seen.has(issue.key)) return false;
  seen.add(issue.key);
  if (!issue.children) return false;
  for (const c of issue.children) {
    const child = byKey.get(c);
    if (!child) continue;
    if (child.type === 'T' || child.type === 'B') {
      if (leafIsInWindow(child, winStart, winEnd)) return true;
    } else if (containerHasLiveLeafInWindow(child, byKey, winStart, winEnd, seen)) {
      return true;
    }
  }
  return false;
}

export function PlannerPage() {
  const { tenant, workspace, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { plan, setWindow, reset, hasOverrides } = usePlanner();
  const { issues, loading, error, refresh } = useIssues();

  const breadcrumbs: Crumb[] = [
    { label: tenantName, to: `/${tenant}/workspaces` },
    { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
    'Planner',
  ];

  // Filter the input issues by the visible window. Leaves overlap by
  // their (start, end). Containers tag along iff at least one descendant
  // leaf survives. The PlannerGantt will additionally drop empty
  // containers post-scheduler, but doing it here too keeps the
  // scheduler's working set smaller and aligns priority order with what
  // the user actually sees.
  const filteredIssues = useMemo(() => {
    const winStart = plan.window.start;
    const winEnd = plan.window.end;
    const byKey = new Map<string, Issue>();
    for (const i of issues) byKey.set(i.key, i);
    return issues.filter((issue) => {
      if (issue.type === 'T' || issue.type === 'B') {
        return leafIsInWindow(issue, winStart, winEnd);
      }
      return containerHasLiveLeafInWindow(issue, byKey, winStart, winEnd, new Set());
    });
  }, [issues, plan.window.start, plan.window.end]);

  // Today as ISO YYYY-MM-DD — passed through so the gantt + scheduler
  // share one clock reading.
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  // Slice 8: workspace-level empty state. The Planner only schedules
  // Tasks and Bugs (Stories/Epics roll up). If the workspace has none at
  // all, the gantt would render an empty body forever — show a
  // friendlier prompt that points the user at projects to create some.
  const hasAnyLeaf = useMemo(
    () => issues.some((i) => i.type === 'T' || i.type === 'B'),
    [issues],
  );

  // Slice 9: pivot state. Hoisted above the error short-circuit below
  // so React's hook order stays stable across error/no-error renders —
  // returning early between hooks throws "Rendered fewer hooks than
  // expected" the moment the BE responds with an error.
  const [view, setView] = useState<PlannerView>('gantt');

  if (error && !loading) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={breadcrumbs} />
        <ErrorState
          code="LOAD_ISSUES"
          title="Couldn’t load issues"
          description={error}
          action={
            <button type="button" onClick={() => { void refresh(); }} className="btn btn-primary btn-sm">
              <Icon name="refresh" size={13} />Retry
            </button>
          }
        />
      </div>
    );
  }

  function handleWindowChange(field: 'start' | 'end', value: string) {
    if (!value) return;
    // Treat the new value as authoritative for that bound; the other
    // bound carries over from current plan state. The native date input
    // already enforces a sensible value, so we don't validate further;
    // a user setting end < start gets handled by the gantt + workload's
    // empty-window state.
    setWindow({ ...plan.window, [field]: value });
  }

  function handleReset() {
    if (!hasOverrides) return;
    const ok = window.confirm(
      "Reset this planner scenario? This wipes priority, disabled epics, pinned dates, leave, and overrides — but doesn't touch anything saved on the backend."
    );
    if (ok) reset();
  }

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={breadcrumbs} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-muted)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Planner</h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '4px 0 0', maxWidth: 720 }}>
            Visualise an ordered delivery plan across this workspace. Changes here stay on your machine — they don't touch other people's view.
          </p>
        </div>

        {/* Tab strip — Gantt / Workload. Inline rather than the shared
            <Tabs> atom because that atom requires `to` URLs for navigation
            and the planner pivot is local React state (no route change).
            Mirrors the visual shape of <Tabs> so it reads as the same
            primitive. */}
        <div style={{
          display: 'flex', gap: 2, borderBottom: '1px solid var(--border-muted)',
          padding: '0 16px', background: 'var(--bg)',
        }}>
          {(['gantt', 'workload'] as const).map((id) => {
            const isActive = view === id;
            const label = id === 'gantt' ? 'Gantt' : 'Workload';
            return (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                style={{
                  padding: '8px 12px', fontSize: 13, fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  background: 'transparent',
                  border: 'none',
                  borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Toolbar — From / To date inputs (Slice 9 simplification).
            Matches the height/border/padding pattern of the shared
            <Toolbar> primitive in shell.tsx; built inline so the inputs
            sit next to a label and the Reset button on the right. */}
        <div style={{
          height: 40, borderBottom: '1px solid var(--border-muted)', display: 'flex',
          alignItems: 'center', padding: '0 12px', gap: 8, background: 'var(--bg)',
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
            From
            <input
              type="date"
              value={plan.window.start}
              onChange={(e) => handleWindowChange('start', e.target.value)}
              style={{
                height: 28, padding: '0 8px',
                border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
                background: 'var(--bg)', color: 'var(--fg)', fontSize: 13,
              }}
            />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
            To
            <input
              type="date"
              value={plan.window.end}
              onChange={(e) => handleWindowChange('end', e.target.value)}
              style={{
                height: 28, padding: '0 8px',
                border: '1px solid var(--border)', borderRadius: 'var(--r-2)',
                background: 'var(--bg)', color: 'var(--fg)', fontSize: 13,
              }}
            />
          </label>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleReset}
            className="btn btn-sm"
            disabled={!hasOverrides}
            style={{
              opacity: hasOverrides ? 1 : 0.5,
              cursor: hasOverrides ? 'pointer' : 'not-allowed',
            }}
            title={hasOverrides ? 'Reset planner state to defaults' : 'Nothing to reset'}
          >
            Reset
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '20px 24px', fontSize: 13, color: 'var(--fg-muted)' }}>
              Loading issues…
            </div>
          ) : !hasAnyLeaf ? (
            // Workspace-level empty state — no Task/Bug anywhere. The
            // toolbar above still renders so the user can verify the
            // window isn't the cause; the message just makes it clear
            // the right next step is to create some issues.
            <div style={{ paddingTop: 32 }}>
              <EmptyState
                icon="tasks"
                title="No tasks to plan yet"
                description="The Planner shows Tasks and Bugs in your workspace. Create some in any project to start scheduling."
                action={(
                  <Link
                    to={`/${tenant}/${workspace}/projects`}
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon name="folder" size={13} />Open projects
                  </Link>
                )}
              />
            </div>
          ) : view === 'gantt' ? (
            <PlannerGantt
              issues={filteredIssues}
              tenant={tenant}
              workspace={workspace}
              today={todayIso}
            />
          ) : (
            <PlannerWorkload
              issues={filteredIssues}
              tenant={tenant}
              workspace={workspace}
              today={todayIso}
            />
          )}
        </div>
      </div>
    </div>
  );
}
