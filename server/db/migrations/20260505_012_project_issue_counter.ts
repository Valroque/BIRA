import type { Knex } from 'knex';

/**
 * Per-project monotonic counter used by createIssue to allocate the
 * `seq` portion of the human-readable issue key (`{projectKey}-{seq}`).
 *
 * The counter is bumped inside the same transaction as the issue insert
 * via `UPDATE ... RETURNING` so concurrent createIssue calls within a
 * single project produce distinct sequential ids with no gaps.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (t) => {
    t.integer('next_issue_number').notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (t) => {
    t.dropColumn('next_issue_number');
  });
}
