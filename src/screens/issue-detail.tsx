import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { TopBar, TypeChip, IssueId, StatusDot, Priority, Avatar, STATUSES, useWorkspaceContext } from '../components/shell';
import { ISSUES, type Issue } from '../fixtures';

const STATUS_LABEL: Record<Issue['status'], string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  done: 'Done',
  canceled: 'Canceled',
};

const PRIORITY_LABEL: Record<Issue['priority'], string> = {
  urgent: 'Urgent', high: 'High', med: 'Medium', low: 'Low', none: 'No priority',
};

export function IssueDetailPage() {
  const { key } = useParams<{ key: string }>();
  const { workspace, project } = useWorkspaceContext();
  const issue = key ? ISSUES.find((i) => i.id === key) : undefined;

  if (!issue) {
    return (
      <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <TopBar breadcrumbs={[
          { label: 'Acme Robotics', to: `/${workspace}/projects` },
          { label: 'Comet', to: `/${workspace}/${project}` },
          { label: 'Issues', to: `/${workspace}/${project}/list` },
          key ?? '?',
        ]} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ maxWidth: 380, textAlign: 'center' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 22, background: 'var(--bg-muted)',
              color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Icon name="alert" size={20} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Issue not found</h2>
            <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '6px 0 14px' }}>
              <span className="mono">{key}</span> doesn’t exist in this project. It may have been deleted, or the link is wrong.
            </p>
            <Link to={`/${workspace}/${project}/list`} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
              <Icon name="arrowRight" size={13} />Back to issues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <IssueDetail issue={issue} />;
}

/**
 * Inner detail view. Exported with an optional `issue` prop so the
 * design-canvas reference can render it with a default fixture; the
 * routed `IssueDetailPage` always passes a real one.
 */
