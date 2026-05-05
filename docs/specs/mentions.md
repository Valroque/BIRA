# Mentions in comments — spec

Status: **draft, approved 2026-05-05.** Lifts the prior "no @mentions" v1
constraint. Notifications stay out of scope — chips render, recipients
aren't notified yet.

For the *why* see the [decision log entry](../decisions.md) dated
2026-05-05.

---

## Scope

**In scope (v1)**

- Tag users and teams in **comment bodies** via `@` trigger.
- Auto-link issue references (`COMET-42`) inline at render time. No
  trigger character — they're already keyed and unambiguous.
- Mentionable-search API for the picker.
- Typed-token storage so the body can grow more entity types later
  without a schema change.

**Out of scope (deferred)**

- Notifications / inbox fan-out. Chips render but no one gets pinged.
  When notifications land, the existing `Comment.mentions` array is
  the fan-out source — no body re-parse needed.
- Mentions in issue **title** or **description** (comments only).
- `@everyone`, `@here`.
- Mentioning attachments, projects, or arbitrary entities. Storage is
  forward-compatible; UI surfacing is not in v1.
- Mention escape syntax (`\@`).

---

## Token format

Mentions are stored as typed tokens embedded in the comment body:

```
@[user:<uuid>]
@[team:<uuid>]
```

Types in v1: `user`, `team`. The format is forward-compatible for
`issue`, `attachment`, `project` without a schema change.

**Why typed.** Several entity classes in BIRA share UUID space
(workspace members, teams, attachments, etc.). A bare `@<uuid>` is
ambiguous to the renderer and to any future fan-out logic. The type
prefix lets the renderer dispatch on type and lets future code reason
about a comment's references without joining against every table.

Issue references are **not** stored as tokens — they remain plain
text (`COMET-42`) and are linkified at render time. They're already
human-readable, project-scoped, and survive copy-paste between tools.

---

## Storage

When the comments backend lands, the comment row carries:

| column      | type     | notes                                              |
|-------------|----------|----------------------------------------------------|
| id          | uuid     | pk                                                 |
| issue_id    | uuid     | fk → issues                                        |
| author_id   | uuid     | fk → users                                         |
| body        | text     | contains `@[type:uuid]` tokens                     |
| mentions    | jsonb    | denormalised: `Array<{type, id}>`                  |
| created_at  | timestamptz |                                                 |
| updated_at  | timestamptz |                                                 |

`mentions` is derived from `body` on every insert/update by the
usecase layer (single source of truth is the body; `mentions` is a
read index). Keeping it denormalised lets future notification fan-out
query without re-parsing every comment.

---

## API

### `GET /api/v1/tenants/:tenant/workspaces/:workspace/mentionables/search`

Auth: any workspace member (`read+`). Scope: workspace-only — no
tenant-wide search, no cross-workspace results.

**Query params**

| param  | type    | required | default       | notes                                              |
|--------|---------|----------|---------------|----------------------------------------------------|
| `q`    | string  | yes      | —             | min 1 char; trimmed; case-insensitive              |
| `types`| csv     | no       | `user,team`   | subset of `user,team`                              |
| `limit`| int     | no       | `8`           | max `20`                                           |

**Matching**

- `user`: prefix match against `first_name`, `last_name`, `email`.
- `team`: prefix match against `name`.

**Ranking** (descending priority):

1. Exact prefix on `first_name` or `last_name` (users) / `name` (teams).
2. Prefix anywhere in any matched field.
3. Substring elsewhere.

Within a tier, alphabetical by `label`. Stable. Truncate to `limit`.

**Response**

```ts
type MentionableHit =
  | { type: 'user'; id: string; label: string; sublabel: string; avatarUrl?: string }
  | { type: 'team'; id: string; label: string; sublabel: string }

// user.label    = "First Last"
// user.sublabel = email
// team.label    = team name
// team.sublabel = "N members"
```

One endpoint, mixed result list. The picker decides how to render each
type. Future entity types add a new variant without breaking callers.

---

## FE behaviour

### Trigger

- `@` after whitespace or at the start of the input opens the picker.
- Picker closes on Escape, on selection, or when the cursor leaves the
  active token.
- Debounce 150ms. Min query length 1.
- Keyboard: ↑ ↓ to move, Enter / Tab to select, Esc to dismiss.
- Mouse: click selects.

### Picker UI

- Up to 8 results. Mixed users + teams, ranked by the API.
- Each row: type icon + `label` + muted `sublabel`. Avatar for users.
- Reuse `Avatar` and team-icon primitives from `web/src/components/`;
  do not introduce a new chip style.

### Insertion

On select, the input replaces the active `@<query>` span with a
non-editable chip. The serialised body sent to the API contains
`@[user:<uuid>]` / `@[team:<uuid>]`; the chip is purely a render
artifact in the editor.

### Rendering a stored comment

Walk the body, split into runs:

- Plain text → render as text. Run the issue-key regex
  `\b([A-Z]{1,10}-\d+)\b` against each text run; if the match
  corresponds to a known project key in this workspace, render as a
  `<Link>` to the issue. Cache the project-key set per workspace.
- `@[user:<uuid>]` → resolve via the mentionable cache → user chip.
- `@[team:<uuid>]` → resolve → team chip.
- Unresolved id (deleted user, removed team, no longer accessible) →
  greyed chip labelled "Removed user" / "Removed team" with a tooltip.

The mentionable cache is a per-workspace `Map<uuid, MentionableHit>`
populated lazily — the renderer collects unresolved ids and batches a
lookup. Avoids per-comment N+1.

---

## Permissions

- Anyone with `write` on the issue can post a comment containing
  mentions.
- Anyone with `read+` on the workspace can be mentioned. We do **not**
  filter the picker by project visibility — mentioning someone without
  project access is allowed; whether they get notified about it is the
  notifications phase's problem.
- No mention-edit endpoint in v1: editing a comment edits the body;
  `mentions[]` is recomputed by the usecase.

---

## Phasing

This work lands in three slices, gated by the comments backend phase
(not yet started).

1. **Slice A (can land before comments).** Mentionable-search API +
   types in `server/`. FE picker component built standalone (Storybook
   / dev page). No wiring into a real composer yet.
2. **Slice B (with the comments backend).** Comment table with
   `mentions` jsonb. Body parser + denormaliser in the comments
   usecase. FE comment composer (currently a `<div>` placeholder)
   becomes a real editor and uses the picker. Renderer parses tokens
   and renders chips.
3. **Slice C (notifications phase, not scoped here).** Fan-out from
   `Comment.mentions` to notification recipients.

The constraint update only unblocks slices A and B. Slice C still
sits behind the notifications-out-of-scope rule.

---

## Open follow-ups (post-v1)

- Mentions in issue title / description (same token format, different
  storage column).
- `@everyone`, `@here`.
- Mention escape syntax for code blocks / quoted text.
- Visibility-aware picker (hide users without project access, with an
  "invite to project" affordance).
- Notification fan-out from `mentions[]`.
