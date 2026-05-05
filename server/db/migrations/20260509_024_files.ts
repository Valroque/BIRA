/**
 * Migration: files + file_blobs
 *
 * Design notes:
 *
 * (a) No FK from file_blobs.file_id → files.id
 *     The upload flow writes the blob and the file metadata inside a single
 *     transaction, but the driver writes the blob first (returning a
 *     storageKey) and the usecase writes the metadata row second.  Adding a
 *     real FK would require the files row to exist before the blob, creating
 *     a chicken-and-egg ordering problem.  Lifecycle is managed at the app
 *     layer — deleteFile always removes both rows in one transaction so the
 *     tables can never diverge in practice.
 *
 * (b) Files do NOT back-reference their consumers (issues, comments, …)
 *     This is a deliberate exception to BIRA's general symmetric-storage
 *     rule (v1-constraints.md §Product "Symmetric relation storage").
 *     Consumers reference files by id; files carry no inverse list.
 *     Rationale: a file can be attached to multiple different consumers
 *     (description + comment on the same issue) and attachment ownership
 *     is tracked in the consumer's schema, not here.  A back-reference
 *     array on files would need to know about every consumer table and
 *     would have to be updated on every attach/detach operation across the
 *     codebase.  The asymmetry is intentional and documented.
 *
 * (c) 10 MB upper bound at the DB layer
 *     The CHECK constraint on files.size mirrors the 10 MB multer cap
 *     applied at the route level (uploadFile usecase also validates
 *     bytes.length > 0).  Both guards must agree; changing one means
 *     changing the other.  10 MB = 10 * 1024 * 1024 = 10_485_760 bytes.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('files', (t) => {
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

    // Nullable so a user deletion (when wired) doesn't cascade-delete the
    // file itself; we just lose the uploader attribution.
    t.uuid('uploader_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    t.string('mime', 255).notNullable();
    t.bigint('size').notNullable();
    t.specificType('sha256', 'char(64)').notNullable();
    t.string('filename', 500).notNullable();
    // Opaque handle understood only by the active FileStore driver.
    // For the PG driver this is a UUID (but NOT files.id — a separate
    // uuid generated at put-time so the two rows can be written
    // order-independently within the same transaction).
    t.text('storage_key').notNullable().unique();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).nullable();

    t.index('workspace_id');
    t.index('tenant_id');
    t.index('sha256');
  });

  // size must be >= 0 and <= 10 MB (10 * 1024 * 1024 = 10_485_760).
  // Mirrors the multer file-size limit applied at the route layer.
  await knex.raw(`
    ALTER TABLE files
    ADD CONSTRAINT files_size_chk
    CHECK (size >= 0 AND size <= 10485760)
  `);

  await knex.schema.createTable('file_blobs', (t) => {
    // PRIMARY KEY only — intentionally NOT a FK to files(id).
    // See note (a) at the top of this file.
    t.uuid('file_id').primary();
    t.binary('bytes').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('file_blobs');
  await knex.schema.dropTableIfExists('files');
}
