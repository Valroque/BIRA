// ⌘K / Ctrl+K command palette. Mounted at AppShell so it's available on every
// in-workspace route. Items are static for the prototype — wiring real search
// against fixtures would be a separate pass.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './icons';
import { KBD, useWorkspaceContext } from './shell';
import { ISSUES } from '../fixtures';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  to: string;
  group: 'Navigate' | 'Issues' | 'Create';
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { workspace, project } = useWorkspaceContext();
  const inputRef = useRef<HTMLInputElement>(null);

  // Open with ⌘K / Ctrl+K, or by dispatching the `bira:cmdk` custom event
  // (the TopBar search button uses that). Close with Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    const onCmdk = () => setOpen((o) => !o);
    window.addEventListener('keydown', onKey);
    window.addEventListener('bira:cmdk', onCmdk);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('bira:cmdk', onCmdk);
    };
  }, [open]);

  // Reset state when opened.
  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      // Defer focus so the input exists.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const all: Command[] = useMemo(() => [
    { id: 'go-inbox',    group: 'Navigate', label: 'Inbox',              icon: 'inbox',    to: `/${workspace}/inbox` },
    { id: 'go-mine',     group: 'Navigate', label: 'My issues',          icon: 'user',     to: `/${workspace}/my-issues` },
    { id: 'go-all',      group: 'Navigate', label: 'All issues',         icon: 'list',     to: `/${workspace}/all-issues` },
    { id: 'go-projects', group: 'Navigate', label: 'All projects',       icon: 'grid',     to: `/${workspace}/projects` },
    { id: 'go-overview', group: 'Navigate', label: 'Project overview',  icon: 'eye',      to: `/${workspace}/${project}` },
    { id: 'go-board',    group: 'Navigate', label: 'Board',              icon: 'board',    to: `/${workspace}/${project}/board` },
    { id: 'go-list',     group: 'Navigate', label: 'Issues (list)',      icon: 'list',     to: `/${workspace}/${project}/list` },
    { id: 'go-workflow', group: 'Navigate', label: 'Workflow editor',    icon: 'workflow', to: `/${workspace}/${project}/workflow` },
    { id: 'go-rules',    group: 'Navigate', label: 'Transition rules',   icon: 'shield',   to: `/${workspace}/${project}/workflow/rules` },
    { id: 'new-issue',   group: 'Create',   label: 'New issue',          icon: 'plus',     to: `/${workspace}/${project}/issue/new`, hint: 'C' },
    ...ISSUES.map((i): Command => ({
      id: `issue-${i.id}`, group: 'Issues',
      label: `${i.id} · ${i.title}`,
      icon: i.type === 'B' ? 'bug' : i.type === 'E' ? 'layers' : 'tasks',
      to: `/${workspace}/${project}/issue/${i.id}`,
    })),
  ], [workspace, project]);

  const filtered = useMemo(() => {
    if (!q.trim()) return all.slice(0, 12);
    const needle = q.toLowerCase();
    return all.filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 12);
  }, [all, q]);

  // Group filtered for display.
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const c of filtered) (groups[c.group] ||= []).push(c);
    return groups;
  }, [filtered]);

  // Flat list reflects display order so arrow keys + Enter work consistently.
  const flat = useMemo(
    () => Object.entries(grouped).flatMap(([, cs]) => cs),
    [grouped]
  );

  useEffect(() => { setCursor(0); }, [q]);

  const choose = (c: Command) => {
    setOpen(false);
    navigate(c.to);
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,42,.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 600, background: 'var(--bg)',
          borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderBottom: '1px solid var(--border-muted)',
        }}>
          <Icon name="search" size={15} color="var(--fg-muted)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                const c = flat[cursor];
                if (c) choose(c);
              }
            }}
            placeholder="Search issues, jump to a screen…"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              background: 'transparent', color: 'var(--fg)', fontFamily: 'var(--font-sans)',
            }}
          />
          <KBD k="esc" />
        </div>
        <div className="scroll" style={{ maxHeight: 360, overflow: 'auto', padding: 6 }}>
          {flat.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: 13 }}>
              No matches.
            </div>
          )}
          {Object.entries(grouped).map(([group, cs]) => {
            // Compute the absolute index of each item in the flat list to drive cursor highlighting.
            const startIdx = flat.indexOf(cs[0]);
            return (
              <div key={group} style={{ marginBottom: 6 }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  padding: '6px 10px',
                }}>{group}</div>
                {cs.map((c, i) => {
                  const isActive = startIdx + i === cursor;
                  return (
                    <button
                      key={c.id}
                      onClick={() => choose(c)}
                      onMouseEnter={() => setCursor(startIdx + i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: isActive ? 'var(--accent-subtle)' : 'transparent',
                        color: isActive ? 'var(--accent-active)' : 'var(--fg)',
                        fontSize: 13,
                      }}
                    >
                      <Icon name={c.icon} size={14} color={isActive ? 'var(--accent)' : 'var(--fg-muted)'} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </span>
                      {c.hint && <KBD k={c.hint} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border-muted)',
          background: 'var(--bg-subtle)', display: 'flex', gap: 14,
          fontSize: 11, color: 'var(--fg-muted)',
        }}>
          <span><KBD k="↑" /> <KBD k="↓" /> navigate</span>
          <span><KBD k="↵" /> select</span>
          <span><KBD k="esc" /> close</span>
        </div>
      </div>
    </div>
  );
}
