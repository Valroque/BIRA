// Static reference page that lays out every BIRA screen side-by-side as
// labeled artboards — useful for visual regression, design QA, and demos.
// Simplified port of the original Figma-like canvas: dropped drag-drop,
// fullscreen focus overlay, and the omelette persistence sidecar.

import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { ProjectOverviewPage } from './project-overview';
import { LoginPage } from './login';
import { BoardView, BoardBulkExpanded } from './board';
import { ListView } from './list';
import { IssueDetail } from './issue-detail';
import {
  WorkflowEditor,
  WorkflowVariantBranching,
  WorkflowVariantKanban,
  EmptyState,
} from './workflow';
import { CreateIssue } from './create-issue';

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

const W = 1200;
const H = 760;
const W_SM = 720;
const H_SM = 600;

export function DesignCanvasPage() {
  return (
    <div style={{
      minHeight: '100vh', background: DC.bg, color: DC.title, fontFamily: DC.font,
      backgroundImage:
        `linear-gradient(${DC.grid} 1px, transparent 1px),` +
        `linear-gradient(90deg, ${DC.grid} 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      padding: '48px 56px',
    }}>
      <Section
        id="brand"
        title="BIRA"
        subtitle="Self-hostable issue tracker · GitHub-light, indigo accent, Geist"
      >
        <Artboard label="01 · Workspace selection" width={W_SM} height={H_SM}>
          <LoginPage />
        </Artboard>
        <Artboard label="02 · Project overview" width={W} height={H}>
          <AppShell sidebarActive="comet"><ProjectOverviewPage /></AppShell>
        </Artboard>
      </Section>

      <Section
        id="workflow"
        title="Workflow editor"
        subtitle="Canvas graph · the central UX challenge. Cycles modeled with curved bezier edges; rules surface in right inspector."
      >
        <Artboard label="01 · Workflow editor — transition selected" width={W} height={H}>
          <AppShell sidebarActive="comet-workflow"><WorkflowEditor /></AppShell>
        </Artboard>
        <Artboard label="02 · Branching workflow (2 paths)" width={W} height={H}>
          <AppShell sidebarActive="comet-workflow"><WorkflowVariantBranching /></AppShell>
        </Artboard>
        <Artboard label="03 · Minimal kanban flow" width={W} height={H}>
          <AppShell sidebarActive="comet-workflow"><WorkflowVariantKanban /></AppShell>
        </Artboard>
        <Artboard label="04 · Empty state with templates" width={W} height={H}>
          <AppShell sidebarActive="comet-workflow"><EmptyState /></AppShell>
        </Artboard>
      </Section>

      <Section
        id="issue"
        title="Issue detail"
        subtitle="Blocked transitions surface inline as a banner with per-rule pass/fail diagnostics — the user sees exactly what to unblock."
      >
        <Artboard label="01 · Issue with blocked Done transition" width={W} height={H}>
          <AppShell sidebarActive="comet-list"><IssueDetail /></AppShell>
        </Artboard>
        <Artboard label="02 · Create issue (modal · type picker)" width={W} height={H}>
          <AppShell sidebarActive="all-issues"><CreateIssue /></AppShell>
        </Artboard>
      </Section>

      <Section
        id="board"
        title="Board · bulk operations"
        subtitle="Deep-dive: 5 selected → bottom-anchored action bar with all bulk actions; second variant shows the Status menu open with rule-aware diagnostics."
      >
        <Artboard label="01 · Bulk bar with 5 selected" width={W} height={H}>
          <AppShell sidebarActive="comet-board"><BoardView selectedCount={5} /></AppShell>
        </Artboard>
        <Artboard label="02 · Status menu open · 4 of 7 will be blocked" width={W} height={H}>
          <AppShell sidebarActive="comet-board"><BoardBulkExpanded /></AppShell>
        </Artboard>
        <Artboard label="03 · List view · grouped by status, multi-select" width={W} height={H}>
          <AppShell sidebarActive="comet-list"><ListView /></AppShell>
        </Artboard>
        <Artboard label="04 · Collapsed sidebar (tweak)" width={W} height={H}>
          <AppShell sidebarCollapsed sidebarActive="comet-board"><BoardView selectedCount={5} /></AppShell>
        </Artboard>
      </Section>
    </div>
  );
}

function Section({ id, title, subtitle, children }: {
  id: string; title: string; subtitle?: string; children: ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{
          fontSize: 28, fontWeight: 600, color: DC.title,
          letterSpacing: -0.4, margin: 0,
        }}>{title}</h2>
        {subtitle && (
          <p style={{ margin: '6px 0 0', color: DC.subtitle, fontSize: 14, maxWidth: 760 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {children}
      </div>
    </section>
  );
}

function Artboard({ label, width, height, children }: {
  label: string; width: number; height: number; children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: DC.label, fontWeight: 500, letterSpacing: 0.2 }}>
        {label}
      </div>
      <div style={{
        width, height, background: '#fff',
        borderRadius: 6, overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)',
      }}>
        {children}
      </div>
    </div>
  );
}
