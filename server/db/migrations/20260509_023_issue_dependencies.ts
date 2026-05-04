import type { Knex } from 'knex';

/**
 * Slice 8 — directed Task→Task "depends on" links.
 *
 *   blocker_id  — the predecessor (must end before dependent can start)
 *   dependent_id — the successor (depends on the blocker)
 *
 * The "Task only" constraint is enforced at the service layer
 * (cross-type or cross-issue-class invariants are awkward to express
 * with a CHECK). DAG-ness is enforced at write time via a recursive
 * CTE in the service.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('issue_dependencies', (t) => {
    t.uuid('blocker_id').notNullable().references('id').inTable('issues').onDelete('CASCADE');
    t.uuid('dependent_id').notNullable().references('id').inTable('issues').onDelete('CASCADE');
    t.primary(['blocker_id', 'dependent_id']);
    t.index('blocker_id');
    t.index('dependent_id');
  });

  await knex.raw(`
    ALTER TABLE issue_dependencies
    ADD CONSTRAINT issue_dependencies_no_self_chk
    CHECK (blocker_id <> dependent_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('issue_dependencies');
}
