/**
 * Slice C — issue description attachments.
 *
 * Adds `description_attachment_ids text[]` to the issues table so issue
 * descriptions can carry typed file refs alongside the existing
 * `description` text column. Mirrors the `attachment_ids` shape on the
 * comments table (slice B / migration 025).
 *
 * Design notes:
 *   - Refs use the `attachment:<uuid>` format. See
 *     `src/lib/attachmentRefs.ts` for the canonical parse/build helpers
 *     and `src/lib/validateAttachmentRefs.ts` for the workspace-scoped
 *     existence check (write path only — reads silently filter dangling
 *     refs).
 *   - Files are NOT cascade-deleted when an issue is deleted. The files
 *     table is independent — a single file may be referenced from
 *     multiple issue descriptions and/or comments. Callers that want to
 *     free storage must delete files explicitly via the files API.
 *   - The GIN index supports future "find all issues whose description
 *     references file X" queries (mirrors `comments_attachment_ids_gin`).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.specificType('description_attachment_ids', 'text[]')
      .notNullable()
      .defaultTo(knex.raw("'{}'::text[]"));
  });

  await knex.raw(`
    CREATE INDEX issues_description_attachment_ids_gin
    ON issues USING GIN (description_attachment_ids)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS issues_description_attachment_ids_gin');
  await knex.schema.alterTable('issues', (t) => {
    t.dropColumn('description_attachment_ids');
  });
}
