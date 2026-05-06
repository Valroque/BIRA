import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TypeChip, StatusDot, Priority, Avatar, KBD, useTenantContext } from '../components/shell';
import { AttachmentRow, useComposer } from '../components/composer';
import { type Issue } from '../fixtures';
import { useIssues } from '../state/issues';
import { useProjects } from '../state/projects';

const TYPES = [
  { t: 'T', name: 'Task', color: 'var(--type-task)', bg: 'var(--type-task-bg)' },
  { t: 'B', name: 'Bug', color: 'var(--type-bug)', bg: 'var(--type-bug-bg)' },
  { t: 'S', name: 'Story', color: 'var(--type-story)', bg: 'var(--type-story-bg)' },
  { t: 'E', name: 'Epic', color: 'var(--type-epic)', bg: 'var(--type-epic-bg)' },
] as const;

type TypeChar = typeof TYPES[number]['t'];

// Hierarchy rules — only types valid as a *child* of the given parent.
//   Epic   → S / T / B
//   Story  → T / B
//   Task / Bug → none (leaf)
// When no parent is set, all types are creatable (top-level new issue).
const ALL_TYPES: TypeChar[] = ['T', 'B', 'S', 'E'];
function allowedTypesFor(parent: Issue | null): TypeChar[] {
  if (!parent) return ALL_TYPES;
  if (parent.type === 'E') return ['S', 'T', 'B'];
  if (parent.type === 'S') return ['T', 'B'];
  return [];
}

