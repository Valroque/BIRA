import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * Canvas width / height. Numbers render the canvas at a fixed pixel size
   * (used by the design-canvas variants). When omitted, the canvas fills its
   * parent at 100%/100% so the dotted background reaches the viewport edges
   * and clicks land on nodes positioned anywhere within the available area.
   */
  width?: number | string;
  height?: number | string;
  onSelect?: (sel: Selection | null) => void;
  /** Mutate a node's position (drag) or any other field. */
  onUpdateNode?: (id: string, patch: Partial<GraphNode>) => void;
  /** Append a new state. The caller is responsible for picking a sensible
   *  starting position + status. */
  onAddState?: () => void;
  /** Append a new transition (edge). Called when the user drags the "+"
   *  handle off one node and releases over another. */
  onAddEdge?: (fromId: string, toId: string) => void;
}

const DRAG_THRESHOLD_PX = 4;  // movement under this is treated as a click

// Zoom bounds + step. Half-size lets users see the whole graph on a small
// laptop; 2× lets them get close enough for label legibility on big graphs.
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

export function WorkflowGraph({
  nodes, edges, selected, blockedEdgeId, width, height,
  onSelect, onUpdateNode, onAddState, onAddEdge,
}: WorkflowGraphProps) {
  const NODE_W = 140;
  const NODE_H = 56;
  const w = width ?? '100%';
  const h = height ?? '100%';

  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomReset = () => setZoom(1);

  // Edge-drawing state. While the user drags the "+" handle off a node, we
  // track the source id + the live cursor position (in unscaled content
  // coordinates) so we can draw a dashed preview line. On mouseup we test
  // whether the cursor landed inside another node and if so, create the edge.
  const [drawing, setDrawing] = useState<{
    fromId: string;
    cursorX: number;
    cursorY: number;
  } | null>(null);
  // Ref to the unscaled inner container — used to translate clientX/Y into
  // content coordinates (clientX − rect.left) / zoom.
  const contentRef = useRef<HTMLDivElement>(null);

  const startEdgeDraw = (fromId: string, e: React.MouseEvent) => {
    if (!onAddEdge) return;
    e.stopPropagation();
    e.preventDefault();
    const fromNode = nodes.find((n) => n.id === fromId);
    if (!fromNode) return;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const toContentCoords = (clientX: number, clientY: number) => ({
      cx: (clientX - rect.left) / zoom,
      cy: (clientY - rect.top) / zoom,
    });
    setDrawing({
      fromId,
      cursorX: fromNode.x + NODE_W,
      cursorY: fromNode.y + NODE_H / 2,
    });

    const onMove = (ev: MouseEvent) => {
      const { cx, cy } = toContentCoords(ev.clientX, ev.clientY);
      setDrawing((prev) => (prev ? { ...prev, cursorX: cx, cursorY: cy } : prev));
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      // Hit-test the cursor against every node's bounding box (in content coords).
      const { cx, cy } = toContentCoords(ev.clientX, ev.clientY);
      const target = nodes.find(
        (n) => cx >= n.x && cx <= n.x + NODE_W && cy >= n.y && cy <= n.y + NODE_H,
      );
      if (target && target.id !== fromId) {
        onAddEdge(fromId, target.id);
      }
      setDrawing(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
  };

  // Track the size of the bounding box so the SVG and dot pattern can extend
  // to cover nodes positioned far from the origin (drag/create can take a
  // node well to the right or below the initial viewport).
  const contentW = Math.max(...nodes.map((n) => n.x + NODE_W + 40), 900);
  const contentH = Math.max(...nodes.map((n) => n.y + NODE_H + 40), 540);
  // Scaled bounding box — the scroll layer needs to know the scaled size so
  // scrollbars expose the right amount of scrollable area at every zoom level.
  const scaledW = contentW * zoom;
  const scaledH = contentH * zoom;

  // mousedown → select (on click) OR drag (on movement past threshold).
  // Movement deltas are in screen pixels but the node coordinates live in
  // unscaled content pixels, so divide by `zoom` before applying.
  const onNodePointerDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = node.x;
    const origY = node.y;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      moved = true;
      onUpdateNode?.(id, {
        x: Math.max(0, origX + dx / zoom),
        y: Math.max(0, origY + dy / zoom),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (!moved) onSelect?.({ type: 'node', id });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    if (onUpdateNode) document.body.style.cursor = 'grabbing';
  };

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
      style={{
        position: 'relative', width: w, height: h,
        minHeight: 540,  // keep the toolbar/legend chrome legible even on short viewports
        // overflow: visible on the outer frame so the chrome layer's tooltips
        // (CSS pseudo-elements off the toolbar buttons) can extend without
        // being clipped by the scroll layer.
        overflow: 'visible', borderRadius: 6,
      }}
    >
      {/* Scrolling content layer — dot pattern, edges, nodes. */}
      <div
        onClick={() => onSelect?.(null)}
        className="scroll"
        style={{
          position: 'absolute', inset: 0, overflow: 'auto',
          background: 'var(--bg-subtle)', borderRadius: 6,
        }}
      >
        {/* Outer wrapper sized to the SCALED bounding box, so the scroll layer
            exposes the right amount of scrollable area at every zoom level. */}
        <div style={{ position: 'relative', width: scaledW, height: scaledH }}>
        {/* Inner is sized in unscaled coordinates and gets a CSS transform —
            nodes/edges keep using their native pixel coordinates regardless. */}
        <div
          ref={contentRef}
          style={{
            position: 'absolute', top: 0, left: 0, width: contentW, height: contentH,
            transform: `scale(${zoom})`, transformOrigin: 'top left',
          }}
        >
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, #d0d7de 1px, transparent 1px)',
        backgroundSize: '20px 20px', opacity: 0.6,
      }} />
      <svg width={contentW} height={contentH} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
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
        {drawing && (() => {
          // Draw a dashed straight line from the source node's right edge to
          // the cursor. Straight is intentional — the bezier from `pathFor`
          // assumes both endpoints are nodes; following the cursor smoothly is
          // more important than aesthetic curvature here.
          const src = nodes.find((n) => n.id === drawing.fromId);
          if (!src) return null;
          const sx = src.x + NODE_W;
          const sy = src.y + NODE_H / 2;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line
                x1={sx} y1={sy}
                x2={drawing.cursorX} y2={drawing.cursorY}
                stroke="var(--accent)" strokeWidth={1.8}
                strokeDasharray="5 4"
                markerEnd="url(#arrow-accent)"
              />
            </g>
          );
        })()}
      </svg>

      {nodes.map((n) => {
        const status = STATUSES.find((s) => s.id === n.statusId);
        const isSel = selected?.type === 'node' && selected.id === n.id;
        const draggable = !!onUpdateNode;
        const canDrawEdge = !!onAddEdge;
        return (
          <div
            key={n.id}
            onMouseDown={(ev) => onNodePointerDown(n.id, ev)}
            style={{
              position: 'absolute', left: n.x, top: n.y, width: NODE_W, height: NODE_H,
              background: 'var(--bg)',
              border: `${isSel ? 2 : 1}px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '8px 10px', boxShadow: 'var(--shadow-sm)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
              cursor: draggable ? 'grab' : (onSelect ? 'pointer' : 'default'),
              userSelect: 'none',
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
            {/* Right-edge transition handle. Drag onto another node to draw a
                new edge. Visible on selection or hover; positioned slightly
                outside the node's right edge so it's hit-testable without
                catching node-drag mousedowns. */}
            {canDrawEdge && (
              <button
                type="button"
                onMouseDown={(ev) => startEdgeDraw(n.id, ev)}
                onClick={(ev) => ev.stopPropagation()}
                data-tip="Drag to another state to add a transition"
                style={{
                  position: 'absolute',
                  right: -10, top: '50%', transform: 'translateY(-50%)',
                  width: 18, height: 18, borderRadius: 9,
                  background: 'var(--bg)', border: '1px solid var(--accent)',
                  color: 'var(--accent)', cursor: 'crosshair',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                  // Always visible while a node is selected; otherwise show on
                  // hover to keep the canvas tidy. CSS-pseudo hover wouldn't
                  // bubble through the node, so use opacity transitions on
                  // the node's own hover via a child-of-hover trick.
                  opacity: isSel ? 1 : 0.55,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Icon name="plus" size={11} />
              </button>
            )}
          </div>
        );
      })}
        </div>
        </div>
      </div>

      {/* Chrome — rendered OUTSIDE the scroll layer so CSS-pseudo tooltips
          (`[data-tip]:hover::after`) aren't clipped by the scroll container. */}
      {/* Toolbar overlay */}
      <div style={{
        position: 'absolute', top: 12, left: 12, display: 'flex', gap: 4,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: 3, boxShadow: 'var(--shadow-sm)', zIndex: 2,
      }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-tip="Add state"
          onClick={onAddState}
          disabled={!onAddState}
        >
          <Icon name="plus" size={14} />
        </button>
        <button className="btn btn-ghost btn-sm" data-tip="Auto-layout"><Icon name="layout" size={14} /></button>
        <div style={{ width: 1, background: 'var(--border-muted)', margin: '4px 2px' }} />
        <button className="btn btn-ghost btn-sm" data-tip="Undo"><Icon name="rotate" size={14} /></button>
      </div>

      {/* Zoom */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 4,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: 3, boxShadow: 'var(--shadow-sm)', zIndex: 2,
      }}>
        <button
          type="button" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}
          className="btn btn-ghost btn-sm" data-tip="Zoom in"
        >
          <Icon name="plus" size={13} />
        </button>
        <button
          type="button" onClick={zoomReset}
          className="btn btn-ghost btn-sm"
          data-tip="Reset zoom"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}
          className="btn btn-ghost btn-sm" data-tip="Zoom out"
          style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}
        >
          −
        </button>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'var(--bg)', border: '1px solid var(--border-muted)', borderRadius: 6,
        padding: '6px 10px', boxShadow: 'var(--shadow-sm)', zIndex: 2,
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
  const baseWorkflow = WORKFLOWS[workflowId];
  const usage = projectsUsingWorkflow(workflowId);

  // Session-local working copy of the current workflow. Edits in the
  // inspector mutate this copy so the graph reflects them immediately —
  // no persistence beyond the session, matching the rest of the prototype.
  const [nodes, setNodes] = useState<GraphNode[]>(baseWorkflow.nodes);
  const [edges, setEdges] = useState<GraphEdge[]>(baseWorkflow.edges);
  // Reset whenever the source workflow changes (issue type switch, project
  // switch). Re-running this on baseWorkflow identity is the right trigger
  // because WORKFLOWS[id] is stable per id.
  useEffect(() => {
    setNodes(baseWorkflow.nodes);
    setEdges(baseWorkflow.edges);
  }, [baseWorkflow]);

  const updateNode = (id: string, patch: Partial<GraphNode>) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const updateEdge = (id: string, patch: Partial<GraphEdge>) =>
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  // Append a new state at a sensible spot — start near the top-left so the
  // user always sees it appear in-viewport, then they can drag from there.
  const addState = () => {
    // Pick the first status that isn't already on the canvas; fall back to 'todo'.
    const used = new Set(nodes.map((n) => n.statusId));
    const free = STATUSES.find((s) => !used.has(s.id))?.id ?? 'todo';
    const id = `n${Date.now().toString(36)}`;
    const next: GraphNode = {
      id, statusId: free, x: 60, y: 60, count: 0, rules: 0,
    };
    setNodes((prev) => [...prev, next]);
    setSelected({ type: 'node', id });
  };

  // Delete a node + every edge that touches it, so the graph stays consistent.
  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
    setSelected(null);
  };

  const deleteEdge = (id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
    setSelected(null);
  };

  const addEdge = (fromId: string, toId: string) => {
    // Reject duplicates of the same direction so the graph stays clean.
    if (edges.some((e) => e.from === fromId && e.to === toId)) return;
    const id = `e${Date.now().toString(36)}`;
    setEdges((prev) => [...prev, { id, from: fromId, to: toId }]);
    setSelected({ type: 'edge', id });
  };

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
            <span className="label-section">Issue type</span>
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
              {baseWorkflow.name}
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
              {baseWorkflow.description}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--in-progress)' }} />
              <span>Unpublished changes</span>
            </span>
          </Toolbar>

          <div style={{ flex: 1, padding: 16, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
            <WorkflowGraph
              key={baseWorkflow.id}
              nodes={nodes}
              edges={edges}
              selected={selected}
              onSelect={setSelected}
              onUpdateNode={updateNode}
              onAddState={addState}
              onAddEdge={addEdge}
            />
          </div>
        </div>

        <Inspector
          selected={selected}
          nodes={nodes}
          edges={edges}
          workspace={workspace}
          project={project}
          workflowName={baseWorkflow.name}
          issueTypeName={ISSUE_TYPE_NAMES[type]}
          onUpdateNode={updateNode}
          onUpdateEdge={updateEdge}
          onDeleteNode={deleteNode}
          onDeleteEdge={deleteEdge}
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
  workflowName: string;
  issueTypeName: string;
  onUpdateNode: (id: string, patch: Partial<GraphNode>) => void;
  onUpdateEdge: (id: string, patch: Partial<GraphEdge>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
}
function Inspector({
  selected, nodes, edges, workspace, project,
  workflowName, issueTypeName,
  onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
}: InspectorProps) {
  return (
    <div style={{
      width: 320, borderLeft: '1px solid var(--border-muted)', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {!selected && (
        <NothingSelectedInspector
          nodes={nodes} edges={edges}
          workflowName={workflowName} issueTypeName={issueTypeName}
        />
      )}
      {selected?.type === 'node' && (
        <NodeInspector
          node={nodes.find((n) => n.id === selected.id)!}
          onChange={(patch) => onUpdateNode(selected.id, patch)}
          onDelete={() => onDeleteNode(selected.id)}
        />
      )}
      {selected?.type === 'edge' && (
        <EdgeInspector
          edge={edges.find((e) => e.id === selected.id)!}
          nodes={nodes}
          workspace={workspace}
          project={project}
          onChange={(patch) => onUpdateEdge(selected.id, patch)}
          onDelete={() => onDeleteEdge(selected.id)}
        />
      )}
    </div>
  );
}

function NothingSelectedInspector({
  nodes, edges, workflowName, issueTypeName,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  workflowName: string;
  issueTypeName: string;
}) {
  const initial = nodes.find((n) => n.initial);
  const terminals = nodes.filter((n) => n.terminal);
  return (
    <>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-muted)' }}>
        <div className="label-section" style={{ marginBottom: 4 }}>Workflow</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{workflowName} · {issueTypeName}</div>
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

function NodeInspector({
  node, onChange, onDelete,
}: {
  node: GraphNode;
  onChange: (patch: Partial<GraphNode>) => void;
  onDelete: () => void;
}) {
  const status = STATUSES.find((s) => s.id === node.statusId);
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
        <Field label="Status">
          <select
            className="input input-sm"
            value={node.statusId}
            onChange={(e) => onChange({ statusId: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Flags">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)' }}>
            <input
              type="checkbox" className="cb"
              checked={!!node.initial}
              onChange={(e) => onChange({ initial: e.target.checked })}
            /> Initial state
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)', marginTop: 6 }}>
            <input
              type="checkbox" className="cb"
              checked={!!node.terminal}
              onChange={(e) => onChange({ terminal: e.target.checked })}
            /> Terminal state
          </label>
        </Field>
        <div style={{ marginTop: 18, padding: 10, background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--fg-muted)' }}>
          <span className="tnum" style={{ fontWeight: 600, color: 'var(--fg)' }}>{node.count}</span> issues currently in this state.
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="btn btn-danger btn-sm"
          style={{ marginTop: 12, width: '100%' }}
        >
          <Icon name="trash" size={13} />Delete state
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
  onChange: (patch: Partial<GraphEdge>) => void;
  onDelete: () => void;
}
function EdgeInspector({ edge, nodes, workspace, project, onChange, onDelete }: EdgeInspectorProps) {
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
          <span className="label-section">Rules · {isFull ? 3 : 1}</span>
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
        <div className="label-section" style={{ marginTop: 18, marginBottom: 8 }}>Properties</div>
        <Field label="Trigger label">
          <input
            className="input input-sm"
            value={edge.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
            placeholder="e.g. approve"
          />
        </Field>
        <Field label="Restricted (dashed)">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg)' }}>
            <input
              type="checkbox" className="cb"
              checked={!!edge.dashed}
              onChange={(e) => onChange({ dashed: e.target.checked })}
            /> Render as a restricted (dashed) transition
          </label>
        </Field>

        <button
          type="button"
          onClick={onDelete}
          className="btn btn-danger btn-sm"
          style={{ marginTop: 12, width: '100%' }}
        >
          <Icon name="trash" size={13} />Delete transition
        </button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="label-section" style={{ marginBottom: 4 }}>{label}</div>
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
            <div className="label-section" style={{ marginBottom: 8, textAlign: 'center' }}>Templates</div>
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
