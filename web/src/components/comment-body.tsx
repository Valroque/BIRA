// Comment body renderer.
//
// Comment bodies are plain text plus typed mention tokens —
//   `@[user:<uuid>]` and `@[team:<uuid>]`
// — inserted by the MentionPicker. The BE persists the body verbatim so
// the tokens survive every round-trip.
//
// This component:
//   1. Tokenises the body — splitting on the mention regex and walking the
//      rest as plain text segments.
//   2. Resolves each token's UUID via `useUsers()` / `useTeams()` and
//      renders a small `<MentionChip>` with the display name.
//   3. Falls back to "Unknown user" / "Unknown team" when the lookup
//      fails — UUIDs never render. (See project_uuid_identity_in_fe.md.)
//
// Text segments are rendered as plain spans with `white-space: pre-wrap`
// so newlines survive without splitting the chip onto its own line. We
// intentionally don't pipe the segments through the Slack-flavoured
// rich-text renderer here — the priority is keeping mentions inline with
// the surrounding prose. If a comment ever needs fenced code, that's a
// follow-up (it'd need a renderer that mixes block + inline output).

import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { useUsers, UNKNOWN_USER_LABEL } from '../state/users';
import { useTeams } from '../state/teams';

// Same regex shape as `server/src/lib/parseMentions.ts` — `@[type:uuid]`.
// The capture groups isolate the type and the uuid so the chip can be
// rendered inline without re-parsing.
const MENTION_RE = /@\[(user|team):([0-9a-f-]{36})\]/gi;

const UNKNOWN_TEAM_LABEL = 'Unknown team';

interface CommentBodyProps {
  body: string;
}

export function CommentBody({ body }: CommentBodyProps) {
  const { getUser, resolveUser } = useUsers();
  const { getTeam } = useTeams();

  // Collect every user uuid mentioned in this body once, then ask the
  // provider to resolve each on mount / body change. The provider dedupes
  // and caches known-unknowns, so this is cheap to call repeatedly. Done
  // in an effect (not inline during render) because resolveUser triggers
  // state updates and React forbids those from render functions.
  const mentionedUserIds = useMemo(() => {
    if (!body) return [] as string[];
    const ids: string[] = [];
    const re = new RegExp(MENTION_RE.source, MENTION_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m[1].toLowerCase() === 'user') ids.push(m[2]);
    }
    return ids;
  }, [body]);
  useEffect(() => {
    for (const id of mentionedUserIds) resolveUser(id);
  }, [mentionedUserIds, resolveUser]);

  if (!body) return null;

  const segments: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  // Reset before iterating; the global regex carries state across calls.
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push(
        <Fragment key={`t-${key++}`}>{body.slice(lastIndex, match.index)}</Fragment>,
      );
    }

    const type = match[1].toLowerCase() as 'user' | 'team';
    const id = match[2];
    let label: string;
    if (type === 'user') {
      label = getUser(id)?.displayName ?? UNKNOWN_USER_LABEL;
    } else {
      // `getTeam` accepts slug or UUID — passing the uuid resolves
      // teams without a separate `getTeamById` helper.
      label = getTeam(id)?.name ?? UNKNOWN_TEAM_LABEL;
    }

    segments.push(<MentionChip key={`m-${key++}`} type={type} label={label} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    segments.push(<Fragment key={`t-${key++}`}>{body.slice(lastIndex)}</Fragment>);
  }

  // `pre-wrap` so multi-line bodies keep their newlines without forcing
  // each segment onto its own block.
  return <span style={{ whiteSpace: 'pre-wrap' }}>{segments}</span>;
}

interface MentionChipProps {
  type: 'user' | 'team';
  label: string;
}

function MentionChip({ type, label }: MentionChipProps) {
  // Subtle pill, distinct from prose. Token colours follow the rest of the
  // design system. Teams reuse the same chrome — visually distinguishing
  // user vs. team is delegated to the label itself for now (the picker
  // already renders them with separate sublabels).
  const isUnknown =
    label === UNKNOWN_USER_LABEL || label === UNKNOWN_TEAM_LABEL;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        padding: '0 5px',
        borderRadius: 4,
        background: isUnknown ? 'var(--bg-muted)' : 'var(--accent-muted)',
        color: isUnknown ? 'var(--fg-muted)' : 'var(--accent-active)',
        fontWeight: 500,
        fontSize: '0.95em',
        lineHeight: 'inherit',
        whiteSpace: 'nowrap',
      }}
      data-mention-type={type}
    >
      @{label}
    </span>
  );
}