function IssueDetail({ issue = ISSUES[0] }: { issue?: Issue }) {
  const { workspace, project } = useWorkspaceContext();
  // Reporter is not in the fixture model — fall back to a project-relevant default.
  const reporter = 'Jordan Lee';
  const blocked = issue.status === 'in-review';

  return (
    <div className="bira" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar breadcrumbs={[
        { label: 'Acme Robotics', to: `/${workspace}/projects` },
        { label: 'Comet', to: `/${workspace}/${project}` },
        { label: 'Issues', to: `/${workspace}/${project}/list` },
        issue.id,
      ]} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ maxWidth: 760, padding: '24px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TypeChip type={issue.type} />
              <IssueId id={issue.id} />
              <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>opened by {reporter} · 2 days ago</span>
            </div>
            <h1 style={{
              fontSize: 22, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.3,
              margin: 0, textWrap: 'pretty',
            }}>{issue.title}</h1>

            {/*
              The blocked-transition banner only renders when the issue is in In Review
              (the example state where rules are checked). For other statuses we don't
              show the banner — a real flow improvement over the original which had it
              pinned to a single hardcoded issue.

              Drift fix: rule-types match BIRA's agreed five
              (role, assignee_only, reporter_only, required_fields, not_self).
            */}
            {blocked && (
              <div style={{ marginTop: 18, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12, background: 'var(--blocked)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    <Icon name="lock" size={13} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>
                      Cannot move to Done — 2 of 3 rules failing
                    </div>
                    <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
                      Resolve the items below or ask an admin to override.
                    </div>
                  </div>
                  <button className="btn btn-sm" style={{ borderColor: '#fecaca', color: '#991b1b', background: '#fff' }}>
                    Override…
                  </button>
                </div>
                <div style={{ borderTop: '1px solid #fecaca', background: '#fff', padding: '4px 0' }}>
                  <BlockedRule
                    ruleType="role"
                    status="fail"
                    title="Only admins can move to Done"
                    detail={<>You are signed in as <strong>{issue.assignee}</strong> (member). Required role: <strong>admin</strong>.</>}
                  />
                  <BlockedRule
                    ruleType="required_fields"
                    status="fail"
                    title="Required fields must be set"
                    detail={
                      <>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 6px', background: '#fee2e2', borderRadius: 3,
                          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#991b1b',
                        }}>
                          release_notes <span style={{ color: '#dc2626' }}>empty</span>
                        </span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 6px', background: 'var(--done-bg)', borderRadius: 3,
                          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--done)', marginLeft: 6,
                        }}>
                          assignee <Icon name="check" size={10} />
                        </span>
                      </>
                    }
                  />
                  <BlockedRule
                    ruleType="not_self"
                    status="pass"
                    title="Reviewer must not be the reporter"
                    detail={
                      <span style={{ color: 'var(--done)' }}>
                        <Icon name="check" size={11} /> You are not the reporter ({reporter}).
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: 22, fontSize: 14, color: 'var(--fg)', lineHeight: 1.65 }}>
              <p>
                Saving the workflow editor's view state (filter chips, expanded sections) writes through a debounced
                effect. When a state node is reordered <em>while a filter is active</em>, the persisted slot order is
                computed from the visible subset and reapplied to the full set on reload — silently dropping nodes
                that were filtered out.
              </p>
              <p style={{ marginTop: 12, fontWeight: 600, color: 'var(--fg)' }}>Repro</p>
              <ol style={{ paddingLeft: 22, marginTop: 6, color: 'var(--fg-muted)' }}>
                <li>Open <code style={codeStyle}>/comet/workflow</code></li>
                <li>Apply filter <code style={codeStyle}>type:terminal</code></li>
                <li>Drag any visible node to a new position</li>
                <li>Reload — non-terminal states are missing from the saved order</li>
              </ol>
            </div>

            {/* Activity */}
            <ActivityFeed />
          </div>
        </div>

        {/* Right inspector */}
        <aside style={{
          width: 280, borderLeft: '1px solid var(--border-muted)', background: 'var(--bg-subtle)',
          flexShrink: 0, padding: 16, fontSize: 12,
        }}>
          <Meta label="Status">
            <button className="btn btn-sm" style={{
              width: '100%', justifyContent: 'flex-start',
              background: `var(--${issue.status}-bg)`,
              borderColor: `var(--${issue.status})`,
              color: `var(--${issue.status})`,
            }}>
              <StatusDot status={issue.status} size={11} /> {STATUS_LABEL[issue.status]}
              <Icon name="chevronDown" size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {/* Mini transition picker preview */}
            <div style={{
              marginTop: 6, border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '4px 8px', fontSize: 10.5, fontWeight: 600, color: 'var(--fg-faint)',
                textTransform: 'uppercase', letterSpacing: 0.4, background: 'var(--bg-subtle)',
              }}>Move to…</div>
              {STATUSES.filter((s) => s.id !== issue.status).map((s) => {
                const blockedHere = blocked && s.id === 'done';
                return (
                  <TransOption
                    key={s.id}
                    status={s.id}
                    label={s.name}
                    trigger={s.id === 'done' && issue.status === 'in-review' ? 'approve' : undefined}
                    blocked={blockedHere}
                    reason={blockedHere ? '2 rules failing' : undefined}
                    available={!blockedHere}
                  />
                );
              })}
            </div>
          </Meta>
          <Meta label="Priority">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Priority p={issue.priority} /><span>{PRIORITY_LABEL[issue.priority]}</span>
            </span>
          </Meta>
          <Meta label="Assignee">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={issue.assignee} size={20} /><span>{issue.assignee}</span>
            </span>
          </Meta>
          <Meta label="Reporter">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Avatar name={reporter} size={20} /><span>{reporter}</span>
            </span>
          </Meta>
          <Meta label="Project">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="folder" size={13} color="var(--fg-muted)" />Comet
            </span>
          </Meta>
          {/* Drift fix: removed Sprint and Estimate metas (sprint/velocity out of v1 scope). */}
          <Meta label="Labels">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {issue.labels.length === 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>No labels</span>
              )}
              {issue.labels.map((l) => (
                <span key={l} className="pill" style={{ background: 'var(--bg-muted)', color: 'var(--fg)' }}>{l}</span>
              ))}
            </div>
          </Meta>
          <Meta label="Linked">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Link
                to={`/${workspace}/${project}/issue/CMT-238`}
                style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--fg)', fontSize: 12, textDecoration: 'none' }}
              >
                <Icon name="link" size={12} color="var(--fg-muted)" />
                Blocks <span className="mono" style={{ color: 'var(--fg-muted)' }}>CMT-238</span>
              </Link>
            </div>
          </Meta>
        </aside>
      </div>
    </div>
  );
}

