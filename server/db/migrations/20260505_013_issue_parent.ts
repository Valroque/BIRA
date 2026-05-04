import type { Knex } from 'knex';

/**
 * Slice 2 — issue hierarchy.
 *
 * Adds a single self-referencing FK on `issues` to denote the parent.
 * Children are derived at read time (`WHERE parent_issue_id = …`); we
 * intentionally do NOT denormalise a `children` array on the row — the
 * BE is the canonical source of truth and a single index makes the
 * lookup cheap.
 *
 * ON DELETE SET NULL: if a parent is removed (when delete is wired up
 * in a later slice) children become orphans rather than cascade-nuking
 * Stories/Tasks/Bugs underneath an Epic — the v1-constraints rules
 * forbid losing leaf work just because someone tidied an Epic away.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.uuid('parent_issue_id')
      .nullable()
      .references('id')
      .inTable('issues')
      .onDelete('SET NULL');
    t.index('parent_issue_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('issues', (t) => {
    t.dropColumn('parent_issue_id');
  });
}
