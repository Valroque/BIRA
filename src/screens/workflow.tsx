import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, Tabs, Toolbar, Chip, StatusDot, TypeChip, STATUSES, projectTabs, useWorkspaceContext } from '../components/shell';
import {
  WORKFLOWS, ISSUE_TYPE_NAMES, DEFAULT_PROJECT_WORKFLOWS,
  type IssueTypeLetter,
  type WorkflowNode as GraphNode,
  type WorkflowEdge as GraphEdge,
} from '../fixtures';
import { useProjects } from '../state/projects';

// --- Generic graph renderer used by editor + variants ---

interface Selection {
  type: 'node' | 'edge';
  id: string;
}

interface WorkflowGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selected?: Selection | null;
  blockedEdgeId?: string;
  width?: number;
  height?: number;
  onSelect?: (sel: Selection | null) => void;
}

export function WorkflowGraph({ nodes, edges, selected, blockedEdgeId, width = 880, height = 540, onSelect }: WorkflowGraphProps) {
  const NODE_W = 140;
  const NODE_H = 56;

  const pathFor = (e: GraphEdge): string => {
    const a = nodes.find((n) => n.id === e.from);
    const b = nodes.find((n) => n.id === e.to);
    if (!a || !b) return '';

    if (e.from === e.to) {
      const cx = a.x + NODE_W / 2;
      const cy = a.y;
      return `M ${a.x + NODE_W * 0.7} ${cy} C ${cx + 60} ${cy - 60}, ${cx - 60} ${cy - 60}, ${a.x + NODE_W * 0.3} ${cy}`;
    }

    const ax = a.x + NODE_W / 2;
    const ay = a.y + NODE_H / 2;
    const bx = b.x + NODE_W / 2;
    const by = b.y + NODE_H / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const horiz = Math.abs(dx) > Math.abs(dy);

    let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
    if (horiz) {
      sx = dx > 0 ? a.x + NODE_W : a.x;
      sy = ay;
      ex = dx > 0 ? b.x : b.x + NODE_W;
      ey = by;
      const off = Math.min(120, Math.abs(dx) * 0.6);
      c1x = sx + (dx > 0 ? off : -off); c1y = sy;
      c2x = ex - (dx > 0 ? off : -off); c2y = ey;
    } else {
      sx = ax;
      sy = dy > 0 ? a.y + NODE_H : a.y;
      ex = bx;
      ey = dy > 0 ? b.y : b.y + NODE_H;
      const off = Math.min(120, Math.abs(dy) * 0.6);
      c1x = sx; c1y = sy + (dy > 0 ? off : -off);
      c2x = ex; c2y = ey - (dy > 0 ? off : -off);
    }
    return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
  };

  return (
    <div
      onClick={() => onSelect?.(null)}
      style={{ position: 'relative', width, height, background: 'var(--bg-subtle)', overflow: 'hidden', borderRadius: 6 }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, #d0d7de 1px, transparent 1px)',
        backgroundSize: '20px 20px', opacity: 0.6,
      }} />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#59636e" />
          </marker>
          <marker id="arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f46e5" />
          </marker>
          <marker id="arrow-blocked" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
        </defs>
        {edges.map((e) => {
          const isBlocked = e.id === blockedEdgeId;
          const isSel = selected?.type === 'edge' && selected.id === e.id;
          const stroke = isBlocked ? '#ef4444' : isSel ? '#4f46e5' : '#7d8590';
          const sw = isSel || isBlocked ? 2 : 1.5;
          return (
            <g
              key={e.id}
              onClick={(ev) => { ev.stopPropagation(); onSelect?.({ type: 'edge', id: e.id }); }}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            >
              {/* Wider invisible hit target so the line is easier to click. */}
              <path d={pathFor(e)} stroke="transparent" strokeWidth={14} fill="none" />
              <path
                d={pathFor(e)}
                stroke={stroke}
                strokeWidth={sw}
                fill="none"
                markerEnd={`url(#${isBlocked ? 'arrow-blocked' : isSel ? 'arrow-accent' : 'arrow'})`}
                strokeDasharray={e.dashed ? '5 4' : undefined}
                style={{ pointerEvents: 'none' }}
              />
              {e.label && (() => {
                const a = nodes.find((n) => n.id === e.from)!;
                const b = nodes.find((n) => n.id === e.to)!;
                const mx = (a.x + b.x) / 2 + NODE_W / 2;
                const my = (a.y + b.y) / 2 + NODE_H / 2;
                return (
                  <g transform={`translate(${mx} ${my})`}>
                    <rect
                      x={-e.label.length * 3.5 - 8}
                      y={-9}
                      width={e.label.length * 7 + 16}
                      height={18}
                      rx={9}
                      fill="#fff"
                      stroke={stroke}
                      strokeWidth="1"
                    />
                    <text x={0} y={3} textAnchor="middle" fontSize="11" fontFamily="var(--font-sans)" fontWeight="500" fill={stroke}>{e.label}</text>
                  </g>
                );
              })()}
            </g>
          );
        })}
      </svg>

      {nodes.map((n) => {
        const status = STATUSES.find((s) => s.id === n.statusId);
        const isSel = selected?.type === 'node' && selected.id === n.id;
        return (
          <div
            key={n.id}
            onClick={(ev) => { ev.stopPropagation(); onSelect?.({ type: 'node', id: n.id }); }}
            style={{
              position: 'absolute', left: n.x, top: n.y, width: NODE_W, height: NODE_H,
              background: 'var(--bg)',
              border: `${isSel ? 2 : 1}px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '8px 10px', boxShadow: 'var(--shadow-sm)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
              cursor: onSelect ? 'pointer' : 'grab',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusDot status={n.statusId} size={10} />
              <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{status?.name}</span>
              {n.initial && <span data-tip="Initial state" style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.4 }}>START</span>}
              {n.terminal && <span data-tip="Terminal state" style={{ fontSize: 9, fontWeight: 700, color: 'var(--done)', letterSpacing: 0.4 }}>END</span>}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--fg-faint)', display: 'flex', gap: 8 }}>
              <span><span className="tnum">{n.count}</span> issues</span>
              {n.rules > 0 && <span style={{ color: 'var(--accent)' }}><span className="tnum">{n.rules}</span> rules</span>}
            </div>
          </div>
        );
      })}

      {/* Toolbar overlay */}
      <div style={{
        position: 'absolute', top: 12, left: 12, display: 'flex', gap: 4,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: 3, boxShadow: 'var(--shadow-sm)',
      }}>
        <button className="btn btn-ghost btn-sm" data-tip="Add state"><Icon name="plus" size={14} /></button>
        <button className="btn btn-ghost btn-sm" data-tip="Auto-layout"><Icon name="layout" size={14} /></button>
        <div style={{ width: 1, background: 'var(--border-muted)', margin: '4px 2px' }} />
        <button className="btn btn-ghost btn-sm" data-tip="Undo"><Icon name="rotate" size={14} /></button>
      </div>

      {/* Zoom */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: 3, boxShadow: 'var(--shadow-sm)',
      }}>
        <button className="btn btn-ghost btn-sm"><Icon name="plus" size={13} /></button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, fontWeight: 600 }}>100%</button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>−</button>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: '6px 10px', boxShadow: 'var(--shadow-sm)',
        display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: 'var(--fg-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#7d8590" strokeWidth="1.5" /></svg>Open
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#7d8590" strokeWidth="1.5" strokeDasharray="3 2" /></svg>Restricted
        </span>
      </div>
    </div>
  );
}

// --- The full workflow editor screen ---

export function WorkflowPage() {
  return <WorkflowEditor />;
}

export function WorkflowEditor() {
  const { workspace, project } = useWorkspaceContext();
  const { getProject, projectsUsingWorkflow } = useProjects();
  const projectInfo = getProject(project);
  const workflows = projectInfo?.workflows ?? DEFAULT_PROJECT_WORKFLOWS;

  const [type, setType] = useState<IssueTypeLetter>('T');
  // Reset selection whenever the user switches issue type — the graph just changed.
  const [selected, setSelected] = useState<Selection | null>(null);
  const onSwitchType = (next: IssueTypeLetter) => { setType(next); setSelected(null); };

  const workflowId = workflows[type];
  const workflow = WORKFLOWS[workflowId];
  const usage = projectsUsingWorkflow(workflowId);

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${workspace}/${project}` },
        'Workflow',
      ]} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Tabs active="workflow" tabs={projectTabs(workspace, project)} />

          {/* Issue-type segmented selector — drives which workflow is shown. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', background: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-muted)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Issue type
            </span>
            <div style={{
              display: 'inline-flex', padding: 2, borderRadius: 6,
              background: 'var(--bg)', border: '1px solid var(--border-muted)',
            }}>
              {(['T', 'B', 'S', 'E'] as const).map((t) => {
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSwitchType(t)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--accent-subtle)' : 'transparent',
                      color: active ? 'var(--accent-active)' : 'var(--fg-muted)',
                      fontWeight: active ? 600 : 500, fontSize: 12,
                    }}
                  >
                    <TypeChip type={t} />
                    {ISSUE_TYPE_NAMES[t]}
                  </button>
                );
              })}
            </div>
            <Chip>
              <Icon name="branch" size={11} color="var(--fg-faint)" />
              {workflow.name}
            </Chip>
            <Chip dim>
              Used by <strong style={{ color: 'var(--fg)', marginLeft: 3 }}>{usage.length}</strong>
              <span style={{ marginLeft: 3 }}>{usage.length === 1 ? 'pair' : 'pairs'}</span>
            </Chip>
          </div>

          <Toolbar
            right={
              <>
                <button className="btn btn-sm"><Icon name="history" size={13} />History</button>
                <button className="btn btn-sm"><Icon name="eye" size={13} />Preview</button>
                <button className="btn btn-primary btn-sm"><Icon name="check" size={13} />Publish</button>
              </>
            }
          >
            <span style={{ fontSize: 12, color: 'var(--fg-muted)', maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workflow.description}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--in-progress)' }} />
              <span>Unpublished changes</span>
            </span>
          </Toolbar>

          <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
            <WorkflowGraph
              key={workflow.id}
              nodes={workflow.nodes}
              edges={workflow.edges}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </div>

        <Inspector
          selected={selected}
          nodes={workflow.nodes}
          edges={workflow.edges}
          workspace={workspace}
          project={project}
        />
      </div>
    </div>
  );
}

interface InspectorProps {
  selected: Selection | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  workspace: string;
  project: string;
}
function Inspector({ selected, nodes, edges, workspace, project }: InspectorProps) {
  return (
    <div style={{
      width: 320, borderLeft: '1px solid var(--border-muted)', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {!selected && <NothingSelectedInspector nodes={nodes} edges={edges} />}
      {selected?.type === 'node' && (
        <NodeInspector node={nodes.find((n) => n.id === selected.id)!} />
      )}
      {selected?.type === 'edge' && (
        <EdgeInspector
          edge={edges.find((e) => e.id === selected.id)!}
          nodes={nodes}
          workspace={workspace}
          project={project}
        />
      )}
    </div>
  );
}

function NothingSelectedInspector({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const initial = nodes.find((n) => n.initial);
  const terminals = nodes.filter((n) => n.terminal);
  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
          textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
        }}>Workflow</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Default · Bug</div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
          Click any state or transition to edit it.
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Stat label="States" value={nodes.length} />
        <Stat label="Transitions" value={edges.length} />
        {initial && (
          <Stat
            label="Initial state"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StatusDot status={initial.statusId} size={10} />
                {STATUSES.find((s) => s.id === initial.statusId)?.name}
              </span>
            }
          />
        )}
        <Stat
          label={`Terminal states · ${terminals.length}`}
          value={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {terminals.map((t) => (
                <span key={t.id} className="pill">
                  <StatusDot status={t.statusId} size={9} />
                  {STATUSES.find((s) => s.id === t.statusId)?.name}
                </span>
              ))}
            </div>
          }
        />
      </div>
    </>
  );
}

function NodeInspector({ node }: { node: GraphNode }) {
  const status = STATUSES.find((s) => s.id === node.statusId);
  const category = node.statusId === 'in-progress' || node.statusId === 'in-review'
    ? 'in_progress'
    : node.statusId === 'done' || node.statusId === 'canceled'
      ? 'done'
      : 'todo';
  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon name="diamond" size={14} color="var(--accent)" />
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--accent)',
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>State</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
          <StatusDot status={node.statusId} size={11} />
          {status?.name}
          {node.initial && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.4, marginLeft: 4 }}>START</span>}
          {node.terminal && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--done)', letterSpacing: 0.4, marginLeft: 4 }}>END</span>}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <Field label="Display name">
          <input className="input input-sm" defaultValue={status?.name} />
        </Field>
        <Field label="Category">
          <select className="input input-sm" defaultValue={category}>
            <option value="todo">Todo (not started)</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done (terminal)</option>
          </select>
        </Field>
        <Field label="Flags">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)' }}>
            <input type="checkbox" className="cb" defaultChecked={!!node.initial} /> Initial state
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)', marginTop: 6 }}>
            <input type="checkbox" className="cb" defaultChecked={!!node.terminal} /> Terminal state
          </label>
        </Field>
        <div style={{ marginTop: 18, padding: 10, background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
          <span className="tnum" style={{ fontWeight: 600, color: 'var(--fg)' }}>{node.count}</span> issues currently in this state.
        </div>
        <button className="btn btn-danger btn-sm" style={{ marginTop: 12, width: '100%' }}>
          <Icon name="trash" size={13} />Delete state…
        </button>
      </div>
    </>
  );
}

interface EdgeInspectorProps {
  edge: GraphEdge;
  nodes: GraphNode[];
  workspace: string;
  project: string;
}
function EdgeInspector({ edge, nodes, workspace, project }: EdgeInspectorProps) {
  const from = nodes.find((n) => n.id === edge.from);
  const to = nodes.find((n) => n.id === edge.to);
  const fromStatus = STATUSES.find((s) => s.id === from?.statusId);
  const toStatus = STATUSES.find((s) => s.id === to?.statusId);

  // Demo rules — restricted (dashed) edges get the full three-rule example,
  // others get a single rule. Real rule data would live on the edge itself.
  const isFull = !!edge.dashed;

  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Icon name="arrowRight" size={14} color="var(--accent)" />
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--accent)',
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>Transition</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
          <StatusDot status={from?.statusId ?? ''} size={11} /> {fromStatus?.name}
          <Icon name="arrowRight" size={13} color="var(--fg-faint)" />
          <StatusDot status={to?.statusId ?? ''} size={11} /> {toStatus?.name}
        </div>
        {edge.label && (
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
            Trigger: <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{edge.label}</span>
          </div>
        )}
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>Rules · {isFull ? 3 : 1}</span>
          <Link
            to={`/${workspace}/${project}/workflow/rules`}
            style={{ fontSize: 11.5, color: 'var(--accent)', textDecoration: 'none' }}
          >Edit in detail →</Link>
        </div>

        {/*
          Drift fix: rule cards rewritten to use the agreed five rule types
          (role, assignee_only, reporter_only, required_fields, not_self).
          Original used invented types (approver / external check / custom script).
        */}
        {isFull && (
          <>
            <RuleCard ruleType="role" title="Only admins" subtitle="role: admin" />
            <RuleCard ruleType="required_fields" title="Required fields" subtitle="release_notes, assignee" />
            <RuleCard ruleType="not_self" title="Reviewer ≠ reporter" subtitle="acting user is not the reporter" />
          </>
        )}
        {!isFull && (
          <RuleCard ruleType="assignee_only" title="Assignee only" subtitle="only the assignee may transition" />
        )}

        <Link
          to={`/${workspace}/${project}/workflow/rules`}
          style={{
            marginTop: 8, width: '100%', height: 32,
            border: '1.5px dashed var(--border)', borderRadius: 6, background: 'transparent',
            color: 'var(--fg-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            textDecoration: 'none',
          }}
        >
          <Icon name="plus" size={13} />Add rule
        </Link>

        {/* Drift fix: dropped "Visible to" select and "Auto-transition" toggle (out of v1 scope). */}
        <div style={{
          marginTop: 18, fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
          textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
        }}>Properties</div>
        <Field label="Trigger label">
          <input className="input input-sm" defaultValue={edge.label ?? ''} placeholder="e.g. approve" />
        </Field>
        <Field label="Description (internal)">
          <textarea
            className="input input-sm"
            rows={3}
            defaultValue={isFull ? 'Used when an admin signs off on the review.' : ''}
            placeholder="Optional note shown in the audit trail."
            style={{ height: 'auto', padding: '6px 10px', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
          />
        </Field>

        <button className="btn btn-danger btn-sm" style={{ marginTop: 12, width: '100%' }}>
          <Icon name="trash" size={13} />Delete transition
        </button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--fg)' }}>{value}</div>
    </div>
  );
}

// --- Variants (only used inside /design-canvas) ---

export function WorkflowVariantBranching() {
  const nodes: GraphNode[] = [
    { id: 'n1', statusId: 'backlog', x: 30, y: 250, count: 47, rules: 0, initial: true },
    { id: 'n2', statusId: 'todo', x: 220, y: 130, count: 18, rules: 1 },
    { id: 'n2b', statusId: 'todo', x: 220, y: 370, count: 5, rules: 0 },
    { id: 'n3', statusId: 'in-progress', x: 410, y: 250, count: 12, rules: 2 },
    { id: 'n4', statusId: 'in-review', x: 600, y: 250, count: 6, rules: 3 },
    { id: 'n5', statusId: 'done', x: 780, y: 250, count: 312, rules: 1, terminal: true },
  ];
  const edges: GraphEdge[] = [
    { id: 'e1', from: 'n1', to: 'n2', label: 'plan' },
    { id: 'e2', from: 'n1', to: 'n2b', label: 'fast-track' },
    { id: 'e3', from: 'n2', to: 'n3' },
    { id: 'e4', from: 'n2b', to: 'n3' },
    { id: 'e5', from: 'n3', to: 'n4' },
    { id: 'e6', from: 'n4', to: 'n5', dashed: true, label: 'approve' },
    { id: 'e7', from: 'n4', to: 'n3' },
  ];
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        { label: 'Atlas', to: '/acme/atlas' },
        'Workflow',
      ]} />
      <Tabs
        active="workflow"
        tabs={[
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'issues', label: 'Issues', icon: 'list', count: 142 },
          { id: 'workflow', label: 'Workflow', icon: 'workflow' },
        ]}
      />
      <Toolbar right={<button className="btn btn-primary btn-sm">Publish</button>}>
        <Chip><Icon name="branch" size={11} color="var(--fg-faint)" />Atlas workflow</Chip>
        <Chip dim>2 paths · 7 transitions</Chip>
      </Toolbar>
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        <WorkflowGraph nodes={nodes} edges={edges} width={920} height={520} />
      </div>
    </div>
  );
}