const codeStyle = {
  background: 'var(--bg-muted)',
  padding: '1px 5px',
  borderRadius: 3,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
};

type RuleType = 'role' | 'assignee_only' | 'reporter_only' | 'required_fields' | 'not_self';

const RULE_ICON: Record<RuleType, string> = {
  role: 'shield',
  assignee_only: 'user',
  reporter_only: 'user',
  required_fields: 'asterisk',
  not_self: 'users',
};

interface BlockedRuleProps {
  ruleType: RuleType;
  status: 'pass' | 'fail';
  title: string;
  detail: ReactNode;
}
function BlockedRule({ ruleType, status, title, detail }: BlockedRuleProps) {
  const passing = status === 'pass';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px' }}>
      <div style={{
        width: 18, height: 18, borderRadius: 9,
        background: passing ? 'var(--done)' : '#fff',
        color: passing ? '#fff' : '#dc2626',
        border: passing ? 'none' : '1.5px solid #dc2626',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        {passing ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={RULE_ICON[ruleType]} size={12} color="var(--fg-muted)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: passing ? 'var(--fg-muted)' : 'var(--fg)' }}>{title}</span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--fg-faint)', background: 'var(--bg-subtle)',
            padding: '1px 4px', borderRadius: 2,
          }}>{ruleType}</span>
          {!passing && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 5px',
              background: '#fee2e2', color: '#991b1b', borderRadius: 3,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>Failing</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>{detail}</div>
      </div>
    </div>
  );
}

interface TransOptionProps {
  status: string;
  label: string;
  trigger?: string;
  available?: boolean;
  blocked?: boolean;
  reason?: string;
}
function TransOption({ status, label, trigger, blocked, reason }: TransOptionProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      cursor: blocked ? 'not-allowed' : 'pointer',
      opacity: blocked ? 0.6 : 1,
      borderTop: '1px solid var(--border-muted)',
    }}>
      <StatusDot status={status} size={10} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      {trigger && (
        <span className="mono" style={{
          fontSize: 10.5, color: 'var(--fg-muted)', background: 'var(--bg-subtle)',
          padding: '1px 5px', borderRadius: 3,
        }}>{trigger}</span>
      )}
      <div style={{ flex: 1 }} />
      {blocked && (
        <span style={{ fontSize: 10.5, color: 'var(--blocked)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="lock" size={11} /><span>{reason}</span>
        </span>
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 12.5, color: 'var(--fg)' }}>{children}</div>
    </div>
  );
}

// --- Activity feed with All / Comments tab filter (JIRA-style) ---

type FeedItem =
  | { kind: 'comment'; who: string; when: string; body: ReactNode }
  | { kind: 'event'; who: string; when: string; verb: string; from?: string; to?: string; detail?: ReactNode; icon?: string };

const FEED_ITEMS: FeedItem[] = [
  {
    kind: 'comment', who: 'Maya Chen', when: '2h ago',
    body: (
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
        Pushed a fix that gates persistence on the unfiltered set. Want a second pair of eyes on the
        migration path for existing dirty state.
      </div>
    ),
  },
  { kind: 'event', who: 'Jordan Lee', when: '3h ago', verb: 'moved this from', from: 'In Progress', to: 'In Review' },
  {
    kind: 'event', who: 'Sam Park', when: 'yesterday', verb: 'added the label', icon: 'tag',
    detail: <span className="pill" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: 4 }}>regression</span>,
  },
  {
    kind: 'comment', who: 'Sam Park', when: 'yesterday',
    body: (
      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.55 }}>
        Confirmed repro on staging. Marking as urgent — this drops nodes silently which is hard for users to notice.
      </div>
    ),
  },
];

type FeedTab = 'all' | 'comments';

