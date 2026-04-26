import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, StatusDot, useWorkspaceContext } from '../components/shell';

/*
 * Drift fix (entire screen rewritten):
 * The original designer-supplied rule editor used invented rule types
 * (Approver / External check / Custom script). Replaced with the agreed
 * five v1 rule types: role, assignee_only, reporter_only, required_fields, not_self.
 */

type RuleType = 'role' | 'assignee_only' | 'reporter_only' | 'required_fields' | 'not_self';

interface Rule {
  id: string;
  type: RuleType;
  /** Free-form params depending on type. role: { role: 'admin' }, required_fields: { fields: string[] } */
  params?: { role?: string; fields?: string[] };
}

const RULE_META: Record<RuleType, { icon: string; color: string; title: string; subtitle: string }> = {
  role: {
    icon: 'shield', color: '#4f46e5',
    title: 'Role-restricted',
    subtitle: 'Only users with the selected role can perform this transition.',
  },
  assignee_only: {
    icon: 'user', color: '#0891b2',
    title: 'Assignee only',
    subtitle: 'Only the issue’s current assignee can perform this transition.',
  },
  reporter_only: {
    icon: 'user', color: '#ea580c',
    title: 'Reporter only',
    subtitle: 'Only the user who reported the issue can perform this transition.',
  },
  required_fields: {
    icon: 'asterisk', color: '#10b981',
    title: 'Required fields',
    subtitle: 'Specified fields must be non-empty on the issue before transition.',
  },
  not_self: {
    icon: 'users', color: '#9333ea',
    title: 'Reviewer ≠ reporter',
    subtitle: 'The acting user must not be the issue’s reporter.',
  },
};

const ALL_TYPES: RuleType[] = ['role', 'assignee_only', 'reporter_only', 'required_fields', 'not_self'];

let _ruleId = 0;
const nextRuleId = () => `r${++_ruleId}`;

export function RuleEditorPage() {
  return <RuleEditor />;
}