export function WorkflowVariantKanban() {
  const nodes: GraphNode[] = [
    { id: 'n1', statusId: 'todo', x: 60, y: 220, count: 18, rules: 0, initial: true },
    { id: 'n2', statusId: 'in-progress', x: 280, y: 220, count: 7, rules: 1 },
    { id: 'n3', statusId: 'in-review', x: 500, y: 220, count: 4, rules: 2 },
    { id: 'n4', statusId: 'done', x: 720, y: 220, count: 89, rules: 0, terminal: true },
  ];
  const edges: GraphEdge[] = [
    { id: 'e1', from: 'n1', to: 'n2' },
    { id: 'e2', from: 'n2', to: 'n3' },
    { id: 'e3', from: 'n3', to: 'n4' },
    { id: 'e4', from: 'n2', to: 'n1' },
    { id: 'e5', from: 'n3', to: 'n2' },
  ];
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        { label: 'Orbit', to: '/acme/orbit' },
        'Workflow',
      ]} />
      <Tabs
        active="workflow"
        tabs={[
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'issues', label: 'Issues', icon: 'list', count: 38 },
          { id: 'workflow', label: 'Workflow', icon: 'workflow' },
        ]}
      />
      <Toolbar><Chip><Icon name="branch" size={11} color="var(--fg-faint)" />Linear flow</Chip></Toolbar>
      <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
        <WorkflowGraph nodes={nodes} edges={edges} width={920} height={520} />
      </div>
    </div>
  );
}

