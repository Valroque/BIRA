/**
 * Shared helpers for the `attachment:<uuid>` ref format used by comments
 * (and future issue-description attachments in slice C).
 *
 * The prefix makes text[] columns self-describing and avoids collisions
 * with other ref types that might appear in similar columns later.
 */

const ATTACHMENT_REF_RE =
  /^attachment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Parse a ref string → the file uuid, or null if the format is invalid.
 */
export function parseAttachmentRef(ref: string): string | null {
  const m = ATTACHMENT_REF_RE.exec(ref);
  return m ? m[1] : null;
}

/**
 * Build a ref string from a file uuid.
 */
export function buildAttachmentRef(fileId: string): string {
  return `attachment:${fileId}`;
}

/**
 * Extract file uuids from a list of refs, silently skipping any entries
 * that don't match the expected format.
 */
export function extractFileIds(refs: string[]): string[] {
  return refs.map(parseAttachmentRef).filter((id): id is string => id !== null);
}
