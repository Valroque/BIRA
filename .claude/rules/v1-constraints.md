# BIRA v1 — hard constraints

These are deliberate v1 decisions, not defects. Don't propose changes to them
without explicit user approval; if a request implicitly violates one, surface
it before implementing.

## Product

- **Multi-tenant via path slug** — every URL is `/:workspace/...`. No
  subdomain routing.
- **Kanban only** — no sprints, backlog grooming, burndown, story points.
- **Three roles** — `admin`, `write`, `read`. Ordered ladder:
  `read < write < admin` (write implies read; admin implies write). Roles
  can be assigned to **teams** (defaults) or **individual users** (overrides).
  Resolution is **explicit-over-inherited**: an explicit user grant wins over
  any team grants, in either direction (including downgrades). Team grants
  combine via union — the highest team role wins. **Admin is only ever
  assigned explicitly to a user, never inherited from a team.**
- **Workflow data shape**:
  - Workflows are first-class entities with stable ids.
  - `(project, issue_type)` selects one workflow. Multiple workflows can
    exist for the same issue type; projects share or each pick their own.
  - Workflows are directed graphs (cycles allowed — needed for reopen,
    request-changes).
- **Transition rules** are a closed enum of five types (`role`,
  `assignee_only`, `reporter_only`, `required_fields`, `not_self`). No
  scripting language. No "approver" or "external check" types — those were
  designer drift and have been removed.
- **Issue types** — Task, Bug, Story, Epic. Hardcoded for v1.

## Out of scope for v1 (do not add without approval)

- Sprints / backlog / burndown
- Sub-tasks below Epic → Issue
- Granular roles beyond admin/write/read (no per-feature permissions, no
  resource-level ACLs, no custom role definitions)
- Notifications, @mentions, watchers, email digests
- Custom fields and the editor for them
- Reports, dashboards, charts
- JQL or any query language
- Integrations (Git, Slack, webhooks)
- SSO / SAML
- A public REST API (the web app doesn't need one for v1)

## Engineering

- **Frontend-first phase.** Until the user explicitly green-lights it, do
  not propose backend, API, database, or persistence work. Wiring real state
  (real auth, real submit handlers, server data) is also off-limits — local
  state and fixtures only.
- **No Docker for the Node app.** Backend (when it lands) runs on the host;
  Postgres is the only piece in a container locally / managed in cloud.
- **No new dependencies** without explicit approval. Keep the dep list tight.
- **No emojis** in source unless asked.
