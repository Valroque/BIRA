// Comment adapter.
//
// BE shape (from `server/src/usecases/comments/commentView.ts → CommentView`):
//   {
//     id, issueId, authorUserId, body,
//     attachmentIds: string[],            // raw `attachment:<uuid>` refs
//     attachments: FileView[],            // expanded views
//     mentions: Array<{ type, id }>,      // parsed from body server-side
//     createdAt, updatedAt
//   }
//
// FE entity:
//   - UUIDs (`id`, `authorUserId`) are kept for mutations + author-gating
//     but never rendered. Author display is resolved from `useUsers()` at
//     the boundary; missing → 'Unknown user' (per UUID-identity rule).
//   - `mentions` come from the BE for completeness, but the renderer is
//     driven off the body string itself (the BE re-parses on every write,
//     so the body is the source of truth).
//   - `attachments` is left as the raw FileView shape — the comment list
//     just needs `id`/`name`/`readUrl`/`size`/`mimeType` to render the
//     thumbnail row, and that's already what BE returns.

import { requireField, expectField } from '../lib/adapterContract';

// ---------------------------------------------------------------------------
// Raw BE shape
// ---------------------------------------------------------------------------

export interface RawCommentMention {
  type: string;
  id: string;
}

export interface RawCommentAttachment {
  id: string;
  /** BE returns `filename` (canonical FileView shape). `name` tolerated for
   *  forward compatibility with any caller that aliases the field. */
  filename?: string;
  name?: string;
  /** BE returns `mime`. `mimeType` tolerated for the same reason. */
  mime?: string;
  mimeType?: string;
  readUrl: string;
  size: number;
}

export interface RawComment {
  id: string;
  issueId: string;
  authorUserId: string | null;
  body: string;
  attachmentIds: string[];
  attachments: RawCommentAttachment[];
  mentions: RawCommentMention[];
  createdAt: string;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// FE entity
// ---------------------------------------------------------------------------

export interface CommentMention {
  type: 'user' | 'team';
  /** UUID of the mentioned user/team. Never rendered as-is. */
  id: string;
}

export interface CommentAttachmentView {
  id: string;
  name: string;
  readUrl: string;
  size: number;
  mimeType: string;
}

export interface Comment {
  /** UUID — primary identity. Never rendered. */
  id: string;
  /** UUID of the parent issue. Never rendered. */
  issueId: string;
  /** UUID of the author. Resolved to a name via `useUsers()`. Null = system. */
  authorUserId: string | null;
  /** Raw comment body — may contain `@[user:<uuid>]` / `@[team:<uuid>]` tokens. */
  body: string;
  attachmentIds: string[];
  attachments: CommentAttachmentView[];
  mentions: CommentMention[];
  createdAt: string;
  /** Set when the comment has been edited; null otherwise. */
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function adaptMention(raw: RawCommentMention, commentId: string): CommentMention | null {
  const type = raw.type === 'user' || raw.type === 'team' ? raw.type : null;
  if (!type) return null;
  const id = requireField(raw.id, '', {
    entity: 'CommentMention', field: 'id', id: commentId,
  });
  if (!id) return null;
  return { type, id };
}

function adaptAttachment(raw: RawCommentAttachment, commentId: string): CommentAttachmentView {
  const id = requireField(raw.id, '', {
    entity: 'CommentAttachment', field: 'id', id: commentId,
  });
  const name = raw.filename ?? raw.name ?? '';
  const mimeType = raw.mime ?? raw.mimeType ?? '';
  return {
    id,
    name: expectField(name, '', {
      entity: 'CommentAttachment', field: 'filename', id: commentId,
    }),
    readUrl: expectField(raw.readUrl ?? '', '', {
      entity: 'CommentAttachment', field: 'readUrl', id: commentId,
    }),
    size: typeof raw.size === 'number' ? raw.size : 0,
    mimeType: expectField(mimeType, '', {
      entity: 'CommentAttachment', field: 'mime', id: commentId,
    }),
  };
}

export function adaptComment(raw: RawComment): Comment {
  const id = requireField(raw.id, '', { entity: 'Comment', field: 'id' });
  const issueId = requireField(raw.issueId, '', {
    entity: 'Comment', field: 'issueId', id,
  });
  const body = expectField(raw.body ?? '', '', { entity: 'Comment', field: 'body', id });

  const rawMentions = Array.isArray(raw.mentions) ? raw.mentions : [];
  const mentions: CommentMention[] = [];
  for (const m of rawMentions) {
    const adapted = adaptMention(m, id);
    if (adapted) mentions.push(adapted);
  }

  const rawAttachmentIds = Array.isArray(raw.attachmentIds) ? raw.attachmentIds : [];
  const rawAttachments = Array.isArray(raw.attachments) ? raw.attachments : [];

  return {
    id,
    issueId,
    authorUserId: raw.authorUserId ?? null,
    body,
    attachmentIds: rawAttachmentIds,
    attachments: rawAttachments.map((a) => adaptAttachment(a, id)),
    mentions,
    createdAt: expectField(raw.createdAt ?? '', '', {
      entity: 'Comment', field: 'createdAt', id,
    }),
    updatedAt: raw.updatedAt ?? null,
  };
}
