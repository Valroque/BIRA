import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TypeChip, StatusDot, Priority, Avatar, KBD, useWorkspaceContext } from '../components/shell';

const TYPES = [
  { t: 'T', name: 'Task', color: 'var(--type-task)', bg: 'var(--type-task-bg)' },
  { t: 'B', name: 'Bug', color: 'var(--type-bug)', bg: 'var(--type-bug-bg)' },
  { t: 'S', name: 'Story', color: 'var(--type-story)', bg: 'var(--type-story-bg)' },
  { t: 'E', name: 'Epic', color: 'var(--type-epic)', bg: 'var(--type-epic-bg)' },
] as const;

type TypeChar = typeof TYPES[number]['t'];

export function CreateIssuePage() {
  const navigate = useNavigate();
  const { workspace, project } = useWorkspaceContext();
  const close = () => navigate(-1);
  const [type, setType] = useState<TypeChar>('B');

  // Submit lands on a real issue's detail page (the closest thing the prototype
  // can do without persistence).
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    navigate(`/${workspace}/${project}/issue/CMT-241`, { replace: true });
  };

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="bira" style={{
      height: '100%', background: 'rgba(15,23,42,.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, background: 'var(--bg)', borderRadius: 12,
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="folder" size={14} color="var(--fg-muted)" />
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Comet</span>
          <Icon name="chevronRight" size={12} color="var(--fg-faint)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>New issue</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={close}
            className="btn btn-ghost btn-sm"
            style={{ width: 24, padding: 0 }}
            data-tip="Close"
          >
            <Icon name="x" size={13} />
          </button>
          <KBD k="esc" />
        </div>
        <div style={{ padding: '16px 18px' }}>
          {/* Type selector — segmented */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {TYPES.map((x) => {
              const active = type === x.t;
              return (
                <button
                  key={x.t}
                  type="button"
                  onClick={() => setType(x.t)}
                  className="btn btn-sm"
                  style={{
                    gap: 6, height: 30,
                    background: active ? x.bg : 'var(--bg)',
                    borderColor: active ? x.color : 'var(--border)',
                    color: active ? x.color : 'var(--fg)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <TypeChip type={x.t} /> {x.name}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            placeholder="Issue title"
            autoFocus
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 18, fontWeight: 600, padding: '4px 0',
              color: 'var(--fg)', fontFamily: 'var(--font-sans)',
            }}
          />
          <textarea
            placeholder="Add description… (markdown supported, /commands)"
            rows={4}
            style={{
              width: '100%', border: 'none', outline: 'none', resize: 'none',
              fontSize: 13, color: 'var(--fg)', padding: '6px 0',
              fontFamily: 'var(--font-sans)', lineHeight: 1.55,
            }}
          />

          {/* Drift fix: removed "Sprint" and "Estimate" meta buttons (out of v1 scope). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <MetaBtn icon={<StatusDot status="backlog" size={11} />} label="Backlog" hint="Initial" />
            <MetaBtn icon={<Priority p="urgent" />} label="Urgent" />
            <MetaBtn icon={<Avatar name="Maya Chen" size={16} />} label="Maya Chen" />
            <MetaBtn icon={<Icon name="tag" size={12} color="var(--fg-muted)" />} label="2 labels" />
            <MetaBtn icon={<Icon name="link" size={12} color="var(--fg-muted)" />} label="Link" placeholder />
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--border-muted)', padding: '10px 18px',
          background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontSize: 11.5, color: 'var(--fg-muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="zap" size={12} />Initial state: <strong style={{ color: 'var(--fg)' }}>Backlog</strong>
          </span>
          <div style={{ flex: 1 }} />
          <label style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" className="cb" /> Create more
          </label>
          <button type="button" onClick={close} className="btn btn-sm">Cancel</button>
          <button type="button" onClick={() => submit()} className="btn btn-primary btn-sm">Create issue<KBD k="⌘↵" /></button>
        </div>
      </div>
    </div>
  );
}

interface MetaBtnProps {
  icon: ReactNode;
  label: string;
  hint?: string;
  placeholder?: boolean;
}
function MetaBtn({ icon, label, hint, placeholder }: MetaBtnProps) {
  return (
    <button type="button" className="btn btn-sm" style={{
      gap: 5, height: 26, background: 'var(--bg)',
      color: placeholder ? 'var(--fg-faint)' : 'var(--fg)',
      fontWeight: placeholder ? 400 : 500,
      borderStyle: placeholder ? 'dashed' : 'solid',
    }}>
      {icon}{label}
      {hint && <span style={{ fontSize: 10, color: 'var(--fg-faint)', marginLeft: 4 }}>{hint}</span>}
    </button>
  );
}

// Re-export for design-canvas reference.
export { CreateIssuePage as CreateIssue };
