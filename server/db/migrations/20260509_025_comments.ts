/**
 * Comments table.
 *
 * Design notes:
 *   - `attachment_ids` stores `attachment:<uuid>` prefixed refs, NOT raw
 *     uuids. See `src/lib/attachmentRefs.ts` for the canonical
 *     parse/build helpers. The prefix keeps the column self-describing and
 *     avoids future collisions with other ref types in similar text[] cols.
 *   - Files are NOT cascade-deleted when a comment is deleted. The files
 *     table is independent; a file may be referenced by multiple comments
 *     or by an issue description (slice C). Callers that want to free
 *     storage must delete files explicitly via the files API.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('comments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    t.uuid('tenant_id')
      .notNullable()
      .references('id')
      .inTable('tenants')
      .onDelete('CASCADE');

    t.uuid('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');

    t.uuid('issue_id')
      .notNullable()
      .references('id')
      .inTable('issues')
      .onDelete('CASCADE');

    // Nullable so a deleted user (when user-delete lands) doesn't
    // cascade-blow away their comments.
    t.uuid('author_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    t.text('body').notNullable();

    // attachment:<uuid> refs — see design notes at top of file.
    t.specificType('attachment_ids', 'text[]')
      .notNullable()
      .defaultTo(knex.raw("'{}'::text[]"));

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // updated_at is nullable — null means never edited.
    t.timestamp('updated_at', { useTz: true }).nullable();

    // Primary list query: comments for an issue, oldest-first.
    t.index(['issue_id', 'created_at']);
    t.index('workspace_id');
  });

  // No blank comments — body must be non-empty.
  await knex.raw(`
    ALTER TABLE comments
    ADD CONSTRAINT comments_body_chk
    CHECK (body <> '')
  `);

  // GIN index for future "find all comments referencing file X" queries.
  await knex.raw(`
    CREATE INDEX comments_attachment_ids_gin
    ON comments USING GIN (attachment_ids)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('comments');
}