export function CreateIssuePage() {
  const navigate = useNavigate();
  const { tenant, workspace, project } = useTenantContext();
  const [searchParams] = useSearchParams();
  const { getIssue, createIssueLive } = useIssues();
  const { getProject } = useProjects();
  const close = () => navigate(-1);
  const desc = useComposer({ tenantSlug: tenant, workspaceSlug: workspace });

  // Optional `?parent=ISSUE-KEY` URL param. When set + valid, the form shows
  // the parent as a read-only chip and restricts type choices to the valid
  // child types for that parent. Invalid / unknown keys are ignored — the
  // user gets the unconstrained form rather than an error wall.
  const parent = useMemo<Issue | null>(() => {
    const raw = searchParams.get('parent');
    if (!raw) return null;
    const target = getIssue(raw);
    if (!target) return null;
    if (target.type !== 'E' && target.type !== 'S') return null; // leaves can't be parents
    return target;
  }, [searchParams, getIssue]);

  const allowedTypes = useMemo(() => allowedTypesFor(parent), [parent]);
  const [type, setType] = useState<TypeChar>(() => allowedTypes[0] ?? 'B');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // If the parent changes (e.g. user opens the form from a different issue),
  // ensure the currently-selected type is still allowed.
  useEffect(() => {
    if (!allowedTypes.includes(type)) setType(allowedTypes[0] ?? 'B');
  }, [allowedTypes, type]);

  // Submit hits POST /projects/:p/issues. On success the new issue is
  // inserted into `useIssues()` cache and we navigate to its detail page
  // using the BE-allocated key. On failure we keep the modal open and
  // surface the message inline.
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    if (!title.trim()) {
      setSubmitError('Title is required');
      return;
    }
    if (desc.hasInflight) {
      setSubmitError('Wait for attachments to finish uploading');
      return;
    }
    const projectInfo = getProject(project);
    if (!projectInfo) {
      setSubmitError(`Project '${project}' not found`);
      return;
    }
    setSubmitting(true);
    const result = await createIssueLive({
      projectSlug: projectInfo.slug,
      type,
      title: title.trim(),
      description: desc.value.trim() ? desc.value : undefined,
      parent: parent?.key,
      descriptionAttachmentIds: desc.attachmentIds.length ? desc.attachmentIds : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    navigate(`/${tenant}/${workspace}/${projectInfo.slug}/issue/${result.issue.key}`, { replace: true });
  };

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, title, type, parent, project]);

  const projectInfo = getProject(project);

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
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{projectInfo?.name ?? project}</span>
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
          {/* Parent context — only when launched via "+ Add child" from
              another issue. Read-only; clear by closing the modal. */}
          {parent && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
              padding: '6px 8px', borderRadius: 6,
              background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
              fontSize: 12, color: 'var(--fg-muted)',
            }}>
              <Icon name="link" size={12} />
              <span>Parent</span>
              <TypeChip type={parent.type} />
              <span className="mono" style={{ color: 'var(--fg-muted)' }}>{parent.key}</span>
              <span style={{
                color: 'var(--fg)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{parent.title}</span>
            </div>
          )}
          {/* Type selector — segmented. Disallowed types (per parent's
              hierarchy rules) render dim and unclickable. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {TYPES.map((x) => {
              const active = type === x.t;
              const allowed = allowedTypes.includes(x.t);
              const tip = !allowed && parent
                ? `${x.name} can't be a child of ${parent.type === 'E' ? 'an Epic' : 'a Story'}`
                : undefined;
              return (
                <button
                  key={x.t}
                  type="button"
                  onClick={() => allowed && setType(x.t)}
                  disabled={!allowed}
                  data-tip={tip}
                  className="btn btn-sm"
                  style={{
                    gap: 6, height: 30,
                    background: active ? x.bg : 'var(--bg)',
                    borderColor: active ? x.color : 'var(--border)',
                    color: active ? x.color : 'var(--fg)',
                    fontWeight: active ? 600 : 500,
                    opacity: allowed ? 1 : 0.4,
                    cursor: allowed ? 'pointer' : 'not-allowed',
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%', border: 'none', outline: 'none',
              fontSize: 18, fontWeight: 600, padding: '4px 0',
              color: 'var(--fg)', fontFamily: 'var(--font-sans)',
              background: 'transparent',
            }}
          />
          <div
            onDragOver={desc.handleDragOver}
            onDragLeave={desc.handleDragLeave}
            onDrop={desc.handleDrop}
            style={{
              borderRadius: 6,
              outline: desc.dragOver ? '2px solid var(--accent)' : 'none',
              outlineOffset: 2,
              transition: 'outline-color .12s',
            }}
          >
            <textarea
              ref={desc.textareaRef}
              value={desc.value}
              onChange={(e) => desc.setValue(e.target.value)}
              onPaste={desc.handlePaste}
              placeholder="Add description… paste or drop an image, or use the code button to add a snippet"
              rows={4}
              style={{
                width: '100%', border: 'none', outline: 'none', resize: 'vertical',
                fontSize: 13, color: 'var(--fg)', padding: '6px 0',
                fontFamily: 'var(--font-sans)', lineHeight: 1.55,
                background: 'transparent', boxSizing: 'border-box',
              }}
            />
            <AttachmentRow
              attachments={desc.attachments}
              onRemove={desc.removeAttachment}
              onRetry={desc.retry}
              bordered={false}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
              <button
                type="button"
                onClick={desc.insertCodeBlock}
                className="btn btn-ghost btn-sm"
                style={{ width: 26, padding: 0 }}
                data-tip="Code block"
              >
                <Icon name="code" size={13} />
              </button>
              <button
                type="button"
                onClick={desc.openFilePicker}
                className="btn btn-ghost btn-sm"
                style={{ width: 26, padding: 0 }}
                data-tip="Attach file"
              >
                <Icon name="paperclip" size={13} />
              </button>
              <input
                ref={desc.fileInputRef}
                type="file"
                multiple
                hidden
                onChange={desc.handleFileChange}
              />
              {desc.hasInflight && (
                <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--fg-muted)' }}>
                  Uploading…
                </span>
              )}
            </div>
          </div>

          {/*
            Meta placeholders — priority / assignee / labels are still UI-only
            in the create form. The detail page can edit all three through
            patchIssue once the issue is created. Wiring them into the create
            payload is a follow-up; the BE accepts them as optional fields.
            Drift fix: removed "Sprint" and "Estimate" meta buttons (out of v1 scope).
          */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <MetaBtn icon={<StatusDot status="backlog" size={11} />} label="Backlog" hint="Initial" />
            <MetaBtn icon={<Priority p="urgent" />} label="Urgent" />
            <MetaBtn icon={<Avatar name="Maya Chen" size={16} />} label="Maya Chen" />
            <MetaBtn icon={<Icon name="tag" size={12} color="var(--fg-muted)" />} label="2 labels" />
            <MetaBtn icon={<Icon name="link" size={12} color="var(--fg-muted)" />} label="Link" placeholder />
          </div>

          {submitError && (
            <div
              role="alert"
              style={{
                marginTop: 12, padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-subtle)',
                border: '1px solid var(--blocked)',
                color: 'var(--blocked)', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name="alert" size={12} />
              <span>{submitError}</span>
            </div>
          )}
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
          <button type="button" onClick={close} className="btn btn-sm" disabled={submitting}>Cancel</button>
          <button
            type="button"
            onClick={() => void submit()}
            className="btn btn-primary btn-sm"
            disabled={submitting || !title.trim() || desc.hasInflight}
            data-tip={desc.hasInflight ? 'Wait for attachments to finish uploading' : undefined}
          >
            {submitting ? 'Creating…' : 'Create issue'}
            <KBD k="⌘↵" />
          </button>
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