// --- Empty state (used in design canvas) ---

export function EmptyState() {
  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: '/acme/projects' },
        { label: 'Comet', to: '/acme/comet' },
        'Workflow',
      ]} />
      <Tabs
        active="workflow"
        tabs={[
          { id: 'board', label: 'Board', icon: 'board' },
          { id: 'issues', label: 'Issues', icon: 'list' },
          { id: 'workflow', label: 'Workflow', icon: 'workflow' },
        ]}
      />
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, background: 'var(--bg-subtle)',
      }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <svg width="200" height="100" viewBox="0 0 200 100" style={{ marginBottom: 18 }}>
            <rect x="10" y="35" width="44" height="30" rx="6" fill="#fff" stroke="#d0d7de" strokeDasharray="3 3" />
            <rect x="78" y="35" width="44" height="30" rx="6" fill="#fff" stroke="#d0d7de" strokeDasharray="3 3" />
            <rect x="146" y="35" width="44" height="30" rx="6" fill="#fff" stroke="#d0d7de" strokeDasharray="3 3" />
            <path d="M54 50 L78 50" stroke="#afb8c1" strokeWidth="1.5" markerEnd="url(#arrhead)" />
            <path d="M122 50 L146 50" stroke="#afb8c1" strokeWidth="1.5" markerEnd="url(#arrhead)" />
            <defs>
              <marker id="arrhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#afb8c1" />
              </marker>
            </defs>
          </svg>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--fg)' }}>Design your workflow</h2>
          <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.55, margin: '8px 0 18px' }}>
            States, transitions, and the rules that gate them. Start from a template or build from scratch — you can
            always change it later.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-sm"><Icon name="plus" size={13} />Start blank</button>
            <button className="btn btn-sm"><Icon name="copy" size={13} />Use a template</button>
          </div>
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px dashed var(--border)', textAlign: 'left' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
              textTransform: 'uppercase', letterSpacing: 0.5,
              marginBottom: 8, textAlign: 'center',
            }}>Templates</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <TplCard name="Standard" desc="Backlog → Todo → In Progress → Done" />
              <TplCard name="With review" desc="…+ In Review with required-fields rule" recommended />
              <TplCard name="Kanban" desc="Linear, no terminal branching" />
              <TplCard name="Bug triage" desc="Triage → Confirmed → Fixed → Verified" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Inspector helper components ---

type RuleType = 'role' | 'assignee_only' | 'reporter_only' | 'required_fields' | 'not_self';

const RULE_ICON: Record<RuleType, string> = {
  role: 'shield',
  assignee_only: 'user',
  reporter_only: 'user',
  required_fields: 'asterisk',
  not_self: 'users',
};

interface RuleCardProps {
  ruleType: RuleType;
  title: string;
  subtitle: string;
}
function RuleCard({ ruleType, title, subtitle }: RuleCardProps) {
  return (
    <div className="card" style={{
      padding: 10, marginBottom: 6,
      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'var(--accent-subtle)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={RULE_ICON[ruleType]} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>{subtitle}</div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ width: 24, padding: 0 }}>
        <Icon name="moreV" size={13} color="var(--fg-faint)" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function TplCard({ name, desc, recommended }: { name: string; desc: string; recommended?: boolean }) {
  return (
    <button className="card" style={{ padding: 10, textAlign: 'left', cursor: 'pointer', position: 'relative' }}>
      {recommended && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: 9.5, fontWeight: 700, padding: '1px 5px',
          background: 'var(--accent-muted)', color: 'var(--accent-active)',
          borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.4,
        }}>Rec.</span>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>{desc}</div>
    </button>
  );
}