export function RuleEditor() {
  const { workspace, project } = useWorkspaceContext();
  const [rules, setRules] = useState<Rule[]>([
    { id: nextRuleId(), type: 'role', params: { role: 'admin' } },
    { id: nextRuleId(), type: 'required_fields', params: { fields: ['release_notes', 'assignee'] } },
    { id: nextRuleId(), type: 'not_self' },
  ]);
  const [picking, setPicking] = useState(false);

  const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));
  const addRule = (type: RuleType) => {
    const params: Rule['params'] | undefined =
      type === 'role' ? { role: 'admin' } :
      type === 'required_fields' ? { fields: [] } :
      undefined;
    setRules((rs) => [...rs, { id: nextRuleId(), type, params }]);
    setPicking(false);
  };
  const updateRule = (id: string, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const usedTypes = new Set(rules.map((r) => r.type));
  const availableTypes = ALL_TYPES.filter((t) => !usedTypes.has(t));

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: 'Comet', to: `/${workspace}/${project}` },
        { label: 'Workflow', to: `/${workspace}/${project}/workflow` },
        'In Review → Done',
      ]} />

      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link
            to={`/${workspace}/${project}/workflow`}
            className="btn btn-ghost btn-sm"
            style={{ width: 24, padding: 0, textDecoration: 'none' }}
            data-tip="Back to workflow"
          >
            <Icon name="chevronLeft" size={14} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 14,
              background: 'var(--in-review-bg)', color: 'var(--in-review)', fontSize: 12, fontWeight: 600,
            }}>
              <StatusDot status="in-review" size={10} /> In Review
            </span>
            <Icon name="arrowRight" size={14} color="var(--fg-faint)" />
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 14,
              background: 'var(--done-bg)', color: 'var(--done)', fontSize: 12, fontWeight: 600,
            }}>
              <StatusDot status="done" size={10} /> Done
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Transition rules</h1>
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
            Conditions that must hold for an issue to move from <strong>In Review</strong> to <strong>Done</strong>.
            All rules are <strong>AND</strong>-ed.
          </span>
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 760 }}>
          <div className="label-section" style={{ marginBottom: 12 }}>
            Active rules · {rules.length}
          </div>

          {rules.length === 0 && (
            <div style={{
              padding: '24px 16px', textAlign: 'center', background: 'var(--bg-subtle)',
              borderRadius: 8, color: 'var(--fg-muted)', fontSize: 13, marginBottom: 12,
            }}>
              No rules on this transition. Anyone can transition.
            </div>
          )}

          {rules.map((rule) => (
            <RuleEditorCard
              key={rule.id}
              rule={rule}
              onRemove={() => removeRule(rule.id)}
              onUpdate={(patch) => updateRule(rule.id, patch)}
            />
          ))}

          <div className="label-section" style={{ margin: '20px 0 12px' }}>
            Available rule types {availableTypes.length === 0 && <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>· all in use</span>}
          </div>

          {availableTypes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {availableTypes.map((t) => (
                <AvailableRule key={t} ruleType={t} onAdd={() => addRule(t)} />
              ))}
            </div>
          )}

          {availableTypes.length > 0 && (
            <button
              onClick={() => setPicking((p) => !p)}
              style={{
                marginTop: 12, width: '100%', height: 36,
                border: '1.5px dashed var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--fg-muted)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Icon name="plus" size={14} />Add another rule
            </button>
          )}

          {picking && availableTypes.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-subtle)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6 }}>Pick a rule type:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableTypes.map((t) => (
                  <button key={t} onClick={() => addRule(t)} className="btn btn-sm">
                    <Icon name={RULE_META[t].icon} size={12} color={RULE_META[t].color} />
                    {RULE_META[t].title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: '12px 24px', borderTop: '1px solid var(--border-muted)', background: 'var(--bg-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          <Icon name="alert" size={13} color="var(--in-progress)" style={{ marginRight: 4 }} />
          6 issues currently in <strong>In Review</strong> will be re-validated against new rules.
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm">Discard</button>
        <button className="btn btn-primary btn-sm">Save changes</button>
      </div>
    </div>
  );
}

interface RuleEditorCardProps {
  rule: Rule;
  onRemove: () => void;
  onUpdate: (patch: Partial<Rule>) => void;
}
function RuleEditorCard({ rule, onRemove, onUpdate }: RuleEditorCardProps) {
  const m = RULE_META[rule.type];
  return (
    <div className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border-muted)',
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-subtle)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: '#fff', border: '1px solid var(--border-muted)',
          color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={m.icon} size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.title}</span>
            <span className="mono" style={{
              fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--bg-muted)',
              padding: '1px 5px', borderRadius: 3,
            }}>{rule.type}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 1 }}>{m.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="pill" style={{ background: 'var(--done-bg)', color: 'var(--done)' }}>
            <span style={{ width: 5, height: 5, borderRadius: 3, background: 'currentColor' }} />Active
          </span>
          <button
            onClick={onRemove}
            className="btn btn-ghost btn-sm"
            style={{ width: 24, padding: 0, color: 'var(--fg-muted)' }}
            data-tip="Remove rule"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <RuleParams rule={rule} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function RuleParams({ rule, onUpdate }: { rule: Rule; onUpdate: (patch: Partial<Rule>) => void }) {
  if (rule.type === 'role') {
    return (
      <>
        <Row label="Required role">
          <select
            className="input input-sm"
            value={rule.params?.role ?? 'admin'}
            onChange={(e) => onUpdate({ params: { ...rule.params, role: e.target.value } })}
            style={{ width: 'auto' }}
          >
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </Row>
        <Hint>
          Only members of the selected role can move issues across this transition.
          v1 supports two roles (<code>admin</code>, <code>member</code>).
        </Hint>
      </>
    );
  }
  if (rule.type === 'required_fields') {
    return (
      <>
        <Row label="Fields">
          <FieldChips
            fields={rule.params?.fields ?? []}
            onChange={(fields) => onUpdate({ params: { ...rule.params, fields } })}
          />
        </Row>
        <Hint>Validation runs on transition. Users see inline errors with the failing field names.</Hint>
      </>
    );
  }
  // assignee_only / reporter_only / not_self — no params.
  const hint = (
    rule.type === 'assignee_only' ? 'Useful when only the assignee should be able to start or finish work.'
    : rule.type === 'reporter_only' ? 'Useful when the original reporter is the only one who can confirm a fix or close a request.'
    : 'Useful for review states where the reporter shouldn’t approve their own issue. No parameters.'
  );
  return <Hint>{hint}</Hint>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'center', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function FieldChips({ fields, onChange }: { fields: string[]; onChange: (fs: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const v = draft.trim().replace(/\s+/g, '_');
    if (v && !fields.includes(v)) onChange([...fields, v]);
    setDraft('');
    setAdding(false);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {fields.map((f) => (
        <span key={f} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, height: 24,
          padding: '0 4px 0 8px', background: 'var(--bg-muted)', borderRadius: 4,
          fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>
          {f}
          <button
            onClick={() => onChange(fields.filter((x) => x !== f))}
            data-tip="Remove field"
            style={{
              padding: 2, background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--fg-faint)', display: 'flex',
            }}
          >
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="input input-sm mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(''); setAdding(false); }
          }}
          placeholder="field_name"
          style={{ width: 140 }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="pill pill-outline"
          style={{ cursor: 'pointer' }}
        >
          <Icon name="plus" size={11} />Add field
        </button>
      )}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div style={{
      marginTop: 10, padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 5,
      fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <Icon name="question" size={13} color="var(--fg-faint)" style={{ marginTop: 1, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

function AvailableRule({ ruleType, onAdd }: { ruleType: RuleType; onAdd: () => void }) {
  const m = RULE_META[ruleType];
  return (
    <button
      onClick={onAdd}
      className="card"
      style={{
        padding: 12, textAlign: 'left', cursor: 'pointer',
        background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={m.icon} size={14} color="var(--fg-muted)" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{m.title}</span>
        <span className="mono" style={{
          fontSize: 10, color: 'var(--fg-faint)', background: 'var(--bg-muted)',
          padding: '1px 5px', borderRadius: 3,
        }}>{ruleType}</span>
        <Icon name="plus" size={13} color="var(--fg-faint)" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{m.subtitle}</div>
    </button>
  );
}
