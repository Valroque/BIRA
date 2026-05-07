// /:tenant/:workspace/:project/milestones — full CRUD page for project
// milestones. Writes go through `useMilestones()` which is API-backed —
// the page renders loading + error states off the provider's signals and
// surfaces save / delete failures inline.

import { useMemo, useState, type FormEvent } from 'react';
import { Icon } from '../components/icons';
import { TopBar, Tabs, projectTabs, useTenantBreadcrumbs } from '../components/shell';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../components/modal';
import { Field, Hint } from '../components/forms';
import { EmptyState, ErrorState } from '../components/states';
import { useProjects } from '../state/projects';
import { useMilestones } from '../state/milestones';
import { workingDaysBetween, type Milestone } from '../fixtures';
import { dayToIso, todayDay } from '../components/gantt-utils';

// `null` = closed; 'new' = create form; { ...milestone } = edit existing.
type ModalState = null | 'new' | Milestone;

export function ProjectMilestonesPage() {
  const { tenant, workspace, project, tenantName, workspaceName } = useTenantBreadcrumbs();
  const { getProject } = useProjects();
  const {
    milestonesForProject, addMilestone, updateMilestone, removeMilestone,
    loading, error, refresh,
  } = useMilestones();
  const projectInfo = getProject(project);
  const [modal, setModal] = useState<ModalState>(null);

  const milestones = useMemo(
    () => projectInfo ? milestonesForProject(projectInfo.id) : [],
    [projectInfo, milestonesForProject],
  );

  const todayIso = dayToIso(todayDay());

  // Returns null on success, an error message on failure. The modal
  // surfaces the message inline; null tells it to close itself.
  const onSave = async (input: { name: string; description: string; date: string }) => {
    if (modal === 'new') {
      if (!projectInfo) return 'Project not found';
      const res = await addMilestone({
        projectId: projectInfo.id,
        name: input.name.trim(),
        description: input.description.trim() || undefined,
        date: input.date,
      });
      if (!res.ok) return res.message;
    } else if (modal && typeof modal === 'object') {
      const res = await updateMilestone(modal.id, {
        name: input.name.trim(),
        // Empty string clears the column on the BE; undefined wouldn't.
        description: input.description.trim() || null,
        date: input.date,
      });
      if (!res.ok) return res.message;
    }
    setModal(null);
    return null;
  };

  const onDelete = async (m: Milestone) => {
    // The codebase doesn't ship a custom confirm primitive yet; a native
    // confirm is intentionally low-ceremony for now.
    if (!window.confirm(`Delete milestone '${m.name}'?`)) return;
    const res = await removeMilestone(m.id);
    if (!res.ok) {
      // Mirrors the `commitDates` failure path in `issues-gantt.tsx` —
      // log + leave the row visible so the user can retry. A toast
      // primitive would be better; not in scope.
      console.warn('Failed to delete milestone', res.message);
    }
  };

  if (error && !loading) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={[
          { label: tenantName, to: `/${tenant}/workspaces` },
          { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
          { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
          'Milestones',
        ]} />
        <Tabs active="milestones" tabs={projectTabs(tenant, workspace, project)} />
        <ErrorState
          code="LOAD_MILESTONES"
          title="Couldn’t load milestones"
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

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: tenantName, to: `/${tenant}/workspaces` },
        { label: workspaceName, to: `/${tenant}/${workspace}/projects` },
        { label: projectInfo?.name ?? project, to: `/${tenant}/${workspace}/${project}` },
        'Milestones',
      ]} />
      <Tabs active="milestones" tabs={projectTabs(tenant, workspace, project)} />

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>
            Milestones
          </h1>
          <span className="pill" style={{ background: 'var(--bg-muted)' }}>
            <span className="tnum">{milestones.length}</span>
          </span>
          <div style={{ flex: 1 }} />
          {milestones.length > 0 && (
            <button
              type="button"
              onClick={() => setModal('new')}
              className="btn btn-primary btn-sm"
            >
              <Icon name="plus" size={13} />Add milestone
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '12px 0' }}>
            Loading milestones…
          </div>
        ) : milestones.length === 0 ? (
          <EmptyState
            icon="flag"
            title="No milestones yet"
            description="Add the first deadline to track for this project."
            action={
              <button
                type="button"
                onClick={() => setModal('new')}
                className="btn btn-primary btn-sm"
              >
                <Icon name="plus" size={13} />Add milestone
              </button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                todayIso={todayIso}
                onEdit={() => setModal(m)}
                onDelete={() => onDelete(m)}
              />
            ))}
          </div>
        )}
      </div>

      {modal !== null && (
        <MilestoneModal
          milestone={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={onSave}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function MilestoneRow({
  milestone, todayIso, onEdit, onDelete,
}: {
  milestone: Milestone;
  todayIso: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const overdue = milestone.date < todayIso;
  const accent = overdue ? 'var(--blocked)' : 'var(--accent)';
  return (
    <div
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 16px',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>
            {milestone.name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }} className="tnum">
            {formatAbsolute(milestone.date)}
          </span>
          <RelativePill date={milestone.date} todayIso={todayIso} />
        </div>
        {milestone.description && (
          <div style={{
            fontSize: 12.5, color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.5,
          }}>
            {milestone.description}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          type="button"
          onClick={onEdit}
          className="btn btn-ghost btn-sm"
          data-tip="Edit"
          aria-label="Edit milestone"
        >
          <Icon name="edit" size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn btn-ghost btn-sm"
          data-tip="Delete"
          aria-label="Delete milestone"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  );
}

function RelativePill({ date, todayIso }: { date: string; todayIso: string }) {
  const { label, tone } = relativeLabel(date, todayIso);
  const style = tone === 'overdue' || tone === 'today'
    ? { background: 'var(--blocked-bg)', color: 'var(--blocked)' }
    : { background: 'var(--accent-muted)', color: 'var(--accent)' };
  return (
    <span className="pill" style={style}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

interface MilestoneModalProps {
  /** null = create form; existing milestone = edit form. */
  milestone: Milestone | null;
  onClose: () => void;
  /**
   * Returns null on success (the modal closes itself in the caller),
   * or an error message that the modal surfaces inline.
   */
  onSave: (input: { name: string; description: string; date: string }) => Promise<string | null>;
}
function MilestoneModal({ milestone, onClose, onSave }: MilestoneModalProps) {
  const [name, setName] = useState(milestone?.name ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [date, setDate] = useState(milestone?.date ?? '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const valid = name.trim().length > 0 && date.length > 0;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setErrorMsg(null);
    const err = await onSave({ name, description, date });
    if (err) {
      setErrorMsg(err);
      setSaving(false);
    }
    // Success path: the parent unmounts this modal so no need to flip
    // `saving` back — guards against state updates on an unmounted node.
  };

  return (
    <Modal
      onClose={saving ? () => { /* block close while saving */ } : onClose}
      onSubmit={onSubmit}
      label={milestone ? 'Edit milestone' : 'New milestone'}
    >
      <ModalHeader title={milestone ? 'Edit milestone' : 'New milestone'} onClose={onClose} />
      <ModalBody>
        <Field label="Name">
          <input
            autoFocus
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mutual Fund Go-Live"
            required
          />
        </Field>
        <Field label="Description" optional>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this milestone deliver?"
            rows={3}
            style={{ resize: 'vertical', minHeight: 72, padding: '6px 10px', height: 'auto', lineHeight: 1.45 }}
          />
        </Field>
        <Field label="Completion deadline">
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Hint>You have until end of day on this date to finish.</Hint>
        </Field>
        {errorMsg && (
          <div
            role="alert"
            style={{
              fontSize: 12.5, color: 'var(--blocked)',
              background: 'var(--blocked-bg)',
              border: '1px solid var(--blocked)',
              borderRadius: 6,
              padding: '6px 10px',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {errorMsg}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} disabled={saving} className="btn btn-sm">Cancel</button>
        <button type="submit" disabled={!valid || saving} className="btn btn-primary btn-sm">
          <Icon name="check" size={13} />{saving ? 'Saving…' : 'Save'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "May 28, 2026" — UTC-based to match the day-number coordinate space. */
export function formatAbsolute(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

/**
 * Calendar-day diff between two ISO dates (b - a). Independent of working
 * days — used for "N days overdue", which is a wall-clock signal.
 */
function calendarDaysBetween(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function relativeLabel(date: string, todayIso: string): {
  label: string;
  tone: 'overdue' | 'today' | 'upcoming';
} {
  if (date === todayIso) return { label: 'due today', tone: 'today' };
  if (date < todayIso) {
    const days = calendarDaysBetween(date, todayIso);
    return { label: `${days} day${days === 1 ? '' : 's'} overdue`, tone: 'overdue' };
  }
  const days = workingDaysBetween(todayIso, date);
  return { label: `in ${days} working day${days === 1 ? '' : 's'}`, tone: 'upcoming' };
}