function ActivityFeed() {
  const [tab, setTab] = useState<FeedTab>('all');
  const counts = {
    all: FEED_ITEMS.length,
    comments: FEED_ITEMS.filter((i) => i.kind === 'comment').length,
  };
  const filtered = tab === 'comments' ? FEED_ITEMS.filter((i) => i.kind === 'comment') : FEED_ITEMS;

  return (
    <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--border-muted)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--fg-faint)',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>Activity</span>
        <div style={{
          display: 'inline-flex', padding: 2, borderRadius: 6,
          background: 'var(--bg-subtle)', border: '1px solid var(--border-muted)',
        }}>
          <FeedTabBtn active={tab === 'comments'} onClick={() => setTab('comments')}>
            Comments
            <FeedCount n={counts.comments} active={tab === 'comments'} />
          </FeedTabBtn>
          <FeedTabBtn active={tab === 'all'} onClick={() => setTab('all')}>
            All
            <FeedCount n={counts.all} active={tab === 'all'} />
          </FeedTabBtn>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Newest first</span>
      </div>

      {filtered.length === 0 && (
        <div style={{
          padding: '20px 12px', textAlign: 'center',
          fontSize: 12.5, color: 'var(--fg-muted)',
          border: '1px dashed var(--border-muted)', borderRadius: 6,
        }}>
          No comments yet. Start the conversation below.
        </div>
      )}

      {filtered.map((item, i) =>
        item.kind === 'comment' ? (
          <Activity key={i} who={item.who} when={item.when}>{item.body}</Activity>
        ) : (
          <ActivityEvent
            key={i}
            who={item.who}
            when={item.when}
            verb={item.verb}
            from={item.from}
            to={item.to}
            detail={item.detail}
            icon={item.icon}
          />
        )
      )}

      {/* Comment composer */}
      <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
        <div style={{ padding: '10px 12px', minHeight: 60, fontSize: 13, color: 'var(--fg-faint)' }}>
          Leave a comment…
        </div>
        <div style={{
          padding: '6px 8px', borderTop: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <button className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }}><Icon name="bold" size={13} /></button>
          <button className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }}><Icon name="italic" size={13} /></button>
          <button className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }}><Icon name="code" size={13} /></button>
          <button className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }}><Icon name="paperclip" size={13} /></button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm">Comment</button>
        </div>
      </div>
    </div>
  );
}

function FeedTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 4,
        background: active ? 'var(--bg)' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: active ? 'var(--fg)' : 'var(--fg-muted)',
        fontWeight: active ? 600 : 500, fontSize: 12,
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        transition: 'background .12s, color .12s',
      }}
    >
      {children}
    </button>
  );
}

function FeedCount({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className="tnum"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 16, padding: '0 5px', borderRadius: 8,
        fontSize: 10, fontWeight: 600,
        background: active ? 'var(--accent-muted)' : 'var(--bg-muted)',
        color: active ? 'var(--accent-active)' : 'var(--fg-muted)',
      }}
    >{n}</span>
  );
}

function Activity({ who, when, children }: { who: string; when: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <Avatar name={who} size={24} />
      <div style={{ flex: 1, border: '1px solid var(--border-muted)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          padding: '6px 12px', background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-muted)',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
        }}>
          <strong>{who}</strong><span style={{ color: 'var(--fg-muted)' }}>· {when}</span>
        </div>
        <div style={{ padding: '10px 12px' }}>{children}</div>
      </div>
    </div>
  );
}

interface ActivityEventProps {
  who: string;
  when: string;
  verb: string;
  from?: string;
  to?: string;
  detail?: ReactNode;
  icon?: string;
  iconColor?: string;
}
function ActivityEvent({ who, when, verb, from, to, detail, icon, iconColor }: ActivityEventProps) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', paddingLeft: 7 }}>
      <div style={{
        width: 18, height: 18, borderRadius: 9, background: 'var(--bg-muted)',
        color: iconColor || 'var(--fg-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon || 'rotate'} size={11} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', flex: 1 }}>
        <strong style={{ color: 'var(--fg)' }}>{who}</strong> {verb}{' '}
        {from && to && (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status={from === 'In Progress' ? 'in-progress' : 'todo'} size={9} />{from}
            </span> to{' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <StatusDot status={to === 'In Review' ? 'in-review' : 'done'} size={9} />{to}
            </span>
          </>
        )}
        {detail}
        <span style={{ marginLeft: 8, color: 'var(--fg-faint)' }}>· {when}</span>
      </div>
    </div>
  );
}

export { IssueDetail };
